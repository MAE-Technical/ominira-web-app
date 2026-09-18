import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";

type ReadBody = { id?: string };

// POST /api/notifications/read — { id } marks one notification read, no
// body (or {}) marks everything read (the /notifications page's "opened
// it, badge should clear" case).
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as ReadBody;
  const admin = getSupabaseAdminClient();

  let query = admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("reader_id", reader.readerId)
    .is("read_at", null);
  if (body.id) query = query.eq("id", body.id);

  await query;
  return NextResponse.json({ ok: true });
}
