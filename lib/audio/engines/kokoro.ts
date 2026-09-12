// Client for a local Kokoro-FastAPI server (https://github.com/remsky/Kokoro-FastAPI),
// e.g. `docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest`.
import type { EngineVoice, SynthesisEngine, SynthesisResult, SynthesizeOptions } from "./types";

const BASE_URL = process.env.KOKORO_BASE_URL ?? "http://localhost:8880";

export class KokoroError extends Error {}

// Kokoro-82M's own voice ids — a curated subset (not the full pack) to match
// the same handful of choices the edge engine offers in the reader's dropdown.
export const VOICES: EngineVoice[] = [
  { id: "af_heart", label: "Heart (US)" },
  { id: "af_bella", label: "Bella (US)" },
  { id: "af_nicole", label: "Nicole (US)" },
  { id: "am_adam", label: "Adam (US)" },
  { id: "am_michael", label: "Michael (US)" },
  { id: "bf_emma", label: "Emma (UK)" },
  { id: "bm_george", label: "George (UK)" },
];
const DEFAULT_VOICE = VOICES[0].id;

type CaptionedSpeechResponse = {
  audio: string; // base64-encoded per response_format
  timestamps?: { word: string; start_time: number; end_time: number }[];
};

/**
 * Calls /dev/captioned_speech rather than the plain OpenAI-compatible
 * /v1/audio/speech — same request shape, but the response also carries
 * word-level timestamps: the last entry's end_time doubles as the clip's own
 * duration (no ffprobe/ffmpeg dependency just to measure what we generated),
 * and the full list is what SynthesisResult.words needs for karaoke
 * highlighting.
 */
async function synthesizeChunk(text: string, options: SynthesizeOptions = {}): Promise<SynthesisResult> {
  const res = await fetch(`${BASE_URL}/dev/captioned_speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input: text,
      voice: options.voice ?? DEFAULT_VOICE,
      response_format: "mp3",
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new KokoroError(
      `Kokoro /dev/captioned_speech failed (${res.status}): ${await res.text()} — is the Kokoro-FastAPI container running on ${BASE_URL}?`
    );
  }

  const body: CaptionedSpeechResponse = await res.json();
  const audio = Buffer.from(body.audio, "base64");
  const words = (body.timestamps ?? []).map((t) => ({
    word: t.word,
    startMs: Math.round(t.start_time * 1000),
    endMs: Math.round(t.end_time * 1000),
  }));
  const durationMs = words.at(-1)?.endMs ?? 0;
  return { audio, durationMs, words };
}

export const kokoroEngine: SynthesisEngine = {
  id: "kokoro",
  voices: VOICES,
  defaultVoice: DEFAULT_VOICE,
  synthesizeChunk,
};
