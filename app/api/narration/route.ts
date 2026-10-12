import type { NextRequest } from "next/server";
import { getEngine } from "@/lib/audio/engines";
import { synthesizeGated } from "@/lib/audio/synthesisGate";
import { validationError } from "@/lib/api/errors";

/**
 * Live, on-demand AI narration for one chunk of text, live, on request —
 * no pre-generation, nothing cached or persisted to the book JSON (that's
 * the separate, pre-published audiobook path described in TTSEngine.md,
 * keyed by section via SectionAudio.narratorTracks).
 *
 * Deliberately stateless — no book/passage lookup here at all. This used
 * to take a `slug`/`passageId` and re-resolve them against a book loaded
 * server-side via lib/book/repository's getBookDocument, which reads local
 * JSON fixtures (or a Supabase bucket keyed by slug) — a completely
 * different, narrower source than lib/materials/toBookDocument.ts, which
 * is what actually backs the reader in production. A book the reader had
 * already loaded and rendered (so its passage text was right there in the
 * request all along) could still 404 here just because that separate
 * fixture/bucket path didn't happen to have it. The reader already parsed
 * this book to display it — asking it to hand over the exact chunk text
 * it wants narrated, rather than a slug and an id for this route to go
 * re-look-up the same content through a different, narrower door, removes
 * that whole class of mismatch entirely: this route doesn't need to know
 * what a "book" is.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Request body must be JSON.");
  }

  const { text, voice, engine: engineId } = (body ?? {}) as {
    text?: unknown;
    voice?: unknown;
    engine?: unknown;
  };
  if (typeof text !== "string" || text.trim().length === 0) {
    return validationError("text is required and must be a non-empty string.");
  }
  if (voice !== undefined && typeof voice !== "string") return validationError("voice must be a string.");
  if (engineId !== undefined && typeof engineId !== "string") return validationError("engine must be a string.");

  let engine;
  try {
    engine = getEngine(engineId);
  } catch (err) {
    return validationError((err as Error).message);
  }

  try {
    // Routed through synthesizeGated rather than engine.synthesizeChunk
    // directly — see that module's own doc comment. In short: the
    // client-side queue (lib/audio/liveNarrationCache.ts) only ever limits
    // itself to one request in flight *per tab*, which is no defense
    // against multiple tabs/readers (or a dev-server hot-reload's orphaned
    // requests) all hitting this same server process at once — exactly
    // the concurrent-connection pattern Edge TTS's own doc comment warns
    // stalls it, and what actually produced the real 11-15s stalls/
    // timeouts this replaced.
    const result = await synthesizeGated(engine, text, { voice });

    // Framed as [4-byte big-endian metadata length][JSON metadata][raw MP3
    // bytes] rather than the JSON-with-base64-audio shape this used to
    // return. That used to mean: server-side Buffer->base64 (~33% bigger),
    // a JSON body carrying a single-field string that's often hundreds of
    // KB (a whole passage is one synthesis unit — see narrationText.ts),
    // then client-side JSON.parse of that giant string followed by a
    // manual base64->bytes decode — real main-thread CPU/memory cost paid
    // on every chunk, foreground and background-prefetched alike, for data
    // that never needed to be text in the first place. This framing lets
    // the client go straight from `res.arrayBuffer()` to a `Blob` for the
    // audio slice — no string, no base64, no JSON.parse of anything but
    // the small metadata (words + duration). Metadata isn't put in a
    // response header instead: a longer passage's word-timing list can run
    // well past typical header-size limits (8-16KB), where the body has no
    // such ceiling.
    const meta = Buffer.from(JSON.stringify({ durationMs: result.durationMs, words: result.words }), "utf-8");
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeUInt32BE(meta.length, 0);
    const body = Buffer.concat([lengthPrefix, meta, result.audio]);
    return new Response(body, { headers: { "Content-Type": "application/octet-stream" } });
  } catch (err) {
    console.error("Narration synthesis failed:", err);
    return Response.json(
      { error: { code: "synthesis_failed", message: err instanceof Error ? err.message : String(err) } },
      { status: 502 }
    );
  }
}
