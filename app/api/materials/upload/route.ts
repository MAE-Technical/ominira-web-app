import { NextResponse, after } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader, isAdminReader } from "@/lib/auth/session";
import { forbidden, unauthorized, validationError } from "@/lib/api/errors";
import { readerCanUpload } from "@/lib/auth/profile";
import { cdnUrl, copyObject, deletePrefix, fetchStorageText, listObjects, putObject } from "@/lib/storage/r2";
import { parseBookDocument, type BookDocument } from "@/lib/book/schema";
import { readerObjects } from "@/lib/materials/readerFiles";
import { enrichMaterial } from "@/lib/materials/enrichMaterial";
import { buildMaterialManifest } from "@/lib/materials/manifest";
import { ADMIN_UPLOAD_LIMITS, MEMBER_UPLOAD_LIMITS, formatBytes } from "@/lib/materials/uploadLimits";
import { uniqueSlug } from "@/lib/materials/uniqueSlug";
import { isUploadMaterialType, thumbnailExtension, uploadObjectPaths } from "@/lib/materials/uploadPaths";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Step 2 (finalize) of the single upload flow behind HomeComposer's "Add a
 * book", the library's "add a book", and /admin/library/new
 * (reader-uploads-spec.md § 3's DRY note — one server path for all). Step 1,
 * POST /api/materials/upload/sign, already had the browser PUT the bytes
 * straight into R2; this route checks what actually landed there
 * (existence and real size, from R2's own listing — never the client's
 * claim), re-validates an EPUB's parsed JSON independently (never trusts a
 * client-supplied blob just because it claims to be schema-valid), and
 * only then moves the files into `books/<slug>/` (R2 copies them; no bytes
 * pass through here except the book JSON) and records the material. Any
 * rejection removes the uploaded objects.
 *
 * Paths come from uploadObjectPaths(readerId, uploadId) — the caller can only
 * ever finalize objects in their own uploads/ folder.
 *
 * Reader uploads publish immediately (no editorial review queue — see
 * migrations/20260927_reader_uploads.sql's RLS policy comment); `visibility`
 * (default `personal`) is what actually gates who can see it, not `status`.
 */
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();
  if (!(await readerCanUpload(reader))) return forbidden("Uploading books is open to approved readers only.");

  const body = (await request.json().catch(() => ({}))) as {
    uploadId?: unknown;
    materialType?: unknown;
    title?: unknown;
    author?: unknown;
    visibility?: unknown;
    pageCount?: unknown;
    thumbnailType?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
  };
  const { uploadId, materialType, title, author } = body;

  if (typeof uploadId !== "string" || !UUID_PATTERN.test(uploadId)) return validationError("uploadId is required.", "uploadId");
  if (!isUploadMaterialType(materialType)) return validationError("materialType must be 'book', 'pdf', or 'docx'.", "materialType");
  if (typeof title !== "string" || !title.trim()) return validationError("A title is required.", "title");
  if (typeof author !== "string") return validationError("Author must be a string.", "author");
  const visibility = body.visibility === "public" ? "public" : "personal";

  const admin = getSupabaseAdminClient();
  const paths = uploadObjectPaths(reader.readerId, uploadId, materialType, thumbnailExtension(body.thumbnailType));
  let bookFolder: string | null = null;
  const reject = async (message: string, field?: string) => {
    await Promise.all([deletePrefix(`${paths.folder}/`), bookFolder ? deletePrefix(bookFolder) : null]).catch(() => {});
    return validationError(message, field);
  };

  // What actually landed — one listing of this upload's folder.
  const listed = new Map((await listObjects(`${paths.folder}/`)).map((o) => [o.key, o.size]));
  const sizeOf = (path: string | null) => (path ? (listed.get(path) ?? null) : null);

  const sourceSize = sizeOf(paths.source);
  if (sourceSize === null) return reject("The file didn't finish uploading. Please try again.", "sourceFile");
  const limits = isAdminReader(reader) ? ADMIN_UPLOAD_LIMITS : MEMBER_UPLOAD_LIMITS;
  if (sourceSize > limits.maxFileSizeBytes) return reject(`Files must be under ${formatBytes(limits.maxFileSizeBytes)}.`, "sourceFile");
  const thumbPath = sizeOf(paths.thumbnail) !== null ? paths.thumbnail : null;

  const slug = await uniqueSlug(title);
  const folder = (bookFolder = `books/${slug}/`);
  // uploads/<reader>/<uploadId>/x -> books/<slug>/x
  const finalKey = (path: string) => folder + path.slice(paths.folder.length + 1);

  let jsonStoragePath: string | null = null;
  let pageCountEstimate: number | null = null;

  if (materialType === "book") {
    const jsonSize = sizeOf(paths.json);
    // The parsed JSON of an EPUB is larger than the EPUB itself (unzipped
    // text), but not unboundedly so.
    if (jsonSize === null) return reject("Parsed book JSON is required.", "documentJson");
    if (jsonSize > limits.maxFileSizeBytes * 4) return reject("Parsed book is too large.", "documentJson");

    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(await fetchStorageText(paths.json!));
    } catch {
      return reject("Could not read the parsed book.", "documentJson");
    }
    const validated = parseBookDocument(parsedRaw);
    if (!validated.ok) return reject(`Parsed book failed schema validation: ${validated.error.message}`, "documentJson");

    // Saved as the validated (normalized) document rather than the client's
    // bytes, with its cover and image URLs pointing into the book's folder;
    // beside it, the manifest and the reader's chunks (readerFiles.ts).
    jsonStoragePath = `${folder}v1/book.json`;
    const json = JSON.stringify(validated.data).replaceAll(cdnUrl(`${paths.folder}/`), cdnUrl(folder));
    const objects = [
      { key: jsonStoragePath, body: json },
      { key: `${folder}v1/manifest.json`, body: JSON.stringify(buildMaterialManifest(validated.data, slug)) },
      ...readerObjects(JSON.parse(json) as BookDocument, `${folder}v1/`),
    ];
    try {
      for (let i = 0; i < objects.length; i += 20) {
        await Promise.all(objects.slice(i, i + 20).map((o) => putObject(o.key, o.body, "application/json")));
      }
    } catch {
      return reject("Could not save the parsed book.");
    }
    pageCountEstimate = validated.data.metadata.pageCountEstimate ?? null;
  } else if (materialType === "pdf") {
    pageCountEstimate = typeof body.pageCount === "number" && body.pageCount > 0 ? Math.round(body.pageCount) : null;
  }
  // materialType === "docx": metadata-only, no page count (see docxParser.ts)
  // — pageCountEstimate stays null.

  // The source, cover and images move into the book's folder, a few copies
  // at a time; then the upload folder goes.
  const toCopy = [...listed.keys()].filter((key) => key !== paths.json);
  try {
    for (let i = 0; i < toCopy.length; i += 20) {
      await Promise.all(toCopy.slice(i, i + 20).map((key) => copyObject(key, finalKey(key))));
    }
  } catch {
    return reject("Could not save this upload. Please try again.");
  }
  await deletePrefix(`${paths.folder}/`).catch(() => {});

  const { data: pending, error: pendingError } = await admin
    .from("pending_materials")
    .insert({
      submission_type: "upload",
      title: title.trim(),
      author: author.trim(),
      reader_id: reader.readerId,
      storage_path: finalKey(paths.source),
      original_filename: typeof body.fileName === "string" ? body.fileName.slice(0, 500) : null,
      mime_type: typeof body.mimeType === "string" && body.mimeType ? body.mimeType.slice(0, 200) : null,
      file_size_bytes: sourceSize,
    })
    .select("id")
    .single();
  if (pendingError || !pending) return reject("Could not record this submission.");

  const { data: material, error: materialError } = await admin
    .from("materials")
    .insert({
      slug,
      material_type: materialType,
      title: title.trim(),
      author: author.trim(),
      cover_url: thumbPath ? cdnUrl(finalKey(thumbPath)) : null,
      json_storage_path: jsonStoragePath,
      source_url: cdnUrl(finalKey(paths.source)),
      page_count_estimate: pageCountEstimate,
      file_size_bytes: sourceSize,
      status: "published",
      uploaded_by: reader.readerId,
      visibility,
    })
    .select("id, slug, title, author")
    .single();
  if (materialError || !material) {
    await admin.from("pending_materials").delete().eq("id", pending.id);
    return reject("Could not create the library entry.");
  }

  await admin.from("pending_materials").update({ material_id: material.id, status: "approved" }).eq("id", pending.id);

  // Google Books/OpenLibrary enrichment — quietly, after this response has
  // already gone out (`after()` runs once the response is sent, in the
  // same invocation, no queue/worker needed for a single-material lookup).
  // Runs for every material type: PDFs and DOCX uploads are just as often
  // real published books as EPUBs, they just need title/author enrichment
  // instead of a cover (see enrichMaterial's own doc comment).
  after(() => enrichMaterial(material.id));

  return NextResponse.json(
    { materialId: material.id, slug: material.slug, title: material.title, author: material.author },
    { status: 201 }
  );
}
