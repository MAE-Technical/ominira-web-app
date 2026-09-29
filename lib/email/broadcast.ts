import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { ANNOUNCEMENT_FROM, renderAnnouncement } from "@/lib/email/announcement";
import { RESEND_BATCH_MAX, sendBatch, type OutgoingEmail } from "@/lib/email/resend";
import { unsubscribeUrls } from "@/lib/email/unsubscribe";

// Resend's default limit is 2 requests/second; stay just under it.
const MIN_BATCH_INTERVAL_MS = 550;

/**
 * Emails an announcement to every reader who opted in
 * (readers.email_announcements). One email per recipient — never a shared
 * To/BCC — so each carries its own unsubscribe link and nobody sees anyone
 * else's address. Keyset-paged by id, one Resend batch (≤100) per page.
 * `broadcastId` seeds each batch's idempotency key. Returns tallies for the
 * push_broadcasts history row.
 */
export async function sendEmailBroadcast(
  broadcastId: string,
  message: { title: string; body: string; url: string }
): Promise<{ recipientCount: number; failureCount: number }> {
  const admin = getSupabaseAdminClient();
  let after: string | null = null;
  let recipientCount = 0;
  let accepted = 0;
  let lastBatchAt = 0;

  for (let page = 0; ; page++) {
    let query = admin.from("readers").select("id, email").eq("email_announcements", true).order("id").limit(RESEND_BATCH_MAX);
    if (after) query = query.gt("id", after);
    const { data } = await query;
    if (!data?.length) break;

    const emails: OutgoingEmail[] = data.map((reader) => {
      const unsubscribe = unsubscribeUrls(reader.id);
      return {
        from: ANNOUNCEMENT_FROM,
        to: [reader.email],
        subject: message.title,
        ...renderAnnouncement({ ...message, unsubscribeUrl: unsubscribe.page }),
        headers: {
          "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    const wait = lastBatchAt + MIN_BATCH_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastBatchAt = Date.now();

    recipientCount += emails.length;
    accepted += await sendBatch(emails, `broadcast-${broadcastId}-${page}`);
    if (data.length < RESEND_BATCH_MAX) break;
    after = data[data.length - 1].id;
  }

  return { recipientCount, failureCount: recipientCount - accepted };
}
