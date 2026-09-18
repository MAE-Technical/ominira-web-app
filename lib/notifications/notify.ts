import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { sendToReader } from "@/lib/push/send";
import type { NotificationKind } from "@/lib/notifications/types";

export type NotifyPayload = {
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  // Collapses duplicate pushes (e.g. five reactions on the same note in a
  // minute) — the in-app row always gets its own entry regardless, since a
  // reader's notification feed should show each event, not just each push.
  tag?: string;
};

// The one place a reader-targeted event becomes both an in-app row and a
// push — reaction/reply routes call this instead of writing to
// `notifications` and calling sendToReader separately, so the two can never
// drift out of sync. Fire-and-forget from the caller's perspective: never
// awaited into an API response, same spirit as lib/push/send.ts.
export async function notifyReader(readerId: string, payload: NotifyPayload) {
  const admin = getSupabaseAdminClient();
  await admin.from("notifications").insert({
    reader_id: readerId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });
  void sendToReader(readerId, payload);
}

const NOTIFY_ALL_BATCH_SIZE = 500;

// A broadcast's in-app side: one notifications row per reader (not per push
// subscription — a logged-in reader without notification permission should
// still see it in their feed). Push delivery itself stays on
// push_subscriptions via sendBroadcast (lib/push/send.ts); these are two
// separate recipient lists on purpose.
export async function notifyAllReaders(payload: Omit<NotifyPayload, "kind" | "tag">) {
  const admin = getSupabaseAdminClient();
  let from = 0;
  for (;;) {
    const { data } = await admin.from("readers").select("id").range(from, from + NOTIFY_ALL_BATCH_SIZE - 1);
    if (!data?.length) break;
    await admin.from("notifications").insert(
      data.map((reader) => ({ reader_id: reader.id, kind: "broadcast" as const, title: payload.title, body: payload.body, url: payload.url }))
    );
    if (data.length < NOTIFY_ALL_BATCH_SIZE) break;
    from += NOTIFY_ALL_BATCH_SIZE;
  }
}
