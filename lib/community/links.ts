// Shared URL-detection for the community/notes domain — one pattern behind
// both NoteContent's linkify (a posted note's rendered body) and
// HomeComposer's live auto-detect (Composer.dc.html's "links need no
// click" callout), so the set of links a draft shows previews for is
// exactly the set the posted note will too.

// Matches http(s) URLs and bare "www." ones.
export const LINK_URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

// Trailing punctuation a URL is unlikely to actually end with is more often
// the reader's own sentence punctuation ("check this out: example.com.")
// than part of the link.
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/;

export function normalizeLinkUrl(raw: string): string {
  const withoutTrailing = raw.replace(TRAILING_PUNCTUATION, "");
  return withoutTrailing.toLowerCase().startsWith("www.") ? `https://${withoutTrailing}` : withoutTrailing;
}

// A post mentioning a dozen links still gets at most this many cards —
// Slack/Discord's own convention for "every link gets a preview" (unlike
// X/Bluesky, which only ever unfurls one), so a link-heavy note doesn't
// turn into a wall of cards.
export const MAX_LINK_PREVIEWS = 4;

/** Every distinct URL in `text`, normalized and in order of first
 * appearance, capped at MAX_LINK_PREVIEWS. */
export function extractLinks(text: string): string[] {
  const matches = text.match(LINK_URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of matches) {
    const url = normalizeLinkUrl(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_LINK_PREVIEWS) break;
  }
  return urls;
}

// Mirrors app/api/link-preview/route.ts's own youtubeVideoId — that one
// decides server-side whether to hit YouTube's oEmbed endpoint, this one
// lets LinkPreviewCard know whether to render the actual embed client-side.
// Kept as a separate copy rather than a shared import since one runs in the
// route handler and the other in a "use client" component.
export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      return parsed.searchParams.get("v") ?? (parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : null);
    }
  } catch {
    return null;
  }
  return null;
}
