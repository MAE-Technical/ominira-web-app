import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { bucketPublicUrl, STORAGE_BUCKET } from "@/lib/storage/config";
import { parseBookDocument } from "@/lib/book/schema";
import { slugify } from "@/lib/book/epubParser";

const EXTENSION_BY_MATERIAL_TYPE: Record<string, string> = { book: "epub", pdf: "pdf", docx: "docx" };

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
 * Single upload endpoint behind HomeComposer's "Add a book" and the library's
 * "add a book" flow (reader-uploads-spec.md § 3's DRY note — one server path
 * for both). The client has already parsed and locally validated the file
 * (lib/materials/useUploadBook.ts) before it ever reaches here; this route
 * re-validates independently (never trusts a client-supplied JSON blob just
 * because it claims to be schema-valid — same rule loadBookDocuments/
 * projectMaterial apply to every fetched BookDocument) before anything is
 * written to storage or the database.
 *
 * Reader uploads publish immediately (no editorial review queue — see
 * migrations/20260927_reader_uploads.sql's RLS policy comment); `visibility`
 * (default `personal`) is what actually gates who can see it, not `status`.
 */
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const form = await request.formData();
  const sourceFile = form.get("sourceFile");
  const materialType = form.get("materialType");
  const title = form.get("title");
  const author = form.get("author");
  const visibilityRaw = form.get("visibility");

  if (!(sourceFile instanceof File)) return validationError("A source file is required.", "sourceFile");
  if (materialType !== "book" && materialType !== "pdf" && materialType !== "docx") {
    return validationError("materialType must be 'book', 'pdf', or 'docx'.", "materialType");
  }
  if (typeof title !== "string" || !title.trim()) return validationError("A title is required.", "title");
  if (typeof author !== "string") return validationError("Author must be a string.", "author");
  const visibility = visibilityRaw === "public" ? "public" : "personal";

  const admin = getSupabaseAdminClient();
  const uploadId = randomUUID();
  const prefix = `uploads/${reader.readerId}/${uploadId}`;
  const sourceExt = EXTENSION_BY_MATERIAL_TYPE[materialType];
  const sourcePath = `${prefix}.${sourceExt}`;
  const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer());

  const { data: pending, error: pendingError } = await admin
    .from("pending_materials")
    .insert({
      submission_type: "upload",
      title: title.trim(),
      author: author.trim(),
      reader_id: reader.readerId,
      storage_path: sourcePath,
      original_filename: sourceFile.name,
      mime_type: sourceFile.type || null,
      file_size_bytes: sourceBytes.byteLength,
    })
    .select("id")
    .single();
  if (pendingError || !pending) return validationError("Could not record this submission.");

  let jsonStoragePath: string | null = null;
  let pageCountEstimate: number | null = null;
  let coverUrl: string | null = null;

  if (materialType === "book") {
    const documentJsonRaw = form.get("documentJson");
    if (typeof documentJsonRaw !== "string") return validationError("Parsed book JSON is required.", "documentJson");
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(documentJsonRaw);
    } catch {
      return validationError("Parsed book JSON is not valid JSON.", "documentJson");
    }
    const validated = parseBookDocument(parsedRaw);
    if (!validated.ok) return validationError(`Parsed book failed schema validation: ${validated.error.message}`, "documentJson");

    const jsonPath = `${prefix}.json`;
    const { error: jsonUploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(jsonPath, JSON.stringify(validated.data), { contentType: "application/json", upsert: false });
    if (jsonUploadError) return validationError("Could not upload the parsed book.");
    jsonStoragePath = bucketPublicUrl(STORAGE_BUCKET, jsonPath);
    pageCountEstimate = validated.data.metadata.pageCountEstimate ?? null;
  } else if (materialType === "pdf") {
    const pageCountRaw = form.get("pageCount");
    pageCountEstimate = typeof pageCountRaw === "string" ? Number(pageCountRaw) || null : null;
    const thumbnail = form.get("thumbnail");
    if (thumbnail instanceof File) {
      const thumbPath = `${prefix}-thumbnail.png`;
      const thumbBytes = new Uint8Array(await thumbnail.arrayBuffer());
      const { error: thumbError } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, thumbBytes, { contentType: "image/png", upsert: false });
      if (!thumbError) coverUrl = bucketPublicUrl(STORAGE_BUCKET, thumbPath);
    }
  }
  // materialType === "docx": metadata-only, no page count or cover (see
  // docxParser.ts) — pageCountEstimate/coverUrl stay null.

  const { error: sourceUploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(sourcePath, sourceBytes, { contentType: sourceFile.type || undefined, upsert: false });
  if (sourceUploadError) return validationError("Could not upload the source file.");
  const sourceUrl = bucketPublicUrl(STORAGE_BUCKET, sourcePath);

  const slug = await uniqueSlug(title);
  const { data: material, error: materialError } = await admin
    .from("materials")
    .insert({
      slug,
      material_type: materialType,
      title: title.trim(),
      author: author.trim(),
      cover_url: coverUrl,
      json_storage_path: jsonStoragePath,
      source_url: sourceUrl,
      page_count_estimate: pageCountEstimate,
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
