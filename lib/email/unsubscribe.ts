import { createHmac, timingSafeEqual } from "node:crypto";
import { PLATFORM_URL } from "@/lib/config/platform";

/**
 * Signed, non-expiring unsubscribe links for email announcements. The token
 * is an HMAC of the reader id, keyed on SUPABASE_SECRET_KEY (same key
 * lib/admin/pin.ts signs with) under its own "email-unsubscribe:" prefix, so
 * one can't be replayed as the other. No login needed — the link in the
 * email is the proof the recipient owns that inbox.
 */
function tokenFor(readerId: string): string {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "")
    .update(`email-unsubscribe:${readerId}`)
    .digest("base64url");
}

export function isValidUnsubscribeToken(readerId: string, token: string): boolean {
  if (!process.env.SUPABASE_SECRET_KEY || !readerId || !token) return false;
  const expected = Buffer.from(tokenFor(readerId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** `/unsubscribe` confirms on GET (link scanners prefetch links); the
 * `List-Unsubscribe-Post` one-click hits the API route directly. */
export function unsubscribeUrls(readerId: string) {
  const query = `r=${encodeURIComponent(readerId)}&t=${tokenFor(readerId)}`;
  return {
    page: `${PLATFORM_URL}/unsubscribe?${query}`,
    oneClick: `${PLATFORM_URL}/api/email/unsubscribe?${query}`,
  };
}
