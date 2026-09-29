// A push body is read on a lock screen, where the OS truncates without
// asking and a long quote becomes a wall. 140 characters is about two
// comfortable lines there, and it's also what the in-app row shows before
// its own line-clamp takes over.
const PUSH_SNIPPET_CHARS = 140;

/** The note's own words, cut to push length at a word boundary — the one
 * place that truncation happens, so the in-app row and the push body are
 * never cut differently. Whitespace is collapsed first: a note written
 * across several lines reads as one run of text in a notification, not as
 * a gapped fragment. Returns null for a voice note or an empty body, so
 * callers can fall back rather than push an empty line. */
export function notificationSnippet(text: string | null | undefined, max = PUSH_SNIPPET_CHARS): string | null {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= max) return normalized;

  const cut = normalized.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Only back up to a word boundary when one is reasonably close to the
  // limit — a single very long token would otherwise collapse the whole
  // snippet to almost nothing.
  const shown = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${shown.trimEnd()}…`;
}
