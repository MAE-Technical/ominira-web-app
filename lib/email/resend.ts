/**
 * Minimal Resend client — just the batch endpoint, over fetch, so there's no
 * SDK dependency. Not the Supabase SMTP setup: that only carries Supabase
 * Auth's own mail (password resets etc.); app-sent mail goes through here.
 */
const BATCH_URL = "https://api.resend.com/emails/batch";
export const RESEND_BATCH_MAX = 100;
const MAX_ATTEMPTS = 3;

export type OutgoingEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isResendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Sends up to RESEND_BATCH_MAX emails in one request. Retries rate limits
 * and 5xx with the same Idempotency-Key, so a retry after a timeout can't
 * double-send. Returns how many Resend accepted — a batch is all-or-nothing.
 */
export async function sendBatch(emails: OutgoingEmail[], idempotencyKey: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(emails),
    }).catch(() => null);

    if (res?.ok) return emails.length;
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      console.warn("resend batch failed", { status: res?.status, body: await res?.text().catch(() => null) });
      return 0;
    }
    const retryAfter = Number(res?.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt);
  }
}
