import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";

/** The two things a reader can save (migrations/20261003_bookmarks.sql's own
 * check constraint). Widening this means widening that constraint too — the
 * DB is the real gate, this type just keeps callers honest. */
export type BookmarkTarget = "material" | "post";

/**
 * Every write here used to `const { data } =` and drop the error on the
 * floor, which made a failed save indistinguishable from a successful one:
 * toggleBookmark returned `true`, the button filled in, the reader's Saved
 * shelf stayed empty, and nothing anywhere — client console, server log,
 * DB — recorded that anything had gone wrong. A bookmark is a write the
 * reader is explicitly asking for; if it didn't land, the route has to 500
 * so the client's optimistic flip rolls back and the failure is visible.
 */
function assertOk(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`bookmarks: ${what} failed — ${error.message}`);
}

/**
 * Saves or unsaves one target for one reader — `POST /api/bookmarks`'s only
 * write, and a toggle rather than separate add/remove verbs for the same
 * reason the reaction routes are: the button is a toggle, and a
 * check-then-write keeps the client from having to track which of two
 * endpoints its current state implies.
 *
 * Returns the state the reader is now in (`true` = saved), which is what the
 * client reconciles its optimistic flip against.
 */
export async function toggleBookmark(readerId: string, targetType: BookmarkTarget, targetId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();

  const { data: existing, error: readError } = await admin
    .from("bookmarks")
    .select("target_id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("reader_id", readerId)
    .maybeSingle();
  assertOk(readError, "read");

  if (existing) {
    const { error } = await admin
      .from("bookmarks")
      .delete()
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .eq("reader_id", readerId);
    assertOk(error, "delete");
    return false;
  }

  const { error } = await admin
    .from("bookmarks")
    .insert({ target_type: targetType, target_id: targetId, reader_id: readerId });
  assertOk(error, "insert");
  return true;
}

/**
 * "Which of these did I save?" — the batch lookup hydrateNotes uses to fill
 * every note's `bookmarkedByMe` in one query for a whole feed page, exactly
 * as getReactedNoteIds does for `reactedByMe`.
 *
 * Empty set for a signed-out caller rather than a thrown error: nothing on a
 * public feed is gated on this, the flag just renders as "not saved".
 */
export async function getBookmarkedIds(
  readerId: string | undefined,
  targetType: BookmarkTarget,
  targetIds: string[]
): Promise<Set<string>> {
  if (!readerId || targetIds.length === 0) return new Set();
  const { data, error } = await getSupabaseAdminClient()
    .from("bookmarks")
    .select("target_id")
    .eq("target_type", targetType)
    .eq("reader_id", readerId)
    .in("target_id", targetIds);
  assertOk(error, "batch lookup");
  return new Set((data ?? []).map((row) => row.target_id));
}

/**
 * Every id of one type this reader has saved, most recently saved first
 * (bookmarks_reader_created_idx serves this ordering directly).
 *
 * Ids, not hydrated rows, because the two callers want different things from
 * them: the Saved shelf joins them against materials for full summaries,
 * while the client's bookmarked-ids query just needs the set — a book row in
 * the Library catalogue has to know whether it's saved, and those listings
 * are server-rendered with no caller identity threaded through
 * `toMaterialSummary` at all (unlike a note, which is always hydrated
 * per-caller). One small set fetched once beats adding a `callerId` to every
 * material-listing path in the app.
 */
export async function listBookmarkedIds(readerId: string, targetType: BookmarkTarget): Promise<string[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("bookmarks")
    .select("target_id")
    .eq("target_type", targetType)
    .eq("reader_id", readerId)
    .order("created_at", { ascending: false });
  assertOk(error, "shelf listing");
  return (data ?? []).map((row) => row.target_id);
}
