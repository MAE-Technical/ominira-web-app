import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { deleteReaderActivity, saveReaderActivity } from "@/lib/reader/activity";
import { isLocator, isReaderMode } from "@/lib/reader/locator";

type Body = {
  materialId?: string;
  locator?: unknown;
  mode?: unknown;
  audioTimeMs?: number;
  progressPercent?: number;
};

export async function PUT(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json()) as Body;
  // `locator` is validated structurally rather than trusted: it lands in a
  // jsonb column every progress consumer then reads back, so a malformed one
  // would silently degrade to "0%" everywhere instead of being rejected here.
  if (!body.materialId || !isLocator(body.locator) || !isReaderMode(body.mode) || typeof body.progressPercent !== "number") {
    return validationError("materialId, a valid locator, mode, and progressPercent are required.");
  }

  const saved = await saveReaderActivity(reader.readerId, {
    materialId: body.materialId,
    locator: body.locator,
    mode: body.mode,
    audioTimeMs: body.audioTimeMs ?? null,
    progressPercent: body.progressPercent,
  });

  if (!saved) return validationError("Could not save reading position.");
  return new Response(null, { status: 204 });
}

/**
 * Removes this material from the reader's shelf — the Shelf page's per-row
 * remove (ShelfView), for both the Reading and Finished tabs, since both
 * are views of this one table.
 *
 * On this route rather than its own, because it's the exact inverse of the
 * PUT above and deletes the row that PUT creates; `finished_at` living in
 * that same row is why /auth/me/finished doesn't own this instead — it
 * flips a column, this drops the record.
 *
 * `materialId` comes from the query string, not a body: DELETE bodies are
 * legal but not reliably carried by every intermediary, and there's exactly
 * one identifier to pass.
 */
export async function DELETE(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const materialId = new URL(request.url).searchParams.get("materialId");
  if (!materialId) return validationError("materialId is required.");

  const deleted = await deleteReaderActivity(reader.readerId, materialId);
  if (!deleted) return validationError("Could not remove this from your shelf.");
  return new Response(null, { status: 204 });
}
