import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** SSRF guard shared by every server-side fetch of a reader-supplied URL —
 * link-preview's og:scrape and the web-page reader ingestion route
 * (document-readers-spec.md § 4) both fetch arbitrary third-party URLs from
 * our own server on a reader's say-so; left unchecked that's a textbook
 * SSRF vector (a reader posting/pasting http://169.254.169.254/… or an
 * internal hostname to probe our own network). Only plain public http(s)
 * hosts are ever actually fetched — callers fall back to "couldn't fetch
 * this" behavior for anything else, never a distinguishable error that
 * would leak "that host looks internal". */
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

export async function isSafeToFetch(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.hostname === "localhost") return false;

  try {
    const records = await lookup(parsed.hostname, { all: true });
    return records.every((r) => !isPrivateIp(r.address));
  } catch {
    // Couldn't resolve at all — nothing to fetch either way.
    return false;
  }
}

/** Same timeout/UA convention as link-preview's own fetchOgMetadata — some
 * sites (Twitter/X, LinkedIn, …) only render real content for a recognized
 * crawler UA, not a plain browser one. Callers still must call
 * `isSafeToFetch` first; this performs no SSRF check itself. */
export const FETCH_TIMEOUT_MS = 5000;
export const SAFE_FETCH_USER_AGENT = "Mozilla/5.0 (compatible; ominira-link-preview/1.0; +https://ominira.app)";
