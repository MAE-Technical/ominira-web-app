import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { validationError } from "@/lib/api/errors";
import { bucketPublicUrl, resolveStorageUrl, STORAGE_BUCKET } from "@/lib/storage/config";
import { isSafeToFetch, SAFE_FETCH_USER_AGENT } from "@/lib/net/safeFetch";
import { slugify } from "@/lib/book/epubParser";

// Longer than link-preview's FETCH_TIMEOUT_MS: that one only decorates a
// card, while this is the reader's actual click waiting on a full article
// page, which a slow news site can take well past 5s to serve.
const INGEST_TIMEOUT_MS = 10_000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

async function fetchHtml(url: string, userAgent: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractArticle(html: string, url: string) {
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
  if (!article || !article.content || !article.title) return null;
  return { article: { title: article.title, content: article.content, byline: article.byline }, leadImageUrl };
}

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
  // Optional, not required: opening an article is reading, and reading
  // needs no account (same as any catalogue book). A signed-in reader is
  // recorded as the uploader; a signed-out one — or a device whose stored
  // token has gone stale, which used to 401 here and dead-end the click —
  // just ingests an unowned public article.
  const reader = await getAuthenticatedReader(request);
  const ownerFolder = reader?.readerId ?? "web";

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const titleOverride = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null;
  const authorOverride = typeof body?.author === "string" && body.author.trim() ? body.author.trim() : null;
  // "personal" needs an owner to be personal *to* — without one it's public.
  const visibility = reader && body?.visibility !== "public" ? "personal" : "public";

  if (!url) return validationError("A url is required.", "url");

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from("materials")
    .select("id, slug, title, author, article_html_storage_path")
    .eq("material_type", "webpage")
    .eq("source_url", url)
    .eq("status", "published")
    .maybeSingle();
  // The dedupe only holds while the extracted HTML it points at still exists.
  // A row whose object has gone (removed from Storage directly, outside any
  // delete route) otherwise short-circuits here forever, and every reader's
  // click lands on a reader that 400s loading it — so a missing object falls
  // through to re-extract and heal this same row instead of returning it.
  const existingPayload = existing && {
    materialId: existing.id,
    slug: existing.slug,
    title: existing.title,
    author: existing.author,
  };
  if (existing?.article_html_storage_path) {
    const head = await fetch(resolveStorageUrl(existing.article_html_storage_path), { method: "HEAD" }).catch(() => null);
    if (head?.ok) return NextResponse.json(existingPayload);
  }

  if (!(await isSafeToFetch(url))) return validationError("This URL can't be fetched.", "url");

  // Crawler UA first (the link-preview convention — some sites only render
  // real content for one), then a plain browser UA: plenty of article sites
  // 403 or serve a bot-wall stub to anything that announces itself as a
  // crawler, and a failed ingest here dead-ends the reader's click (see
  // LinkPreviewCard). A fetch that *worked* but yielded no article gets the
  // retry too, since a bot-wall stub is exactly that.
  let fetched = false;
  let extracted: ReturnType<typeof extractArticle> = null;
  for (const userAgent of [SAFE_FETCH_USER_AGENT, BROWSER_USER_AGENT]) {
    const html = await fetchHtml(url, userAgent);
    if (html === null) continue;
    fetched = true;
    extracted = extractArticle(html, url);
    if (extracted) break;
  }
  if (!fetched) return validationError("Couldn't fetch that page.", "url");
  // Not an article — a login page, an app shell, a paywall stub, etc. Don't
  // create a half-broken materials row (spec § 4 step 4); the client
  // surfaces this inline the same way a failed EPUB/PDF parse does.
  if (!extracted) {
    return validationError("Couldn't extract an article from that page — it may not be readable content.", "url");
  }
  const { article, leadImageUrl } = extracted;

  if (existing && existingPayload) {
    // Healing a row whose HTML went missing (see above): re-upload to a
    // fresh path and repoint the row — its id/slug stay, so every note,
    // reading position and highlight already attached to it keeps working.
    const healPath = `uploads/${ownerFolder}/${randomUUID()}.html`;
    const { error: healUploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(healPath, article.content, { contentType: "text/html", upsert: false });
    if (healUploadError) return validationError("Could not upload the extracted article.");
    const { error: healError } = await admin
      .from("materials")
      .update({ article_html_storage_path: bucketPublicUrl(STORAGE_BUCKET, healPath) })
      .eq("id", existing.id);
    if (healError) return validationError("Could not update the library entry.");
    return NextResponse.json(existingPayload);
  }

  const uploadId = randomUUID();
  const htmlPath = `uploads/${ownerFolder}/${uploadId}.html`;

  const { data: pending, error: pendingError } = await admin
    .from("pending_materials")
    .insert({
      submission_type: "external_url",
      title: titleOverride ?? article.title,
      author: authorOverride ?? article.byline ?? "",
      reader_id: reader?.readerId ?? null,
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
      uploaded_by: reader?.readerId ?? null,
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
