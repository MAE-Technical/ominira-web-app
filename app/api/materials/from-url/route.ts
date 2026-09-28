import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { bucketPublicUrl, STORAGE_BUCKET } from "@/lib/storage/config";
import { isSafeToFetch, FETCH_TIMEOUT_MS, SAFE_FETCH_USER_AGENT } from "@/lib/net/safeFetch";
import { slugify } from "@/lib/book/epubParser";

async function uniqueSlug(baseTitle: string): Promise<string> {
  const admin = getSupabaseAdminClient();
  const base = slugify(baseTitle) || "untitled";
  let candidate = base;
  for (let attempt = 1; attempt < 50; attempt++) {
    const { data } = await admin.from("materials").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${attempt + 1}`;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

/**
 * `POST /api/materials/from-url` — turns a URL into a `material_type:
 * "webpage"` row, per document-readers-spec.md § 4. Unlike PDF/DOCX/EPUB (a
 * reader picks a file), there's no client-side file to upload here: the
 * server fetches and extracts the page itself, same SSRF-safe-fetch pattern
 * as link-preview (never fetch a private/internal address), never a
 * client-side fetch of a third-party page (CORS would block it anyway, and
 * even a same-origin proxy wouldn't give the DOM access Readability needs).
 *
 * Called on demand, not from a dedicated "add a link" UI — LinkPreviewCard
 * calls this the first time a reader clicks a plain link preview (any
 * material_type/visibility, not just this route's own), auto-ingesting it
 * into the in-app reader. That means the same URL can arrive here many
 * times over (every reader's first click on every note that links it) — the
 * dedupe check below is what makes that free: an already-ingested URL
 * returns the existing row straight away, no re-fetch/re-extract/re-upload.
 */
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const titleOverride = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;
  const authorOverride = typeof body?.author === "string" && body.author.trim() ? body.author.trim() : null;
  const visibility = body?.visibility === "public" ? "public" : "personal";

  if (!url) return validationError("A url is required.", "url");

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from("materials")
    .select("id, slug, title, author")
    .eq("material_type", "webpage")
    .eq("source_url", url)
    .eq("status", "published")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ materialId: existing.id, slug: existing.slug, title: existing.title, author: existing.author });
  }

  if (!(await isSafeToFetch(url))) return validationError("This URL can't be fetched.", "url");

  let html: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": SAFE_FETCH_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html")) return validationError("Couldn't fetch that page.", "url");
    html = await res.text();
  } catch {
    return validationError("Couldn't fetch that page.", "url");
  }

  const { document } = parseHTML(html, url);
  // Readability's own parse() doesn't return a lead image — grab og:image
  // (if any) before parse() mutates/strips the DOM.
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() || null;
  let leadImageUrl: string | null = null;
  if (ogImage) {
    try {
      leadImageUrl = new URL(ogImage, url).toString();
    } catch {
      leadImageUrl = null;
    }
  }

  const article = new Readability(document).parse();
  // Not an article — a login page, an app shell, a paywall stub, etc. Don't
  // create a half-broken materials row (spec § 4 step 4); the client
  // surfaces this inline the same way a failed EPUB/PDF parse does.
  if (!article || !article.content || !article.title) {
    return validationError("Couldn't extract an article from that page — it may not be readable content.", "url");
  }

  const uploadId = randomUUID();
  const htmlPath = `uploads/${reader.readerId}/${uploadId}.html`;

  const { data: pending, error: pendingError } = await admin
    .from("pending_materials")
    .insert({
      submission_type: "external_url",
      title: titleOverride ?? article.title,
      author: authorOverride ?? article.byline ?? "",
      reader_id: reader.readerId,
      source_url: url,
    })
    .select("id")
    .single();
  if (pendingError || !pending) return validationError("Could not record this submission.");

  const { error: htmlUploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(htmlPath, article.content, { contentType: "text/html", upsert: false });
  if (htmlUploadError) return validationError("Could not upload the extracted article.");

  const slug = await uniqueSlug(titleOverride ?? article.title);
  const { data: material, error: materialError } = await admin
    .from("materials")
    .insert({
      slug,
      material_type: "webpage",
      title: titleOverride ?? article.title,
      author: authorOverride ?? article.byline ?? "",
      cover_url: leadImageUrl,
      article_html_storage_path: bucketPublicUrl(STORAGE_BUCKET, htmlPath),
      source_url: url,
      status: "published",
      uploaded_by: reader.readerId,
      visibility,
    })
    .select("id, slug, title, author")
    .single();
  if (materialError || !material) return validationError("Could not create the library entry.");

  await admin.from("pending_materials").update({ material_id: material.id, status: "approved" }).eq("id", pending.id);

  return NextResponse.json(
    { materialId: material.id, slug: material.slug, title: material.title, author: material.author },
    { status: 201 }
  );
}
