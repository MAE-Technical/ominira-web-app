import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";

// Every note this reader has authored — top-level and replies alike, since
// a reply is still just a note the reader wrote (same "notes" language
// ReplyButton uses). A plain count query, no rows fetched, so it stays
// cheap regardless of how many notes a reader has made.
export async function GET(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { count } = await getSupabaseAdminClient()
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("reader_id", reader.readerId);

  return NextResponse.json({ count: count ?? 0 });
}
