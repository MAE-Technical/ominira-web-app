import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound } from "@/lib/api/errors";
import { resolveMaterialRow } from "@/lib/materials/resolve";
import { decodeCursor, encodeCursor, keysetBeforeFilter, type Keyset } from "@/lib/api/cursor";
import { hydrateNotes, visibleToFilter, type NoteRow } from "@/lib/community/notes";
import { resolveExcerpt } from "@/lib/community/excerpt";
import { loadSectionLabels } from "@/lib/materials/sectionLabels";
import type { AnnotationRange } from "@/lib/api/types";

type Sort = "recent" | "top";
type TopCursor = { reactionCount: number; createdAt: string; id: string };

// Community notes anchored anywhere in this material — NOT the book's own
// footnotes (that's `GET /api/materials/{materialId}?fields=notes`, an
// entirely different thing; see lib/materials/projection.ts's own note on
// the same naming collision).
export async function GET(request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;
  const material = await resolveMaterialRow(materialId);
  if (!material) return notFound();

  const reader = await getAuthenticatedReader(request);
  const url = new URL(request.url);
  const sectionId = url.searchParams.get("sectionId");
  const sort = (url.searchParams.get("sort") as Sort | null) ?? "recent";
  // Opt-in: the reader's own inline-markers/annotation-feed use (
  // useMaterialNotes, a flat 200-at-a-time fetch with no quote of its own —
  // it resolves excerpts locally from passages it already has) never needed
  // this, so it stays a plain { note, replies } shape unless a caller
  // explicitly asks — the book details page's community-notes tab is the
  // one that does, since it renders each note the same way the home feed
  // does (quote above the thread).
  const withExcerpts = url.searchParams.get("withExcerpts") === "true";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
  const cursorParam = url.searchParams.get("cursor");
  const cursor = sort === "top" ? decodeCursor<TopCursor>(cursorParam) : decodeCursor<Keyset>(cursorParam);

  const admin = getSupabaseAdminClient();

  let query = admin
    .from("posts")
    .select("*")
    .eq("material_id", material.id)
    .is("parent_id", null)
    .or(visibleToFilter(reader?.readerId));
  // A passage id is its section's id plus "-p<n>", so a section's notes are
  // the ones whose first range starts in one of its passages.
  if (sectionId) query = query.like("ranges->0->>passageId", `${sectionId.replace(/[\\%_]/g, "\\$&")}-p%`);

  if (sort === "top") {
    query = query.order("reaction_count", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
    const c = cursor as TopCursor | null;
    if (c) {
      query = query.or(
        `reaction_count.lt.${c.reactionCount},and(reaction_count.eq.${c.reactionCount},created_at.lt.${c.createdAt}),and(reaction_count.eq.${c.reactionCount},created_at.eq.${c.createdAt},id.lt.${c.id})`
      );
    }
  } else {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    const c = cursor as Keyset | null;
    if (c) query = query.or(keysetBeforeFilter(c));
  }

  const { data, error } = await query.limit(limit + 1);
  if (error) return NextResponse.json({ items: [], nextCursor: null });
  const rows = (data ?? []) as NoteRow[];
  const labels = withExcerpts ? (await loadSectionLabels([material])).get(material.id) : undefined;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? sort === "top"
      ? encodeCursor<TopCursor>({ reactionCount: last.reaction_count, createdAt: last.created_at, id: last.id })
      : encodeCursor<Keyset>({ createdAt: last.created_at, id: last.id })
    : null;

  // Each NoteThread nests its full reply list — per-book note counts are
  // small enough that this is simpler than a second paginated call per
  // thread (api-spec.md).
  const { data: replyRows } = page.length
    ? await admin
        .from("posts")
        .select("*")
        .in(
          "parent_id",
          page.map((r) => r.id)
        )
        .or(visibleToFilter(reader?.readerId))
        .order("created_at", { ascending: true })
    : { data: [] as NoteRow[] };

  const hydratedById = new Map((await hydrateNotes([...page, ...(replyRows ?? [])], reader?.readerId)).map((n) => [n.id, n]));

  const items = page.map((root) => ({
    note: hydratedById.get(root.id)!,
    replies: (replyRows ?? []).filter((r) => r.parent_id === root.id).map((r) => hydratedById.get(r.id)!),
    ...(withExcerpts ? resolveExcerpt(root.ranges as AnnotationRange[], labels) : {}),
  }));

  return NextResponse.json({ items, nextCursor });
}
