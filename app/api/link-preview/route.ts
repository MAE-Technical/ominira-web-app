import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { validationError } from "@/lib/api/errors";
import { isSafeToFetch, FETCH_TIMEOUT_MS, SAFE_FETCH_USER_AGENT } from "@/lib/net/safeFetch";

/** `GET /api/link-preview?url=` — shared by HomeComposer's auto-detected
 * link attachment and NoteContent's rendered note body (lib/community/
 * useLinkPreview.ts is the one client-side hook both go through). YouTube
 * links resolve via its public oEmbed endpoint (real title/author/
 * thumbnail, no API key needed); everything else gets a server-side
 * og:title/description/image scrape (plain `fetch` + cheerio — the
 * `link-preview-js` package pulls in its own bundled `undici`, which
 * collides with Next's own and crashes the route entirely, so this reads
 * the meta tags itself instead), since a client-side fetch of an arbitrary
 * third-party page would just hit CORS. Never throws a hard error back to
 * the client — an unfetchable/unfurled page still gets a same-shape
 * response (title/description/imageUrl all null, siteName from the
 * hostname) so the card always has *something* to render, matching the
 * mock's "defaults if metadata can't be retrieved" requirement. */

export type LinkPreviewResult = {
  url: string;
  kind: "video" | "link";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function fallback(url: string): LinkPreviewResult {
  return { url, kind: "link", title: null, description: null, imageUrl: null, siteName: hostnameOf(url) };
}

function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null;
    if (parsed.hostname.replace(/^www\./, "") === "youtube.com") {
      return parsed.searchParams.get("v") ?? (parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : null);
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchYoutubeOembed(url: string): Promise<LinkPreviewResult | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      url,
      kind: "video",
      title: data.title ?? null,
      description: data.author_name ? `${data.author_name} · YouTube` : null,
      imageUrl: data.thumbnail_url ?? null,
      siteName: "YouTube",
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return validationError("Missing url query param.", "url");

  if (!(await isSafeToFetch(url))) return NextResponse.json(fallback(url));

  const videoId = youtubeVideoId(url);
  if (videoId) {
    return NextResponse.json((await fetchYoutubeOembed(url)) ?? fallback(url));
  }

  return NextResponse.json(await fetchOgMetadata(url));
}

function metaContent($: cheerio.CheerioAPI, ...selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content")?.trim();
    if (value) return value;
  }
  return null;
}

async function fetchOgMetadata(url: string): Promise<LinkPreviewResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": SAFE_FETCH_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html")) return fallback(url);

    const html = await res.text();
    const $ = cheerio.load(html);
    const title = metaContent($, 'meta[property="og:title"]', 'meta[name="twitter:title"]') || $("title").first().text().trim() || null;
    const description = metaContent(
      $,
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]'
    );
    let imageUrl = metaContent($, 'meta[property="og:image"]', 'meta[name="twitter:image"]');
    if (imageUrl) {
      try {
        imageUrl = new URL(imageUrl, url).toString();
      } catch {
        imageUrl = null;
      }
    }
    const siteName = metaContent($, 'meta[property="og:site_name"]') || hostnameOf(url);

    return { url, kind: "link", title, description, imageUrl, siteName };
  } catch {
    return fallback(url);
  }
}
