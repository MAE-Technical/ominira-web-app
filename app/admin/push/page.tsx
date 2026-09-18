import type { Metadata } from "next";
import PushAdminView from "./PushAdminView";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Push admin",
  robots: { index: false, follow: false },
};

export default async function AdminPushPage() {
  const { data: broadcasts, error } = await getSupabaseAdminClient()
    .from("push_broadcasts")
    .select("id, title, body, url, recipient_count, failure_count, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Could not load broadcast history: ${error.message}`);

  return <PushAdminView broadcasts={broadcasts ?? []} />;
}
