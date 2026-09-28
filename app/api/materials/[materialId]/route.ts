import { NextResponse } from "next/server";
import { forbidden, notFound, unauthorized, validationError } from "@/lib/api/errors";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { resolveMaterialRow } from "@/lib/materials/resolve";
import { MaterialSectionNotFoundError, projectMaterial } from "@/lib/materials/projection";
import { STORAGE_BUCKET, objectPathFromPublicUrl } from "@/lib/storage/config";

export async function GET(request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;
  const row = await resolveMaterialRow(materialId);
  if (!row) return notFound();

  const url = new URL(request.url);
  const fieldsParam = url.searchParams.get("fields");
  const fields = fieldsParam
    ? fieldsParam
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];
  const sectionId = url.searchParams.get("sectionId") ?? undefined;
  const passagesOnly = url.searchParams.get("passagesOnly") === "true";
  const fullContent = url.searchParams.get("fullContent") === "true";

  try {
    const projected = await projectMaterial(row, { fields, sectionId, passagesOnly, fullContent });
    return NextResponse.json(projected);
  } catch (err) {
    if (err instanceof MaterialSectionNotFoundError) return notFound();
    throw err;
  }
}

/**
 * A reader editing their own upload's title/author — the same "reader can
 * always fix a bad auto-detected guess" affordance the attachment preview
 * in HomeComposer/AddBookButton exposes inline (lib/materials/
 * useUploadBook.ts's `onMetadata` guess is only ever a starting point, not
 * the final word). Same ownership check as DELETE below: only the reader
 * who uploaded this material may edit it — never the editorial catalog's
 * `PATCH /api/admin/materials/[materialId]`, which has no such restriction.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { materialId } = await params;
  const row = await resolveMaterialRow(materialId, { publishedOnly: false });
  if (!row) return notFound();
  if (row.uploaded_by !== reader.readerId) return forbidden("You can only edit your own uploads.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return validationError("A JSON body is required.");
  const { title, author } = body as { title?: unknown; author?: unknown };

  const update: { title?: string; author?: string } = {};
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) return validationError("A title is required.", "title");
    update.title = title.trim();
  }
  if (author !== undefined) {
    if (typeof author !== "string") return validationError("Author must be a string.", "author");
    update.author = author.trim();
  }
  if (Object.keys(update).length === 0) return validationError("Nothing to update.");

  const admin = getSupabaseAdminClient();
  const { data: material, error } = await admin
    .from("materials")
    .update(update)
    .eq("id", row.id)
    .select("id, slug, title, author")
    .single();
  if (error || !material) return notFound();

  return NextResponse.json({ materialId: material.id, slug: material.slug, title: material.title, author: material.author });
}

/**
 * A reader deleting their own upload — from HomeComposer's "x" on a
 * still-in-flight or already-uploaded attachment (reader-uploads-spec.md
 * § 3), or the library's own "remove" on a personal-library item. Distinct
 * from `DELETE /api/admin/materials/[materialId]` (admin-only, no ownership
 * check, editorial catalog): this route only ever touches a material this
 * reader themselves uploaded, and cleans up exactly the Storage objects
 * `POST /api/materials/upload` wrote for it (parsed from the row's own
 * source_url/json_storage_path/cover_url — there's no other record of which
 * objects belong to this upload, since reader uploads don't follow the
 * fixed slug-based layout deleteMaterialAssets.ts assumes for editorial
 * books).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { materialId } = await params;
  const row = await resolveMaterialRow(materialId, { publishedOnly: false });
  if (!row) return notFound();
  if (row.uploaded_by !== reader.readerId) return forbidden("You can only delete your own uploads.");

  const admin = getSupabaseAdminClient();

  // pending_materials before materials, not after: pending_materials.material_id is
  // `on delete set null` (migrations/20260927_reader_uploads.sql), so
  // deleting materials first would null it out as part of that same
  // statement — a `delete ... where material_id = row.id` issued afterward
  // would then match nothing. Not just nulling it, either — the
  // pending_materials row is this upload's own submission record, not a
  // shared reference; deleting the material means deleting the submission
  // that produced it too, same as the material itself no longer existing.
  await admin.from("pending_materials").delete().eq("material_id", row.id);

  const { error: deleteError } = await admin.from("materials").delete().eq("id", row.id);
  if (deleteError) return notFound();

  const objectPaths = [row.source_url, row.json_storage_path, row.cover_url]
    .filter((url): url is string => !!url)
    .map((url) => objectPathFromPublicUrl(STORAGE_BUCKET, url))
    .filter((path): path is string => !!path);
  if (objectPaths.length > 0) await admin.storage.from(STORAGE_BUCKET).remove(objectPaths);

  return NextResponse.json({ deleted: true });
}
