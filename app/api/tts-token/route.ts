import { createHmac } from "node:crypto";
import { getAuthenticatedReader } from "@/lib/auth/session";

// Long enough for a listening session, short enough that a leaked token
// soon stops working. The client refreshes it a minute before expiry.
const TTL_SECONDS = 60 * 60;

/**
 * A short-lived token for ominira-tts-server's /synthesize, so the browser
 * calls the TTS host directly and no audio passes through Vercel. The token
 * is `<sub>.<exp>.<sig>`: sig is the unpadded base64url HMAC-SHA256 of
 * `<sub>.<exp>` under TTS_TOKEN, which never leaves the server. Guests can
 * listen too (sub "guest"); the TTS host rate-limits each IP either way.
 */
export async function GET(request: Request) {
  const secret = process.env.TTS_TOKEN;
  if (!secret) throw new Error("TTS_TOKEN is not set.");

  const reader = await getAuthenticatedReader(request);
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${reader?.readerId ?? "guest"}.${expiresAt}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return Response.json({ token: `${payload}.${sig}`, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
