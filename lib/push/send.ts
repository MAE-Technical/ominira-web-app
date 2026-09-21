import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getWebPush } from "@/lib/push/vapid";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  // Same tag collapses multiple notifications into one — e.g. five reactions
  // on the same note in a minute shouldn't stack five system notifications.
  tag?: string;
  // Optional overrides for icon/badge — defaults to the Ominira mark
  // in sw.js if omitted.
  icon?: string;
  badge?: string;
};

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

const BROADCAST_BATCH_SIZE = 200;

// Sends to one subscription row; on a 404/410 (gone/expired) deletes it so
// the table stays clean without a separate cron job. Never throws — a push
// failure must not surface as an API error to the caller that triggered it.
// Returns whether the send itself succeeded, for sendBroadcast's tally —
// event-triggered callers (sendToReader/sendToReaders) don't need this, a
// single reader's push failing silently is fine, unlike a broadcast where an
// admin wants to know how many actually went out.
async function sendToSubscription(row: SubscriptionRow, payload: PushPayload): Promise<boolean> {
  try {
    await getWebPush().sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await getSupabaseAdminClient().from("push_subscriptions").delete().eq("id", row.id);
    } else {
      console.warn("push send failed", { subscriptionId: row.id, statusCode, error });
    }
    return false;
  }
}

async function sendToRows(rows: SubscriptionRow[], payload: PushPayload) {
  const results = await Promise.allSettled(rows.map((row) => sendToSubscription(row, payload)));
  return results.filter((result) => result.status === "fulfilled" && result.value).length;
}

// Fire-and-forget from a route handler: `void sendToReader(...)` after the
// triggering row (reaction/reply) is committed — never awaited into the
// response, per lib/push's design (a push failure is best-effort, same
// spirit as deleteMaterialAssets in the admin materials DELETE route).
export async function sendToReader(readerId: string, payload: PushPayload) {
  const { data } = await getSupabaseAdminClient()
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("reader_id", readerId);
  if (data?.length) await sendToRows(data, payload);
}

export async function sendToReaders(readerIds: string[], payload: PushPayload) {
  if (readerIds.length === 0) return;
  const { data } = await getSupabaseAdminClient()
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("reader_id", readerIds);
  if (data?.length) await sendToRows(data, payload);
}

// Everyone with a live subscription — installed PWA or plain web. Paginated
// so a large table doesn't open thousands of concurrent HTTPS requests at
// once; each page is still sent with allSettled so one bad batch member
// never blocks the rest. Returns tallies so the caller (the admin broadcast
// route) can record a push_broadcasts history row.
export async function sendBroadcast(payload: PushPayload): Promise<{ recipientCount: number; failureCount: number }> {
  const admin = getSupabaseAdminClient();
  let from = 0;
  let recipientCount = 0;
  let succeeded = 0;
  for (;;) {
    const { data } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .range(from, from + BROADCAST_BATCH_SIZE - 1);
    if (!data?.length) break;
    recipientCount += data.length;
    succeeded += await sendToRows(data, payload);
    if (data.length < BROADCAST_BATCH_SIZE) break;
    from += BROADCAST_BATCH_SIZE;
  }
  return { recipientCount, failureCount: recipientCount - succeeded };
}
