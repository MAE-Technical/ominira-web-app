import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";
import { decodeCursor, encodeCursor, keysetBeforeFilter, type Keyset } from "@/lib/api/cursor";
import { toAvatar } from "@/lib/avatar/avatar";

type ActorRow = { pseudonym: string; avatar_color: string | null; avatar_url: string | null };

function actorFields(actor: ActorRow | undefined) {
  return { actorPseudonym: actor?.pseudonym ?? null, actorAvatar: actor ? toAvatar(actor) : null };
}

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
    .select("id, kind, title, body, url, read_at, created_at, actor_reader_id, snippet")
    .eq("reader_id", reader.readerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (cursor) query = query.or(keysetBeforeFilter(cursor));

  const [{ data, error }, { count: unreadCount }] = await Promise.all([
    query.limit(limit + 1),
    admin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("reader_id", reader.readerId)
      .is("read_at", null),
  ]);

  // A failed query must not read as "no notifications" — an empty feed and a
  // broken one look identical to the page otherwise (which is exactly how a
  // missing column went unnoticed once).
  if (error) {
    console.error("Failed to read notifications", error);
    return NextResponse.json({ error: { code: "server_error", message: "Could not load notifications." } }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor<Keyset>({ createdAt: last.created_at, id: last.id }) : null;

  // Actor pseudonyms are joined at read time, in one query for the whole
  // page (not per row, and not snapshotted on the notification) — a reader
  // who renames themselves is renamed on their old notifications too, same
  // as everywhere else an identity is resolved. Older rows predate
  // actor_reader_id and simply carry no actor.
  const actorIds = [...new Set(page.map((row) => row.actor_reader_id).filter((id): id is string => !!id))];
  const { data: actorRows } = actorIds.length
    ? await admin.from("readers").select("id, pseudonym, avatar_color, avatar_url").in("id", actorIds)
    : { data: [] };
  const actorById = new Map((actorRows ?? []).map((actor) => [actor.id, actor]));

  return NextResponse.json({
    items: page.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      url: row.url,
      read: row.read_at !== null,
      createdAt: row.created_at,
      ...actorFields(row.actor_reader_id ? actorById.get(row.actor_reader_id) : undefined),
      snippet: row.snippet ?? null,
    })),
    nextCursor,
    unreadCount: unreadCount ?? 0,
  });
}
