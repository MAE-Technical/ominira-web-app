import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound, unauthorized, validationError } from "@/lib/api/errors";
import { decodeCursor, encodeCursor, keysetBeforeFilter, type Keyset } from "@/lib/api/cursor";
import { resolveMaterialRow } from "@/lib/materials/resolve";
import { contentToColumns, hydrateNotes, insertPostTopics, resolveTopicIdForNewThread, type NoteRow } from "@/lib/community/notes";
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

async function fetchPage(sort: Sort, limit: number, cursor: unknown, topicId: string | null) {
  const admin = getSupabaseAdminClient();
  let base = admin.from("posts").select("*").is("parent_id", null).eq("visibility", "public");
  if (topicId) {
    // Matches a post tagged under this topic at all (post_topics), not just
    // ones whose *default* topic_id is it — a multi-topic post should show
    // up under every topic it's tagged with.
    const { data: tagged, error: taggedError } = await admin.from("post_topics").select("post_id").eq("topic_id", topicId);
    if (taggedError) {
      // Surfaced loudly rather than swallowed into `[]` — a broken/missing
      // post_topics table would otherwise look identical to "this topic
      // genuinely has zero posts" on the client.
      console.error("post_topics lookup failed for topicId", topicId, taggedError);
      throw taggedError;
    }
    base = base.in("id", (tagged ?? []).map((t) => t.post_id));
  }

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
  const topicId = url.searchParams.get("topicId");

  const reader = await getAuthenticatedReader(request);
  const { page, nextCursor } = await fetchPage(sort, limit, cursor, topicId);
  const items = await enrichFeedItems(page, reader?.readerId);

  return NextResponse.json({ items, nextCursor });
}

type CreateNoteBody = {
  materialId?: string;
  ranges?: AnnotationRange[];
  content?: NoteContent;
  parentId?: string;
  visibility?: "public" | "private";
  /** A thread root's chosen topics, default first — always optional. A
   * book-anchored note falls back to resolveTopicIdForNewThread's own
   * auto-resolution; a `threadType: "discussion"` post with none gets a
   * throwaway archived topic (same shape as that fallback) so it only ever
   * shows up under "All". Ignored on a reply either way: it always
   * inherits its thread root's topics wholesale. */
  topicIds?: string[];
  /** "discussion" — a top-level, HomeComposer-style post: no book anchor
   * required, `materialId` (when present) is an attached book rather than
   * an annotation target, and there's no `ranges` to speak of. Omitted or
   * "note" keeps every existing book-anchored-note behavior (NoteComposer,
   * reader annotation flow) exactly as it was. Ignored on a reply — a
   * reply's thread_type is always inherited from its root, never chosen
   * independently. */
  threadType?: "note" | "discussion";
};

function rangesEqual(a: AnnotationRange[], b: AnnotationRange[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => r.passageId === b[i].passageId && r.start === b[i].start && r.end === b[i].end);
}

