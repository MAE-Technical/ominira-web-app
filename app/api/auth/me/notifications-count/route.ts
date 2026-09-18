import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";

// A plain count, polled by the header bell (NotificationsMenu.tsx) to badge
// unread notifications — mirrors notes-count/route.ts's shape exactly, kept
// separate from GET /api/notifications so the badge doesn't have to pull a
// full page of rows every poll.
export async function GET(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { count } = await getSupabaseAdminClient()
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("reader_id", reader.readerId)
    .is("read_at", null);

  return NextResponse.json({ count: count ?? 0 });
}
