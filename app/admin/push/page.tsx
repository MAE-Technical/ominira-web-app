import type { Metadata } from "next";
import PushAdminView from "./PushAdminView";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { isResendConfigured } from "@/lib/email/resend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Broadcast admin",
  robots: { index: false, follow: false },
};

export default async function AdminPushPage() {
  const admin = getSupabaseAdminClient();
  // Audience figures are head-only counts — no rows cross the wire.
  const [history, members, devices, emailSubscribers] = await Promise.all([
    admin
      .from("push_broadcasts")
      .select("id, title, body, url, recipient_count, failure_count, channels, email_recipient_count, email_failure_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("readers").select("id", { count: "exact", head: true }),
    admin.from("push_subscriptions").select("id", { count: "exact", head: true }),
    admin.from("readers").select("id", { count: "exact", head: true }).eq("email_announcements", true),
  ]);

  if (history.error) throw new Error(`Could not load broadcast history: ${history.error.message}`);

  return (
    <PushAdminView
      broadcasts={history.data ?? []}
      audience={{ members: members.count ?? 0, devices: devices.count ?? 0, emailSubscribers: emailSubscribers.count ?? 0 }}
      emailEnabled={isResendConfigured()}
    />
  );
}
