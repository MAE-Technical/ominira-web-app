import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { cdnUrl, presignPut } from "@/lib/storage/r2";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
};

// Far above a real recording (Opus is ~16 KB a second).
const MAX_BYTES = 20 * 1024 * 1024;

/** A URL to PUT a recorded voice note straight to R2, and the public URL it
 * will have — what the note saves as `content.audioUrl`. */
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { contentType?: unknown; size?: unknown };
  const ext = typeof body.contentType === "string" ? EXTENSION_BY_CONTENT_TYPE[body.contentType] : undefined;
  if (!ext) return validationError("Unsupported audio Content-Type.", "audio");
  if (typeof body.size !== "number" || body.size <= 0 || body.size > MAX_BYTES) return validationError("Invalid audio size.", "audio");

  const key = `voice-notes/${randomUUID()}.${ext}`;
  return NextResponse.json({ uploadUrl: await presignPut(key, body.size), url: cdnUrl(key) }, { status: 201 });
}
