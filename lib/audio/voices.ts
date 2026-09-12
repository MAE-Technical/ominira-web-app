import type { EngineVoice } from "@/lib/audio/engines/types";

/**
 * The Edge TTS engine's (lib/audio/engines/edge.ts) full voice set covers
 * dozens of locales, but the reader-facing switcher only offers African
 * English ones, on purpose — one Neural voice per major English-speaking
 * African market Microsoft ships: Nigeria, Kenya, Tanzania, South Africa,
 * a woman and a man each. Labeled with the voice's own given name (each id
 * already carries a real one — Ezinne, Asilia, Imani, Leah, ...) plus its
 * country, the same "Name (Region)" pattern the engine's non-African
 * voices already used.
 *
 * Kept in this standalone, dependency-free file — not inline in edge.ts —
 * specifically so it can be imported from client code too (audio-store's
 * persisted preference, AudioPlayer's switcher UI) without pulling in
 * edge.ts's own `ws`/`node:crypto` imports, which only run server-side.
 */
export const AFRICAN_VOICES: EngineVoice[] = [
  { id: "en-NG-EzinneNeural", label: "Ezinne (Nigeria)" },
  { id: "en-NG-AbeoNeural", label: "Abeo (Nigeria)" },
  { id: "en-KE-AsiliaNeural", label: "Asilia (Kenya)" },
  { id: "en-KE-ChilembaNeural", label: "Chilemba (Kenya)" },
  { id: "en-TZ-ImaniNeural", label: "Imani (Tanzania)" },
  { id: "en-TZ-ElimuNeural", label: "Elimu (Tanzania)" },
  { id: "en-ZA-LeahNeural", label: "Leah (South Africa)" },
  { id: "en-ZA-LukeNeural", label: "Luke (South Africa)" },
];

export const DEFAULT_VOICE_ID = AFRICAN_VOICES[0].id;
