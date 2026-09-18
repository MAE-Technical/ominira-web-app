import { NextResponse } from "next/server";
import { z } from "zod";
import { sendBroadcast } from "@/lib/push/send";
import { notifyAllReaders } from "@/lib/notifications/notify";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";

// No auth check — matches every other route under app/api/admin (see
// app/api/admin/materials/[materialId]/route.ts), which currently relies on
// the admin UI not being linked rather than a role check. Flagged to the
// user; add a real guard here before this is reachable from a public client.
const BroadcastSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  url: z.string().trim().min(1).max(500).default("/"),
});

export async function GET() {
  const { data } = await getSupabaseAdminClient()
    .from("push_broadcasts")
    .select("id, title, body, url, recipient_count, failure_count, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = BroadcastSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "title and body are required." }, { status: 400 });

  const { recipientCount, failureCount } = await sendBroadcast(parsed.data);
  await notifyAllReaders(parsed.data);

  const { data, error } = await getSupabaseAdminClient()
    .from("push_broadcasts")
    .insert({ ...parsed.data, recipient_count: recipientCount, failure_count: failureCount })
    .select("id, title, body, url, recipient_count, failure_count, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Sent, but could not record broadcast history." }, { status: 500 });
  return NextResponse.json({ item: data });
}
