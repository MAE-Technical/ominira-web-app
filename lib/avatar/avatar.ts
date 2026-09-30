// A reader's DP — the one module behind every avatar in the app (rendered
// by app/components/shared/ReaderAvatar.tsx). Two `readers` columns
// (migrations/20261006_reader_avatar.sql) drive it:
//   avatar_color — a chosen default (a key of AVATAR_COLORS), or null
//   avatar_url   — the reader's cropped upload in the `profile-pics` bucket
// A chosen color wins over the photo, so switching back to a default never
// deletes the upload; picking the photo again just clears the color. With
// neither, the circle falls back to a color hashed from the name.

import { comradeName } from "@/lib/reader/authorDisplay";

/** The defaults grid (ui-mockups/Profile Dropdown and Edit.dc.html). */
export const AVATAR_COLORS = {
  brand: "var(--color-brand-500)",
  oxblood: "var(--color-oxblood-500)",
  olive: "var(--color-olive-500)",
  forest: "var(--color-forest-500)",
  neutral: "var(--color-sand-800)",
} as const;

export type AvatarColor = keyof typeof AVATAR_COLORS;

export type Avatar = { color: AvatarColor | null; url: string | null };

// The name-hashed fallback skips brand — it reads as the notification badge
// color and would recur everywhere unasked.
const FALLBACK_COLORS: AvatarColor[] = ["oxblood", "olive", "forest", "neutral"];

/** Largest avatar rendered anywhere (ReaderProfileView), and the upload's
 * exported edge: 4x that, sharp on any screen without shipping originals. */
export const AVATAR_MAX_DISPLAY_PX = 64;
export const AVATAR_EXPORT_PX = AVATAR_MAX_DISPLAY_PX * 4;
export const AVATAR_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

export const PROFILE_PICS_BUCKET = "profile-pics";

export function isAvatarColor(value: unknown): value is AvatarColor {
  return typeof value === "string" && Object.hasOwn(AVATAR_COLORS, value);
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** What the circle shows — the photo, or which color sits behind the
 * initial. Hashed on comradeName so "Muiz" and "Comrade Muiz" agree. */
export function avatarChoice(pseudonym: string, avatar?: Avatar | null): AvatarColor | "photo" {
  if (avatar?.url && !avatar.color) return "photo";
  return avatar?.color ?? FALLBACK_COLORS[hash(comradeName(pseudonym)) % FALLBACK_COLORS.length];
}

/** The ring color to sit an avatar in — mixed toward its own background
 * rather than a flat surface color, so a stack of different-colored circles
 * doesn't get one same-colored outline. A photo's background varies too much
 * to pick from, so it keeps the plain surface ring. */
export function avatarRingColor(pseudonym: string, avatar?: Avatar | null): string {
  const choice = avatarChoice(pseudonym, avatar);
  if (choice === "photo") return "var(--reader-surface)";
  return `color-mix(in srgb, ${AVATAR_COLORS[choice]} 45%, var(--reader-surface))`;
}

/** "Comrade Muiz" -> "M" — the letter after "Comrade ", uppercased; falls
 * back to the name's own first letter if it doesn't follow that pattern. */
export function avatarInitial(name: string): string {
  const rest = name.replace(/^Comrade\s+/i, "");
  return (rest || name).charAt(0).toUpperCase();
}

/** `readers` row (any select including avatar_color, avatar_url) -> Avatar. */
export function toAvatar(row: { avatar_color: string | null; avatar_url: string | null }): Avatar {
  return { color: isAvatarColor(row.avatar_color) ? row.avatar_color : null, url: row.avatar_url };
}
