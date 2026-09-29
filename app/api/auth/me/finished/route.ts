import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { setReaderActivityFinished } from "@/lib/reader/activity";
import { isLocator, isReaderMode } from "@/lib/reader/locator";

type Body = {
  materialId?: string;
  finished?: unknown;
  locator?: unknown;
  mode?: unknown;
  progressPercent?: number;
};

/**
 * Marks a material finished, or un-marks it — deliberately its own route
 * rather than a field on `PUT /auth/me/reading-position`.
 *
 * Two reasons: completion has a different lifecycle from position (one
 * explicit act versus a continuous debounced stream), and folding it into the
 * position payload would let a scroll write — or a `keepalive` flush racing the
 * reader's tap — carry a stale `finished` and undo it.
 *
 * The locator/mode/progressPercent are still required: a reader can finish a
 * material this device has never committed a position for (a short article read
 * in one screenful), and the row has to exist to hold the flag.
 */
export async function PUT(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json()) as Body;
  if (
    !body.materialId ||
    typeof body.finished !== "boolean" ||
    !isLocator(body.locator) ||
    !isReaderMode(body.mode) ||
    typeof body.progressPercent !== "number"
  ) {
    return validationError("materialId, finished, a valid locator, mode, and progressPercent are required.");
  }

  const saved = await setReaderActivityFinished(reader.readerId, {
    materialId: body.materialId,
    finished: body.finished,
    locator: body.locator,
    mode: body.mode,
    progressPercent: body.progressPercent,
  });

  if (!saved) return validationError("Could not save finished state.");
  return new Response(null, { status: 204 });
}
