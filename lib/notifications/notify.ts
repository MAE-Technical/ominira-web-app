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
  icon?: string;
  badge?: string;
  // In-app-only enrichment (Notifications page): who triggered this, and a
  // frozen copy of the text it was about. Neither travels in the push
  // payload — a push only ever shows title/body — so they're written to the
  // `notifications` row and dropped before sendToReader.
  actorReaderId?: string;
  snippet?: string | null;
};

// The one place a reader-targeted event becomes both an in-app row and a
// push — reaction/reply routes call this instead of writing to
// `notifications` and calling sendToReader separately, so the two can never
// drift out of sync. Fire-and-forget from the caller's perspective: never
// awaited into an API response, same spirit as lib/push/send.ts.
export async function notifyReader(readerId: string, payload: NotifyPayload) {
  const admin = getSupabaseAdminClient();
  const { actorReaderId, snippet, ...push } = payload;
  await admin.from("notifications").insert({
    reader_id: readerId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    actor_reader_id: actorReaderId ?? null,
    snippet: snippet ?? null,
  });
  void sendToReader(readerId, push);
}

const NOTIFY_ALL_BATCH_SIZE = 500;

// A broadcast's in-app side: one notifications row per reader (not per push
// subscription — a logged-in reader without notification permission should
// still see it in their feed). Push delivery itself stays on
// push_subscriptions via sendBroadcast (lib/push/send.ts); these are two
// separate recipient lists on purpose.
export async function notifyAllReaders(payload: Omit<NotifyPayload, "kind" | "tag">) {
  const admin = getSupabaseAdminClient();
  // Keyset-paged on id — an unordered offset range isn't guaranteed stable
  // across pages, so readers could be skipped or notified twice.
  let after: string | null = null;
  for (;;) {
    let query = admin.from("readers").select("id").order("id").limit(NOTIFY_ALL_BATCH_SIZE);
    if (after) query = query.gt("id", after);
    const { data } = await query;
    if (!data?.length) break;
    await admin.from("notifications").insert(
      data.map((reader) => ({ reader_id: reader.id, kind: "broadcast" as const, title: payload.title, body: payload.body, url: payload.url }))
    );
    if (data.length < NOTIFY_ALL_BATCH_SIZE) break;
    after = data[data.length - 1].id;
  }
}
