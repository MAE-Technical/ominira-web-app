/** A single word's timing within one synthesized chunk of text. */
export type SynthesizedWord = { word: string; startMs: number; endMs: number };

export type SynthesisResult = { audio: Buffer; durationMs: number; words: SynthesizedWord[] };

/** One voice a synthesis engine can be asked to speak in — id is what callers
 * pass back as `voice`, label is what the reader-facing dropdown shows. */
export type EngineVoice = { id: string; label: string };

export type SynthesizeOptions = { voice?: string };

/**
 * Common shape every TTS backend (edge, kokoro, ...) implements — the only
 * thing the rest of the audio pipeline depends on. Swapping engines means
 * adding a module that satisfies this, nothing else changes.
 */
export type SynthesisEngine = {
  id: string;
  voices: EngineVoice[];
  defaultVoice: string;
  synthesizeChunk(text: string, options?: SynthesizeOptions): Promise<SynthesisResult>;
};
