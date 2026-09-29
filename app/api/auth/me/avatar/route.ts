import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { toReaderProfile } from "@/lib/auth/profile";
import { bucketPublicUrl } from "@/lib/storage/config";
import { PROFILE_PICS_BUCKET } from "@/lib/avatar/avatar";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

// The client crops and downsizes before upload (lib/avatar/cropImage.ts), so
// a real avatar is tens of KB — this only stops a raw original slipping by.
const MAX_BYTES = 1024 * 1024;

/** Stores a cropped avatar and selects it (clears any chosen color). Each
 * upload gets a fresh object path so CDN caches never serve the old face;
 * the reader's older uploads are swept from their folder once the row points
 * at the new one — best-effort, after the reader already has their photo. */
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const contentType = request.headers.get("content-type") ?? "";
  const ext = EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!ext) return validationError("Unsupported image type.", "avatar");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return validationError("Invalid image size.", "avatar");

  const admin = getSupabaseAdminClient();
  const storage = admin.storage.from(PROFILE_PICS_BUCKET);
  const objectPath = `${reader.readerId}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await storage.upload(objectPath, bytes, { contentType, upsert: false });
  if (uploadError) return validationError("Could not upload photo.");

  const { data: updated, error } = await admin
    .from("readers")
    .update({ avatar_url: bucketPublicUrl(PROFILE_PICS_BUCKET, objectPath), avatar_color: null })
    .eq("id", reader.readerId)
    .select("*")
    .single();
  if (error || !updated) {
    await storage.remove([objectPath]);
    return validationError("Could not save photo.");
  }

  const { data: objects } = await storage.list(reader.readerId);
  const stale = (objects ?? []).map((o) => `${reader.readerId}/${o.name}`).filter((path) => path !== objectPath);
  if (stale.length) await storage.remove(stale);

  return NextResponse.json({ reader: toReaderProfile(updated) }, { status: 201 });
}
