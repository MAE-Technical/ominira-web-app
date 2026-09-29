import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { listBookmarkedIds } from "@/lib/bookmarks/store";
import { toMaterialSummary } from "@/lib/materials/summary";
import { MATERIAL_SUMMARY_COLUMNS } from "@/lib/materials/columns";
import { enrichFeedItems } from "@/lib/community/feed";
import type { NoteRow } from "@/lib/community/notes";

/**
 * This reader's Saved shelf — `?type=material` (the Reading page's Saved
 * tab) or `?type=post`.
 *
 * Two response shapes behind one route, discriminated by `type`: books come
 * back as `MaterialSummary[]` (what BookListRow takes) and posts as
 * `FeedItem[]` (what NoteCard takes, same as the home feed's own page), so
 * each tab renders through the component it already shares with the rest of
 * the app rather than a Saved-specific card.
 *
 * `.in(id)` loses the ordering, so both branches re-sort in app code against
 * the bookmark ids, which already came back most-recently-saved first — a
 * Saved shelf is ordered by when *you* saved something, not by when it was
 * published or last touched.
 */
export async function GET(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const type = new URL(request.url).searchParams.get("type") ?? "material";
  if (type !== "material" && type !== "post") return validationError("type must be 'material' or 'post'.");

  const ids = await listBookmarkedIds(reader.readerId, type);
  if (ids.length === 0) return NextResponse.json({ items: [] });

  const admin = getSupabaseAdminClient();

  if (type === "material") {
    const { data, error } = await admin.from("materials").select(MATERIAL_SUMMARY_COLUMNS).in("id", ids);
    // Loud, not an empty shelf: the flatMap below drops any id it can't
    // hydrate, so a failed query here is indistinguishable from "you saved
    // nothing" unless it throws.
    if (error) throw new Error(`bookmarks: material hydration failed — ${error.message}`);
    const byId = new Map((data ?? []).map((m) => [m.id, m]));
    // A bookmarked material the reader can no longer see (someone else's
    // upload since made private) simply drops out — the purge trigger only
    // covers deletion, not a visibility change.
    const items = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toMaterialSummary(row)] : [];
    });
    return NextResponse.json({ items });
  }

  const { data, error } = await admin.from("posts").select("*").in("id", ids);
  if (error) throw new Error(`bookmarks: post hydration failed — ${error.message}`);
  // Same visibility rule as every other notes-reading path: a private post
  // is only ever visible to its own author (who is the only one who could
  // have bookmarked it anyway, but the filter stays for the case where a
  // post was public when saved and has since been made private).
  const rows = ((data ?? []) as NoteRow[]).filter((r) => r.visibility === "public" || r.reader_id === reader.readerId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  return NextResponse.json({ items: await enrichFeedItems(ordered, reader.readerId) });
}
