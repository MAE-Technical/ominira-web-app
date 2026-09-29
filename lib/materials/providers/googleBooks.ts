// Google Books lookup — the discovery step that finds a book's ISBN by
// title+author search, so lib/materials/providers/openLibrary.ts's
// deterministic ISBN lookup has something to key on. Shared by
// scripts/generate-material-google-metadata.ts (batch backfill over every
// material still missing this) and lib/materials/enrichMaterial.ts (a
// single material, run once in the background right after its own upload
// finishes) — one implementation of the search/scoring logic, not two.
import type { GoogleMetaData } from "@/lib/materials/providerMeta";

type GoogleImageLinks = {
  smallThumbnail?: string;
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
  extraLarge?: string;
};

type GoogleVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  description?: string;
  pageCount?: number;
  imageLinks?: GoogleImageLinks;
  industryIdentifiers?: { type?: string; identifier?: string }[];
};

type GoogleVolume = {
  id: string;
  volumeInfo?: GoogleVolumeInfo;
};

type GoogleBooksResponse = {
  totalItems?: number;
  items?: GoogleVolume[];
};

const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2; // 503s here are server-side flakiness, not something worth waiting long for
const REQUEST_DELAY_MS = 150; // ~6-7 req/sec, comfortably under Google's soft limits
const MIN_ACCEPT_SCORE = 45; // below this, a "match" is more likely noise than signal
const RETRY_BASE_MS = 2_000;
const RETRY_STEP_MS = 2_000; // 2s, 4s — quick jitteredish retry, then give up and move on

// ---------- text helpers ----------

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Strips subtitles ("Title: The Long Subtitle") for use in search queries only.
 *  Scoring still uses the full title, so this only loosens matching, not ranking. */
function primaryTitle(title: string): string {
  return title.split(/[:–—]/)[0].trim();
}

/** Drops bracketed/parenthetical noise ("(Akashic Noir)", "[2nd Edition]") that can
 *  confuse intitle: search without affecting the meaningful part of the title. */
function stripAnnotations(title: string): string {
  return title.replace(/[([][^)\]]*[)\]]/g, "").trim();
}

/** First author only — multi-author strings ("X and Y", "X, Y, Z") over-constrain
 *  inauthor: search when Google indexes contributors differently. */
function primaryAuthor(author: string): string {
  return author.split(/,| and | & /i)[0].trim();
}

function cleanUrl(value?: string | null): string | null {
  const url = value?.trim();
  if (!url) return null;
  return url.replace(/^http:\/\//, "https://");
}

function extractIsbn(identifiers?: { type?: string; identifier?: string }[]): string | null {
  if (!identifiers?.length) return null;
  const isbn13 = identifiers.find((id) => id.type === "ISBN_13")?.identifier;
  const isbn10 = identifiers.find((id) => id.type === "ISBN_10")?.identifier;
  return isbn13 ?? isbn10 ?? null;
}

/** Google's book image URLs accept a `zoom` param (roughly 1-5, higher = higher-res)
 *  and an `edge=curl` flag that draws a page-curl overlay in the corner. `smallThumbnail`
 *  and `thumbnail` both come back at zoom=1 (~128px wide) regardless of which field you
 *  use, which is what causes the blur when displayed any larger than a small icon — so
 *  bump the zoom level explicitly rather than relying on the field name alone. */
function upscale(url: string, zoom: number): string {
  const withZoom = url.includes("zoom=") ? url.replace(/zoom=\d+/, `zoom=${zoom}`) : `${url}&zoom=${zoom}`;
  return withZoom.replace(/&edge=curl/, "");
}

function resolveImageLinks(links?: GoogleImageLinks) {
  // thumbnail: a list/card-sized image — zoom=2 roughly doubles smallThumbnail's
  // resolution (~256px wide), sharp enough for list views without wasting bandwidth
  const thumbnailSource = links?.thumbnail ?? links?.smallThumbnail;
  const thumbnail = thumbnailSource ? cleanUrl(upscale(thumbnailSource, 2)) : null;

  // cover: prefer explicit larger variants when Google provides them; otherwise
  // upscale the best available source further than the thumbnail, but zoom=3 is
  // roughly the practical ceiling before Google starts serving upscaled/soft images
  const coverSource = links?.extraLarge ?? links?.large ?? links?.medium ?? links?.small ?? thumbnailSource;
  const cover = coverSource
    ? cleanUrl(links?.extraLarge || links?.large || links?.medium || links?.small ? coverSource : upscale(coverSource, 3))
    : null;

  return { thumbnail, cover };
}

// ---------- scoring ----------

function scoreVolume(volume: GoogleVolume, title: string, author: string): number {
  const info = volume.volumeInfo;
  if (!info?.title) return 0;

  const volumeTitle = normalize([info.title, info.subtitle].filter(Boolean).join(" "));
  const volumeAuthors = normalize((info.authors ?? []).join(" "));
  const targetTitle = normalize(title);
  const targetAuthor = normalize(author);

  let score = 0;

  if (volumeTitle === targetTitle) score += 100;
  else if (volumeTitle.startsWith(targetTitle)) score += 70;
  else if (volumeTitle.includes(targetTitle)) score += 50;
  else {
    // partial credit for token overlap, so near-miss titles (punctuation, ordering)
    // aren't scored identically to a completely unrelated book
    const targetTokens = targetTitle.split(" ").filter((t) => t.length >= 3);
    const overlap = targetTokens.filter((t) => volumeTitle.includes(t)).length;
    if (targetTokens.length > 0) score += Math.round((overlap / targetTokens.length) * 35);
  }

  if (volumeAuthors === targetAuthor) score += 60;
  else if (volumeAuthors.includes(targetAuthor)) score += 40;
  else {
    for (const token of targetAuthor.split(" ")) {
      if (token.length >= 3 && volumeAuthors.includes(token)) score += 8;
    }
  }

  if ((info.description ?? "").trim()) score += 2;
  if (info.pageCount) score += 1;
  if (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail) score += 1;

  return score;
}

// ---------- Google Books API ----------

async function fetchWithRetry(url: URL): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url);
    if (!RETRY_STATUS_CODES.has(response.status)) return response;

    lastResponse = response;
    if (attempt === MAX_RETRIES) break;

    const wait = RETRY_BASE_MS + attempt * RETRY_STEP_MS;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  return lastResponse!;
}

