import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { toReaderProfile } from "@/lib/auth/profile";
import { cdnUrl, deleteObjects, headObject, listObjects, presignPut } from "@/lib/storage/r2";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

// The client crops and downsizes before upload (lib/avatar/cropImage.ts), so
// a real avatar is tens of KB — this only stops a raw original slipping by.
const MAX_BYTES = 1024 * 1024;

const folderOf = (readerId: string) => `avatars/${readerId}/`;

/** Step 1: a URL to PUT the cropped avatar straight to R2. Each upload gets
 * a fresh key, so CDN caches never serve the old face. */
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { contentType?: unknown; size?: unknown };
  const ext = typeof body.contentType === "string" ? EXTENSION_BY_CONTENT_TYPE[body.contentType] : undefined;
  if (!ext) return validationError("Unsupported image type.", "avatar");
  if (typeof body.size !== "number" || body.size <= 0 || body.size > MAX_BYTES) return validationError("Invalid image size.", "avatar");

  const key = `${folderOf(reader.readerId)}${randomUUID()}.${ext}`;
  return NextResponse.json({ key, uploadUrl: await presignPut(key, body.size) });
}

/** Step 2: selects the uploaded avatar (clears any chosen color), then sweeps
 * the reader's older uploads — best-effort, after they already have their photo. */
export async function PUT(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { key } = (await request.json().catch(() => ({}))) as { key?: unknown };
  const folder = folderOf(reader.readerId);
  if (typeof key !== "string" || !key.startsWith(folder) || key.includes("..")) return validationError("Invalid avatar.", "avatar");
  const object = await headObject(key);
  if (!object || object.size > MAX_BYTES) return validationError("Could not upload photo.");

  const { data: updated, error } = await getSupabaseAdminClient()
    .from("readers")
    .update({ avatar_url: cdnUrl(key), avatar_color: null })
    .eq("id", reader.readerId)
    .select("*")
    .single();
  if (error || !updated) {
    await deleteObjects([key]);
    return validationError("Could not save photo.");
  }

  const stale = (await listObjects(folder)).map((o) => o.key).filter((k) => k !== key);
  if (stale.length) await deleteObjects(stale);

  return NextResponse.json({ reader: toReaderProfile(updated) });
}
