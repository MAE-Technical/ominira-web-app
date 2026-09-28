import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getCategories } from "@/lib/categories/config";

/** `GET /api/community/topics` — the curated topic list Home's topic
 * filter pills and composer topic-picker both read. Excludes
 * `source = 'legacy_migration'` pseudo-topics (one per pre-Topics note
 * thread root — never a real "browse topics" entry, see
 * migrations/20260919_topics_and_posts.sql's own header comment) and
 * anything not `status = 'active'`.
 *
 * Ordered to match config/categories.json — the same fixed list Library's
 * CategoryPills already reads (lib/categories/config.ts) — rather than
 * `post_count` descending: a topic naming a Categories-migration genre
 * (most of them; see migrations/20260919_topics_and_posts.sql's own
 * "Categories -> curated topics" backfill) should sit in the same spot a
 * reader already knows from Library, not reshuffle every time posting
 * activity shifts the ranking. Any topic with no match in that list
 * (freshly created ones, mainly) falls back after it, still ordered by
 * `post_count` so a genuinely trending new topic isn't buried.
 */
export async function GET() {
  const admin = getSupabaseAdminClient();
  const [{ data }, curatedOrder] = await Promise.all([
    admin
      .from("topics")
      .select("id, slug, name, post_count")
      .eq("status", "active")
      .neq("source", "legacy_migration")
      .order("post_count", { ascending: false }),
    getCategories(),
  ]);

  const rank = new Map(curatedOrder.map((name, i) => [name, i]));
  const topics = [...(data ?? [])].sort((a, b) => {
    const rankA = rank.get(a.name) ?? Infinity;
    const rankB = rank.get(b.name) ?? Infinity;
    return rankA - rankB;
  });

  return NextResponse.json({ topics });
}
