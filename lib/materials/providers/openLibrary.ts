// OpenLibrary lookup — a single deterministic fetch keyed on an ISBN
// (already known by the time this runs, from lib/materials/providers/
// googleBooks.ts's own search), not a title/author search: no scoring
// needed. Shared by scripts/generate-material-openlibrary-metadata.ts
// (batch backfill) and lib/materials/enrichMaterial.ts (single material,
// right after its own upload) — one implementation, not two.
import type { OpenLibraryMetaData } from "@/lib/materials/providerMeta";

type OpenLibraryAuthor = { name?: string };

type OpenLibraryBookData = {
  authors?: OpenLibraryAuthor[];
  excerpts?: { text?: string }[];
  notes?: string | { value?: string };
};

const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const REQUEST_DELAY_MS = 120; // OpenLibrary has no published hard quota, but stay polite
const RETRY_BASE_MS = 2_000;
const RETRY_STEP_MS = 2_000;

function cleanUrl(value?: string | null): string | null {
  const url = value?.trim();
  if (!url) return null;
  return url.replace(/^http:\/\//, "https://");
}

function resolveDescription(entry: OpenLibraryBookData): string | null {
  const excerpt = entry.excerpts?.[0]?.text?.trim();
  if (excerpt) return excerpt;
  const notes = typeof entry.notes === "string" ? entry.notes : entry.notes?.value;
  return notes?.trim() || null;
}

async function fetchWithRetry(url: URL, method: "GET" | "HEAD" = "GET"): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, { method });
    if (!RETRY_STATUS_CODES.has(response.status)) return response;

    lastResponse = response;
    if (attempt === MAX_RETRIES) break;

    const wait = RETRY_BASE_MS + attempt * RETRY_STEP_MS;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  return lastResponse!;
}

/** The Books API's `jscmd=data` cover field undercounts: it only reports a cover when
 * OpenLibrary has a full edition record, but their ISBN -> cover-image lookup
 * (covers.openlibrary.org) is populated more broadly than that. So check the covers
 * service directly rather than trusting `jscmd=data`'s embedded `cover` object.
 * `default=false` is required or a miss 200s with their generic placeholder gif
 * instead of 404ing. One size probed (L) is enough — covers.openlibrary.org derives
 * every size from the same stored image, so if L resolves, M does too. */
async function probeCover(isbn: string): Promise<{ cover: string | null; thumbnail: string | null }> {
  const probeUrl = new URL(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`);
  probeUrl.searchParams.set("default", "false");

  const response = await fetchWithRetry(probeUrl, "HEAD");
  await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));

  if (response.status !== 200) return { cover: null, thumbnail: null };
  // Store the plain (no default=false) URLs — existence is already confirmed, and the
  // plain URL degrades to OpenLibrary's own placeholder rather than a hard 404 in the
  // unlikely case the image later disappears.
  return {
    cover: cleanUrl(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`),
    thumbnail: cleanUrl(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`),
  };
}

async function fetchBookData(isbn: string): Promise<OpenLibraryBookData | null> {
  const url = new URL("https://openlibrary.org/api/books");
  url.searchParams.set("bibkeys", `ISBN:${isbn}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("jscmd", "data");

  const response = await fetchWithRetry(url);
  await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));

  // A non-ok response here (404 in particular — confirmed against the real
  // API) just means OpenLibrary has no record for this ISBN at all, which
  // is common: Google Books' own ISBN match is often an edition OpenLibrary
  // never catalogued. That's a legitimate "no data", not a failure worth
  // throwing over — the caller already treats a null cover/description/
  // author the same way a 200-with-nothing response would be treated.
  if (!response.ok) return null;

  const payload = (await response.json()) as Record<string, OpenLibraryBookData>;
  return payload[`ISBN:${isbn}`] ?? null;
}

/** Looks up `isbn` on OpenLibrary — a cover-image probe and the `jscmd=data`
 * metadata fetch in parallel, same as the CLI backfill. Returns null only
 * when nothing at all came back (no cover, no thumbnail, no description);
 * a partial result (e.g. cover but no description) is still returned. */
export async function lookupOpenLibrary(isbn: string): Promise<OpenLibraryMetaData | null> {
  const [{ cover, thumbnail }, entry] = await Promise.all([probeCover(isbn), fetchBookData(isbn)]);
  const description = entry ? resolveDescription(entry) : null;
  const author = entry?.authors?.length ? entry.authors.map((a) => a.name).filter(Boolean).join(", ") : null;

  if (!cover && !thumbnail && !description && !author) return null;
  return { coverUrl: cover, thumbnailUrl: thumbnail, description, author: author || null };
}