export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json()) as CreateNoteBody;
  if (!body.content) return validationError("content is required.", "content");
  if (body.content.kind === "voice" && !body.content.audioUrl.includes("/storage/v1/object/public/voice-notes/")) {
    return validationError("audioUrl must come from POST /api/community/voice-notes.", "content");
  }

  const isReply = !!body.parentId;
  const isDiscussion = !isReply && body.threadType === "discussion";

  if (!isReply && !isDiscussion) {
    // Book-anchored thread root — existing "note" behavior, unchanged.
    // `ranges` may be empty — a book-level note with no text anchor (see
    // NotesFeedFab's general-note composer) rather than one tied to a
    // highlight. A reply still can't invent its own anchor independent of
    // its parent: the rangesEqual check below already enforces a reply's
    // ranges exactly match its resolved thread root's (vacuously true when
    // both are empty), so a reply to a general note naturally stays
    // rangeless too.
    if (!body.materialId || !Array.isArray(body.ranges)) {
      return validationError("materialId and ranges are required.");
    }
  }
  // A reply's material comes from its resolved thread root below, never
  // from the client — see the isReply branch. A discussion post's material
  // is an optional attached book (kind: 'book_share' once resolved);
  // resolveMaterialRow's default publishedOnly still matches it, since a
  // reader upload is always `status: 'published'` regardless of its own
  // `personal`/`public` visibility (reader-uploads-spec.md § 1) — a
  // personal upload can attach to a post the same way a catalog book can.
  const material = !isReply && body.materialId ? await resolveMaterialRow(body.materialId) : null;
  if (!isReply && body.materialId && !material) return notFound();

  const admin = getSupabaseAdminClient();
  let parentId: string | null = null;
  let replyingToId: string | null = null;
  let replyRecipientReaderIds: string[] = [];
  let replyRootNoteId: string | null = null;
  let topicId: string;
  let topicIds: string[];
  let materialId: string | null = material?.id ?? null;
  let ranges: AnnotationRange[] | null = isDiscussion ? null : (body.ranges ?? null);
  let threadType: "note" | "discussion" = isDiscussion ? "discussion" : "note";

  if (isReply) {
    // Mirrors stores/library-store.ts's addNote resolution exactly: whichever
    // note was actually tapped "Reply" on (root or another reply) resolves
    // to the thread's true top-level note; replyingToId is stamped only
    // when that target wasn't already the root. material/ranges/thread_type
    // are inherited from that root rather than re-trusted from the client —
    // a reply can't switch books, add an anchor its root never had, or
    // become a different thread_type than the thread it's replying into.
    const { data: target } = await admin.from("posts").select("*").eq("id", body.parentId!).maybeSingle();
    if (!target) return notFound();
    if (!rangesEqual((target.ranges as AnnotationRange[] | null) ?? [], body.ranges ?? [])) {
      return validationError("A reply must use the same ranges as its parent thread.", "ranges");
    }
    parentId = target.parent_id ?? target.id;
    replyingToId = target.parent_id ? target.id : null;
    replyRootNoteId = parentId;
    topicId = target.topic_id;
    materialId = target.material_id;
    ranges = target.ranges as AnnotationRange[] | null;
    threadType = target.thread_type;

    // Notify the immediate parent's author (the reply you tapped "Reply" on)
    // and, when that target isn't itself the thread root, the root note's
    // author too — otherwise a reply-to-a-reply never reaches the original
    // note author. Deduped since both can be the same reader.
    const recipientIds = new Set<string>([target.reader_id]);
    if (target.parent_id) {
      const { data: root } = await admin.from("posts").select("reader_id").eq("id", target.parent_id).maybeSingle();
      if (root?.reader_id) recipientIds.add(root.reader_id);
    }
    recipientIds.delete(reader.readerId); // no self-notification
    replyRecipientReaderIds = [...recipientIds];
    topicIds = []; // unused for a reply — it inherits the root's post_topics rows, never writes its own
  } else if (body.topicIds && body.topicIds.length > 0) {
    [topicId] = body.topicIds;
    topicIds = body.topicIds;
  } else if (isDiscussion) {
    // A discussion post's topics are optional — but posts.topic_id is
    // NOT NULL (migrations/20260919_topics_and_posts.sql), so an untagged
    // post gets the same kind of throwaway archived topic
    // resolveTopicIdForNewThread falls back to for a material with no
    // linked topic. It's excluded from the topics list/picker (status !=
    // 'active') and gets no post_topics row, so the post only ever shows
    // up under "All" — same end result as "no topic" would look like.
    topicId = crypto.randomUUID();
    await admin.from("topics").insert({
      id: topicId,
      slug: `note-${topicId}`,
      name: `Note ${topicId}`,
      source: "legacy_migration",
      status: "archived",
    });
    topicIds = [];
  } else {
    // Reached only for a book-anchored thread root with no explicit
    // topicIds — material here is guaranteed non-null (validated at the top).
    topicId = await resolveTopicIdForNewThread(admin, material!.id);
    topicIds = [topicId];
  }

  // A post with no material can never be kind='citation' — the
  // posts_citation_requires_material check constraint forbids it — so
  // anything material-less (a book-less discussion post, or a reply into
  // one) gets 'text' instead; an attached book on a discussion thread root
  // gets 'book_share' rather than 'citation' (that's reserved for an
  // actual reader-anchored quote). Every book-anchored note/reply keeps
  // contentToColumns' own 'citation'/'voice' default, unchanged.
  const kind = isDiscussion ? (materialId ? "book_share" : "text") : materialId ? undefined : "text";

  const { data, error } = await admin
    .from("posts")
    .insert({
      reader_id: reader.readerId,
      topic_id: topicId,
      material_id: materialId,
      parent_id: parentId,
      replying_to_id: replyingToId,
      ranges,
      thread_type: threadType,
      visibility: body.visibility ?? "public",
      ...contentToColumns(body.content, kind),
    })
    .select("*")
    .single();

  if (error || !data) return validationError("Could not create note.");

  if (!isReply) await insertPostTopics(admin, data.id, topicIds);

  // Fire-and-forget — never let a push failure affect the create response.
  // Wrapped in try/catch so a thrown error (e.g. URL resolution) can't
  // silently swallow the whole notification for every recipient. Skipped
  // entirely for a reply into a book-less discussion thread: there's no
  // `/read/[slug]` deep link to build without a material, and no dedicated
  // discussion-post permalink exists yet to fall back to.
  if (replyRecipientReaderIds.length > 0 && materialId) {
    void (async () => {
      try {
        const [{ data: actor }, { data: replyMaterial }] = await Promise.all([
          admin.from("readers").select("pseudonym").eq("id", reader.readerId).maybeSingle(),
          admin.from("materials").select("slug, title").eq("id", materialId).maybeSingle(),
        ]);
        if (!replyMaterial) return;
        const url = await noteInteractionUrl({
          materialSlug: replyMaterial.slug,
          ranges: ranges ?? [],
          rootNoteId: replyRootNoteId!,
        });
        const actorName = actor?.pseudonym ? comradeName(actor.pseudonym) : "A comrade";
        const payload = {
          kind: "reply" as const,
          title: `💬 ${actorName} replied to your note`,
          body: `Tap to view in ${replyMaterial.title}`,
          url,
          tag: `note-reply-${replyRootNoteId}`,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
        };
        await Promise.all(replyRecipientReaderIds.map((recipientId) => notifyReader(recipientId, payload)));
      } catch (err) {
        console.error("Failed to send reply notification/push", err);
      }
    })();
  }

  const [note] = await hydrateNotes([data], reader.readerId);
  return NextResponse.json(note, { status: 201 });
}
