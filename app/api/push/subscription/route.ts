import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { validationError } from "@/lib/api/errors";

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

// reader is optional here on purpose — a visitor can grant notification
// permission before logging in (see lib/push/send.ts's design note). Once
// they do log in, the client re-POSTs the same endpoint so it gets attached
// to their reader_id via the upsert below.
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  const body = (await request.json().catch(() => null)) as SubscribeBody | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return validationError("endpoint and keys.p256dh/auth are required.");
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      reader_id: reader?.readerId ?? null,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: request.headers.get("user-agent"),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) return validationError("Could not save this subscription.");
  return NextResponse.json({ subscribed: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return validationError("endpoint is required.");

  await getSupabaseAdminClient().from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  return NextResponse.json({ subscribed: false });
}
