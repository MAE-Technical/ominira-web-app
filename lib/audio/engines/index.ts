import { edgeEngine } from "./edge";
import { kokoroEngine } from "./kokoro";
import type { SynthesisEngine } from "./types";

export type { EngineVoice, SynthesisEngine, SynthesisResult, SynthesizedWord, SynthesizeOptions } from "./types";

export const ENGINES = { edge: edgeEngine, kokoro: kokoroEngine } satisfies Record<string, SynthesisEngine>;
export type EngineId = keyof typeof ENGINES;

const ENV_DEFAULT = process.env.TTS_ENGINE;
export const DEFAULT_ENGINE_ID: EngineId = ENV_DEFAULT && ENV_DEFAULT in ENGINES ? (ENV_DEFAULT as EngineId) : "edge";

export function getEngine(id: string = DEFAULT_ENGINE_ID): SynthesisEngine {
  const engine = ENGINES[id as EngineId];
  if (!engine) throw new Error(`Unknown TTS engine "${id}" — expected one of: ${Object.keys(ENGINES).join(", ")}`);
  return engine;
}
