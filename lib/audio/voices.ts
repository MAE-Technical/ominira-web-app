import type { EngineVoice } from "@/lib/audio/engines/types";

/**
 * The narrators a reader can pick: exactly the voices the default engine,
 * Pocket (lib/audio/engines/pocket.ts), has on ominira-tts-server — each a
 * clip of a consenting speaker in its voices/<id>.wav. Only voices that
 * exist are listed; add one here when its clip lands on the server.
 *
 * Kept in this standalone, dependency-free file so client code (audio-store's
 * persisted preference, AudioPlayer's switcher UI) can import it.
 */
export type AfricanVoice = EngineVoice & { name: string; country: string; traits: string; avatar: string };

export const AFRICAN_VOICES: AfricanVoice[] = [
  { id: "abiodun", label: "Abiodun (Nigeria)", name: "Abiodun", country: "Nigeria", traits: "Deep · Measured", avatar: "/images/avatars/abeodun.png" },
  { id: "female5", label: "Bukola (Nigeria)", name: "Bukola", country: "Nigeria", traits: "Gentle · Friendly", avatar: "/images/avatars/bukola.png" },
  { id: "male1", label: "Sadiku (Kenya)", name: "Sadiku", country: "Kenya", traits: "Calm · Steady", avatar: "/images/avatars/chilemba.png" },
  { id: "female1", label: "Asilia (Kenya)", name: "Asilia", country: "Kenya", traits: "Clear · Intimate", avatar: "/images/avatars/asilia.png" },
  { id: "male2", label: "Xuma (South Africa)", name: "Xuma", country: "South Africa", traits: "Deep · Resonant", avatar: "/images/avatars/xuma.png" },
  { id: "female6", label: "Leah (South Africa)", name: "Leah", country: "South Africa", traits: "Confident · Grounded", avatar: "/images/avatars/leah.png" },
  { id: "male4", label: "Elimu (Tanzania)", name: "Elimu", country: "Tanzania", traits: "Calm · Professional", avatar: "/images/avatars/elimu.png" },
  { id: "female4", label: "Imani (Tanzania)", name: "Imani", country: "Tanzania", traits: "Calm · Professional", avatar: "/images/avatars/imani.png" },
  { id: "male6", label: "Malik (Nigeria)", name: "Malik", country: "Nigeria", traits: "Warm · Friendly", avatar: "/images/avatars/malik.png" },
  { id: "female2w", label: "Chidinma (Nigeria)", name: "Chidinma", country: "Nigeria", traits: "Warm · Friendly", avatar: "/images/avatars/ezinne.png" },
  { id: "male3", label: "Malcolm (United States)", name: "Malcolm", country: "United States", traits: "Clear · Professional", avatar: "/images/avatars/malcolm.png" },
  { id: "female9", label: "Amara (Kenya)", name: "Amara", country: "Kenya", traits: "Poised · Composed", avatar: "/images/avatars/amara.png" },
];

export const DEFAULT_VOICE_ID = AFRICAN_VOICES[0].id;

export const voiceById = (id: string | null | undefined): AfricanVoice | undefined =>
  id ? AFRICAN_VOICES.find((v) => v.id === id) : undefined;
