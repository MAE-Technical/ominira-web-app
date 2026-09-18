import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";
import { decodeCursor, encodeCursor, keysetBeforeFilter, type Keyset } from "@/lib/api/cursor";

// GET /api/notifications — the feed behind the header bell
// (app/components/shell/NotificationsMenu.tsx) and the /notifications page.
// Cursor-paginated the same way as GET /api/community/notes ("recent" sort).
export async function GET(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
  const cursor = decodeCursor<Keyset>(url.searchParams.get("cursor"));

  const admin = getSupabaseAdminClient();

  let query = admin
    .from("notifications")
    .select("id, kind, title, body, url, read_at, created_at")
    .eq("reader_id", reader.readerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (cursor) query = query.or(keysetBeforeFilter(cursor));

  const [{ data }, { count: unreadCount }] = await Promise.all([
    query.limit(limit + 1),
    admin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("reader_id", reader.readerId)
      .is("read_at", null),
  ]);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor<Keyset>({ createdAt: last.created_at, id: last.id }) : null;

  return NextResponse.json({
    items: page.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      url: row.url,
      read: row.read_at !== null,
      createdAt: row.created_at,
    })),
    nextCursor,
    unreadCount: unreadCount ?? 0,
  });
}
