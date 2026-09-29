import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { isValidUnsubscribeToken } from "@/lib/email/unsubscribe";

/**
 * RFC 8058 one-click unsubscribe — the `List-Unsubscribe-Post` target mail
 * clients (Gmail, Apple Mail…) POST to from their own "Unsubscribe" button.
 * Only POST: link scanners GET every URL in an email, so the human-facing
 * link goes to the /unsubscribe confirmation page instead.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const readerId = params.get("r") ?? "";
  if (!isValidUnsubscribeToken(readerId, params.get("t") ?? "")) {
    return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 400 });
  }
  await getSupabaseAdminClient().from("readers").update({ email_announcements: false }).eq("id", readerId);
  return NextResponse.json({ ok: true });
}
