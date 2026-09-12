// Speaks Microsoft Edge's "Read Aloud" cloud TTS protocol directly, over a
// plain `ws` connection — free, no API key, but unofficial: it's the same
// websocket protocol Edge's browser feature uses, so it has no SLA and can
// change or get rate-limited without notice. Treat it as swappable, not
// load-bearing.
//
// This used to go through the `msedge-tts` npm package instead. Dropped it:
// that package is written "isomorphic" (browser + server, pulling in
// isomorphic-ws/stream-browserify), and something about how Next's dev
// bundler handled that shimmed layer silently broke the connection mid-
// stream — every request failed with ERR_STREAM_PREMATURE_CLOSE, even
// though the identical protocol worked fine run standalone outside Next.
// Marking the package external (serverExternalPackages) didn't fix it
// either. Talking to `ws` directly, with nothing isomorphic in between,
// sidesteps the whole class of bug and keeps full control over the wire
// format — the strings below are taken verbatim from msedge-tts's own
// (verified-working) source, not reconstructed from protocol docs.
import { randomUUID, createHash } from "node:crypto";
import WebSocket from "ws";
import type { SynthesisEngine, SynthesisResult, SynthesizeOptions } from "./types";
import { AFRICAN_VOICES, DEFAULT_VOICE_ID } from "@/lib/audio/voices";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const AUDIO_DELIM = "Path:audio\r\n";
const REQUEST_TIMEOUT_MS = 15_000;

// The reader-facing voice set — see lib/audio/voices.ts's own doc comment
// on why it's African-only and why it lives in its own dependency-free
// file rather than here (this module is server-only; that one isn't).
export const VOICES = AFRICAN_VOICES;
const DEFAULT_VOICE = DEFAULT_VOICE_ID;

type BoundaryMetadata = { Type: string; Data: { Offset: number; Duration: number; text: { Text: string } } };

/** The connection URL's Sec-MS-GEC query param is a short-lived auth token:
 * SHA-256 of (whole-5-minute-aligned Windows NT-epoch tick count + the
 * trusted client token), uppercase hex. */
function secMsGec(): string {
  const unixSeconds = Math.floor(Date.now() / 1000);
  const windowsSeconds = unixSeconds + 11_644_473_600; // 1970 -> 1601 epoch offset
  const rounded = windowsSeconds - (windowsSeconds % 300);
  const windowsTicks = BigInt(rounded) * BigInt(10_000_000); // seconds -> 100ns ticks
  return createHash("sha256").update(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`, "ascii").digest("hex").toUpperCase();
}

function escapeSsml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSsml(text: string, voice: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voice}">${escapeSsml(text)}</voice></speak>`;
}

async function synthesizeChunk(text: string, options: SynthesizeOptions = {}): Promise<SynthesisResult> {
  const voice = options.voice ?? DEFAULT_VOICE;
  const requestId = randomUUID().replace(/-/g, "");
  const connectionId = randomUUID().replace(/-/g, "");
  const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-143.0.0.0&ConnectionId=${connectionId}`;

  const ws = new WebSocket(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    },
  });

  const audioChunks: Buffer[] = [];
  const boundaries: BoundaryMetadata[] = [];
  let turnEnded = false;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("Edge TTS request timed out"));
    }, REQUEST_TIMEOUT_MS);
    const settle = (fn: () => void) => {
      clearTimeout(timeout);
      fn();
    };

    ws.on("open", () => {
      ws.send(
        `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "true" },
                  outputFormat: OUTPUT_FORMAT,
                },
              },
            },
          })
      );
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n` +
          buildSsml(text, voice)
      );
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        const idx = buffer.indexOf(AUDIO_DELIM);
        if (idx !== -1) audioChunks.push(buffer.subarray(idx + AUDIO_DELIM.length));
        return;
      }
      const message = data.toString();
      if (message.includes("Path:turn.end")) {
        turnEnded = true;
        settle(() => {
          ws.close();
          resolve();
        });
      } else if (message.includes("Path:audio.metadata")) {
        const delim = "\r\n\r\n";
        const body = message.slice(message.indexOf(delim) + delim.length);
        try {
          const parsed = JSON.parse(body) as { Metadata?: BoundaryMetadata[] };
          boundaries.push(...(parsed.Metadata ?? []));
        } catch {
          // Malformed metadata frame — skip it, the audio itself is unaffected.
        }
      }
      // Path:turn.start / Path:response carry nothing this needs.
    });

    ws.on("error", (err) => settle(() => reject(err)));
    ws.on("close", (code, reason) => {
      if (!turnEnded) {
        settle(() => reject(new Error(`Edge TTS connection closed before synthesis finished (code=${code} ${reason.toString()})`)));
      }
    });
  });

  const words = boundaries
    .filter((m) => m.Type === "WordBoundary")
    .map((m) => ({
      word: m.Data.text.Text,
      startMs: Math.round(m.Data.Offset / 10_000),
      endMs: Math.round((m.Data.Offset + m.Data.Duration) / 10_000),
    }));

  return { audio: Buffer.concat(audioChunks), durationMs: words.at(-1)?.endMs ?? 0, words };
}

export const edgeEngine: SynthesisEngine = {
  id: "edge",
  voices: VOICES,
  defaultVoice: DEFAULT_VOICE,
  synthesizeChunk,
};
