// Client for ominira-tts-server (Pocket TTS with word timings), a separate
// repo: `docker run -p 8000:8000 ominira-tts` locally, TTS_URL in production.
import { AFRICAN_VOICES, DEFAULT_VOICE_ID } from "@/lib/audio/voices";
import type { SynthesisEngine, SynthesisResult, SynthesizedWord, SynthesizeOptions } from "./types";

const BASE_URL = process.env.TTS_URL ?? "http://localhost:8000";
const TOKEN = process.env.TTS_TOKEN;

// The reader-facing narrators, each a voices/<id>.wav clone on the server.
export const VOICES = AFRICAN_VOICES;
const DEFAULT_VOICE = DEFAULT_VOICE_ID;

type SynthesizeResponse = { audio: string; durationMs: number; words: SynthesizedWord[] };

const alnum = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Re-maps Pocket's words onto the text's own \S+ words, one timing each —
 * the unit KaraokeWord.index counts (see narrationText.ts's countWords).
 * Pocket splits at punctuation ("H.I.I.D.'s" -> H I I D s, "$4.50" -> 4 50)
 * and drops tokens with nothing to say ("—"), so its list can't be used
 * index-for-index. A text word claims the Pocket words whose letters spell
 * it out; one Pocket never spoke (a dash, or a skipped word) gets a
 * zero-length timing where the previous word ended.
 */
export function alignWords(text: string, spoken: SynthesizedWord[]): SynthesizedWord[] {
  let next = 0;
  let lastEnd = 0;
  return (text.match(/\S+/g) ?? []).map((word) => {
    const target = alnum(word);
    let built = "";
    let startMs: number | undefined;
    while (next < spoken.length && built.length < target.length) {
      const piece = alnum(spoken[next].word);
      if (!target.startsWith(built + piece)) break;
      built += piece;
      startMs ??= spoken[next].startMs;
      lastEnd = spoken[next].endMs;
      next++;
    }
    return { word, startMs: startMs ?? lastEnd, endMs: lastEnd };
  });
}

async function synthesizeChunk(text: string, options: SynthesizeOptions = {}): Promise<SynthesisResult> {
  // A stale id (e.g. an old Edge voice in a saved preference) gets the default.
  const voice = VOICES.some((v) => v.id === options.voice) ? options.voice : DEFAULT_VOICE;
  const res = await fetch(`${BASE_URL}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    throw new Error(`Pocket TTS /synthesize failed (${res.status}): ${await res.text()} — is ominira-tts-server running on ${BASE_URL}?`);
  }
  const body: SynthesizeResponse = await res.json();
  return { audio: Buffer.from(body.audio, "base64"), durationMs: body.durationMs, words: alignWords(text, body.words) };
}

export const pocketEngine: SynthesisEngine = {
  id: "pocket",
  voices: VOICES,
  defaultVoice: DEFAULT_VOICE,
  synthesizeChunk,
};
