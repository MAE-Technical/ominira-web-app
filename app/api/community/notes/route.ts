import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound, unauthorized, validationError } from "@/lib/api/errors";
import { decodeCursor, encodeCursor, keysetBeforeFilter, type Keyset } from "@/lib/api/cursor";
import { resolveMaterialRow } from "@/lib/materials/resolve";
import { contentToColumns, hydrateNotes, resolveTopicIdForNewThread, type NoteRow } from "@/lib/community/notes";
import { enrichFeedItems } from "@/lib/community/feed";
import type { AnnotationRange, NoteContent } from "@/lib/api/types";
import { notifyReader } from "@/lib/notifications/notify";
import { noteInteractionUrl } from "@/lib/notifications/noteTarget";
import { comradeName } from "@/lib/reader/authorDisplay";

type Sort = "recent" | "top" | "trending";
type TopCursor = { reactionCount: number; createdAt: string; id: string };
// Trending's window is candidates only, re-scored on every request — the
// cursor just needs to know where the caller left off in that ranking, not
// a stable value that survives new reactions landing in between (see the
// "recompute + find index" approach below).
type TrendingCursor = { id: string };

const TRENDING_WINDOW_DAYS = 14;
const TRENDING_CANDIDATE_CAP = 300;

function trendingScore(row: NoteRow): number {
  const hoursSinceCreated = (Date.now() - new Date(row.created_at).getTime()) / 3_600_000;
  return row.reaction_count / Math.pow(hoursSinceCreated + 2, 1.5);
}

