/**
 * The PIN gate in front of /admin and /api/admin (enforced in proxy.ts).
 * Entering `ADMIN_PIN` on /admin/unlock sets a signed, expiring cookie.
 *
 * The signature is keyed on SUPABASE_SECRET_KEY rather than the PIN itself —
 * a 6-digit PIN is too little entropy to key an HMAC, and a leaked cookie
 * would let anyone brute-force it offline. The PIN is folded into the signed
 * message instead, so rotating it signs everyone out.
 *
 * Web Crypto only, so this runs in proxy.ts as well as in server actions.
 */
export const ADMIN_COOKIE = "ominira_admin";
export const ADMIN_SESSION_SECONDS = 60 * 60 * 12;

const encoder = new TextEncoder();

async function sign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.SUPABASE_SECRET_KEY ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Length-independent comparison, so timing doesn't leak how much matched. */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function configuredPin(): string | null {
  const pin = process.env.ADMIN_PIN?.trim();
  return pin && process.env.SUPABASE_SECRET_KEY ? pin : null;
}

export function isCorrectPin(input: string): boolean {
  const pin = configuredPin();
  return pin !== null && safeEqual(input.trim(), pin);
}

/**
 * Second factor for the push broadcast (app/api/admin/push/broadcast): being
 * in /admin isn't enough to message every member — the sender must also know
 * `PUSH_SEND_PIN`. Fails closed when unset. Case-sensitive, like ADMIN_PIN.
 */
export function isCorrectPushPin(input: string): boolean {
  const pin = process.env.PUSH_SEND_PIN?.trim();
  return !!pin && safeEqual(input.trim(), pin);
}

export async function createAdminSession(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
  return `${exp}.${await sign(`${exp}:${configuredPin()}`)}`;
}

export async function verifyAdminSession(token: string | undefined): Promise<boolean> {
  const pin = configuredPin();
  if (!pin || !token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) * 1000 < Date.now()) return false;
  return safeEqual(sig, await sign(`${exp}:${pin}`));
}