function buildQueries(title: string, author: string): string[] {
  const short = primaryTitle(stripAnnotations(title));
  const primaryAuth = primaryAuthor(author);

  // ordered from most to least precise; first query that returns a scoreable
  // volume wins, so precision degrades gracefully instead of guessing blind
  const queries = [`intitle:${short} inauthor:${primaryAuth}`];

  if (short !== title) queries.push(`intitle:${title} inauthor:${primaryAuth}`);
  queries.push(`intitle:${short} inauthor:${primaryAuth}`.length > 0 ? `intitle:${short}` : "");
  queries.push(`${short} ${primaryAuth}`); // free-text fallback, no field restrictions

  return [...new Set(queries.filter(Boolean))];
}

async function searchVolume(title: string, author: string, log: (msg: string) => void): Promise<GoogleVolume | null> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const queries = buildQueries(title, author);

  let bestVolume: GoogleVolume | null = null;
  let bestScore = 0;

  for (const query of queries) {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "5");
    url.searchParams.set("printType", "books");
    if (key) url.searchParams.set("key", key);

    const response = await fetchWithRetry(url);
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      log(`query "${query}" failed: ${response.status} ${body.slice(0, 150)}`);
      continue;
    }

    const payload = (await response.json()) as GoogleBooksResponse;
    const volumes = payload.items ?? [];
    if (volumes.length === 0) continue;

    const scored = volumes
      .map((volume) => ({ volume, score: scoreVolume(volume, title, author) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score > bestScore) {
      bestVolume = best.volume;
      bestScore = best.score;
    }

    // a confident match on a precise query beats trying looser fallbacks
    if (bestScore >= 100) break;
  }

  if (bestVolume && bestScore < MIN_ACCEPT_SCORE) return null;
  return bestVolume;
}

/** Searches Google Books for `title`/`author`, returning the best-scoring
 * match's metadata (including, crucially, its ISBN — the key the
 * OpenLibrary lookup needs) or null when nothing scores above
 * MIN_ACCEPT_SCORE. `log` defaults to a no-op; the CLI backfill script
 * passes `console.log` for its own progress output, the single-material
 * background enrichment path leaves it silent. */
export async function searchGoogleBooks(
  title: string,
  author: string,
  log: (msg: string) => void = () => {}
): Promise<GoogleMetaData | null> {
  const volume = await searchVolume(title, author, log);
  if (!volume?.volumeInfo) return null;

  const info = volume.volumeInfo;
  const { thumbnail, cover } = resolveImageLinks(info.imageLinks);
  return {
    googleBooksId: volume.id,
    isbn: extractIsbn(info.industryIdentifiers),
    coverUrl: cover,
    thumbnailUrl: thumbnail,
    description: typeof info.description === "string" && info.description.trim() ? info.description.trim() : null,
    title: info.title?.trim() || null,
    author: info.authors?.length ? info.authors.join(", ") : null,
  };
}