async function fetchPage(sort: Sort, limit: number, cursor: unknown) {
  const admin = getSupabaseAdminClient();
  const base = admin.from("posts").select("*").is("parent_id", null).eq("visibility", "public");

  if (sort === "top") {
    let query = base.order("reaction_count", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
    const c = cursor as TopCursor | null;
    if (c) {
      query = query.or(
        `reaction_count.lt.${c.reactionCount},and(reaction_count.eq.${c.reactionCount},created_at.lt.${c.createdAt}),and(reaction_count.eq.${c.reactionCount},created_at.eq.${c.createdAt},id.lt.${c.id})`
      );
    }
    const { data } = await query.limit(limit + 1);
    const rows = (data ?? []) as NoteRow[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor<TopCursor>({ reactionCount: last.reaction_count, createdAt: last.created_at, id: last.id }) : null;
    return { page, nextCursor };
  }

  if (sort === "trending") {
    // Simplest-correct implementation per api-spec.md: recency-weighted
    // score over a recent-created candidate window, computed here rather
    // than via a DB-side ranking function. Re-ranked on every request, so
    // the cursor is "resume after this id in the freshly recomputed order,"
    // not a stable offset — acceptable drift at this scale; tune later.
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000).toISOString();
    const { data } = await base.gte("created_at", since).order("created_at", { ascending: false }).limit(TRENDING_CANDIDATE_CAP);
    const ranked = ((data ?? []) as NoteRow[]).sort((a, b) => trendingScore(b) - trendingScore(a) || b.id.localeCompare(a.id));
    const c = cursor as TrendingCursor | null;
    const startIndex = c ? ranked.findIndex((r) => r.id === c.id) + 1 : 0;
    const page = ranked.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < ranked.length;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor<TrendingCursor>({ id: last.id }) : null;
    return { page, nextCursor };
  }

  // recent (default)
  let query = base.order("created_at", { ascending: false }).order("id", { ascending: false });
  const c = cursor as Keyset | null;
  if (c) query = query.or(keysetBeforeFilter(c));
  const { data } = await query.limit(limit + 1);
  const rows = (data ?? []) as NoteRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor<Keyset>({ createdAt: last.created_at, id: last.id }) : null;
  return { page, nextCursor };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sort = (url.searchParams.get("sort") as Sort | null) ?? "recent";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
  const cursorParam = url.searchParams.get("cursor");
  const cursor = sort === "top" ? decodeCursor<TopCursor>(cursorParam) : sort === "trending" ? decodeCursor<TrendingCursor>(cursorParam) : decodeCursor<Keyset>(cursorParam);

  const reader = await getAuthenticatedReader(request);
  const { page, nextCursor } = await fetchPage(sort, limit, cursor);
  const items = await enrichFeedItems(page, reader?.readerId);

  return NextResponse.json({ items, nextCursor });
}

type CreateNoteBody = {
  materialId?: string;
  ranges?: AnnotationRange[];
  content?: NoteContent;
  parentId?: string;
  visibility?: "public" | "private";
};

function rangesEqual(a: AnnotationRange[], b: AnnotationRange[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.passageId === b[i].passageId && r.start === b[i].start && r.end === b[i].end);
}

export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json()) as CreateNoteBody;
  // `ranges` may be empty — a book-level note with no text anchor (see
  // NotesFeedFab's general-note composer) rather than one tied to a
  // highlight. A reply still can't invent its own anchor independent of its
  // parent: the rangesEqual check below already enforces a reply's ranges
  // exactly match its resolved thread root's (vacuously true when both are
  // empty), so a reply to a general note naturally stays rangeless too.
  if (!body.materialId || !Array.isArray(body.ranges) || !body.content) {
    return validationError("materialId, ranges, and content are required.");
  }
  if (body.content.kind === "voice" && !body.content.audioUrl.includes("/storage/v1/object/public/voice-notes/")) {
    return validationError("audioUrl must come from POST /api/community/voice-notes.", "content");
  }

  const material = await resolveMaterialRow(body.materialId);
  if (!material) return notFound();

  const admin = getSupabaseAdminClient();
  let parentId: string | null = null;
  let replyingToId: string | null = null;
  let replyTargetReaderId: string | null = null;
  let replyRootNoteId: string | null = null;
  let topicId: string;

  if (body.parentId) {
    // Mirrors stores/library-store.ts's addNote resolution exactly: whichever
    // note was actually tapped "Reply" on (root or another reply) resolves
    // to the thread's true top-level note; replyingToId is stamped only
    // when that target wasn't already the root.
    const { data: target } = await admin.from("posts").select("*").eq("id", body.parentId).maybeSingle();
    if (!target) return notFound();
    if (!rangesEqual(target.ranges as AnnotationRange[], body.ranges)) {
      return validationError("A reply must use the same ranges as its parent thread.", "ranges");
    }
    parentId = target.parent_id ?? target.id;
    replyingToId = target.parent_id ? target.id : null;
    replyTargetReaderId = target.reader_id;
    replyRootNoteId = parentId;
    topicId = target.topic_id;
  } else {
    topicId = await resolveTopicIdForNewThread(admin, material.id);
  }

  const { data, error } = await admin
    .from("posts")
    .insert({
      reader_id: reader.readerId,
      topic_id: topicId,
      material_id: material.id,
      parent_id: parentId,
      replying_to_id: replyingToId,
      ranges: body.ranges,
      visibility: body.visibility ?? "public",
      ...contentToColumns(body.content),
    })
    .select("*")
    .single();

  if (error || !data) return validationError("Could not create note.");

  // Fire-and-forget — never let a push failure affect the create response.
  // No self-notification when replying to your own note.
  if (replyTargetReaderId && replyTargetReaderId !== reader.readerId) {
    void (async () => {
      const { data: actor } = await admin.from("readers").select("pseudonym").eq("id", reader.readerId).maybeSingle();
      const url = await noteInteractionUrl({
        materialSlug: material.slug,
        ranges: body.ranges ?? [],
        rootNoteId: replyRootNoteId!,
      });
      const actorName = actor?.pseudonym ? comradeName(actor.pseudonym) : "A comrade";
      await notifyReader(replyTargetReaderId, {
        kind: "reply",
        title: `💬 ${actorName} replied to your note`,
        body: `Tap to view in ${material.title}`,
        url,
        tag: `note-reply-${replyRootNoteId}`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
      });
    })();
  }

  const [note] = await hydrateNotes([data], reader.readerId);
  return NextResponse.json(note, { status: 201 });
}
