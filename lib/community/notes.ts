import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import type { Database } from "@/lib/supabase/database.types";
import type { AnnotationRange, Note, NoteContent } from "@/lib/api/types";

// Backed by `posts` (migrations/20260919_topics_and_posts.sql), not `notes`
// — kept under the old name so the notes-reading routes (which only ever do
// `.from(...)` / `row.reaction_count` / `row.created_at` / `row.id`, all
// present unchanged on `posts`) don't need touching beyond the table name
// swap. A real NoteRow -> PostRow rename is deferred to whenever the public
// Note/NoteContent types themselves get renamed to Post/PostContent.
export type NoteRow = Database["public"]["Tables"]["posts"]["Row"];
type SupabaseAdmin = ReturnType<typeof getSupabaseAdminClient>;

export type PostKind = "citation" | "text" | "book_share" | "voice";

/** NoteContent union -> posts.kind + posts.content (jsonb). A text note
 * defaults to kind='citation' (posts.kind has more values than the API's
 * NoteContent.kind ever exposes) — the book-anchored-note shape every
 * existing caller (NoteComposer, reader annotation flow) relies on,
 * unchanged. `kind` lets a caller override that default for a top-level
 * discussion post instead (POST /api/community/notes' own `text`/
 * `book_share` per whether one has an attached material) — contentFromRow
 * reads any non-voice kind back as plain text regardless, so this never
 * needs its own read-side branch. */
export function contentToColumns(content: NoteContent, kind: PostKind = "citation") {
  if (content.kind === "voice") {
    return {
      kind: "voice" as const,
      content: { kind: "voice", audioUrl: content.audioUrl, durationMs: content.durationMs },
    };
  }
  return { kind, content: { kind, text: content.text } };
}

function contentFromRow(row: NoteRow): NoteContent {
  const content = row.content as { text?: string; audioUrl?: string; durationMs?: number };
  if (row.kind === "voice") {
    return { kind: "voice", audioUrl: content.audioUrl!, durationMs: content.durationMs! };
  }
  return { kind: "text", text: content.text! };
}

type AuthorMeta = { pseudonym: string; city: string | null };

/** snake_case posts row -> camelCase Note (api-spec.md's Shared Types,
 * unchanged even though the row is now a posts row). Author metadata,
 * topic name, and reactedByMe are looked up separately (no typed FK
 * embedding — see the helpers below) and passed in rather than queried
 * per-row, so a list of N notes costs a few extra queries, not N per note.
 * materialId/ranges are null only for a book-less discussion post — every
 * book-anchored note/reply this endpoint family reads always has both. */
export function toNote(row: NoteRow, author: AuthorMeta, reactedByMe: boolean, topics: TopicRef[]): Note {
  return {
    id: row.id,
    materialId: row.material_id,
    author: { readerId: row.reader_id, pseudonym: author.pseudonym, city: author.city },
    ranges: (row.ranges as AnnotationRange[] | null) ?? [],
    parentId: row.parent_id,
    replyingToId: row.replying_to_id,
    content: contentFromRow(row),
    visibility: row.visibility,
    reactionCount: row.reaction_count,
    reactedByMe,
    topicName: topics[0]?.name ?? null,
    topicSlug: topics[0]?.slug ?? null,
    topicNames: topics.map((t) => t.name),
    topics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Only public rows, or rows the caller themself authored — the one
 * visibility rule shared by every notes-reading endpoint (per-material feed,
 * global feed, single thread). Unauthenticated callers (readerId undefined)
 * only ever see public notes. */
export function visibleToFilter(readerId: string | undefined): string {
  return readerId ? `visibility.eq.public,reader_id.eq.${readerId}` : "visibility.eq.public";
}

export async function getAuthorsByReaderId(readerIds: string[]): Promise<Map<string, AuthorMeta>> {
  const unique = Array.from(new Set(readerIds));
  if (unique.length === 0) return new Map();
  const { data } = await getSupabaseAdminClient().from("readers").select("id, pseudonym, city").in("id", unique);
  return new Map((data ?? []).map((r) => [r.id, { pseudonym: r.pseudonym, city: r.city }]));
}

export type TopicRef = { name: string; slug: string };

/** Batched topic-name lookup, same shape as getAuthorsByReaderId. Every
 * post has a topic_id, but not every topic_id is a real, displayable
 * topic — the throwaway pseudo-topics resolveTopicIdForNewThread (and the
 * untagged-discussion-post fallback in POST /api/community/notes) create
 * are `source: 'legacy_migration'`, never meant to surface as a label, so
 * they're excluded here and simply have no entry in the returned map. */
export async function getTopicNamesByIds(topicIds: string[]): Promise<Map<string, TopicRef>> {
  const unique = Array.from(new Set(topicIds));
  if (unique.length === 0) return new Map();
  const { data } = await getSupabaseAdminClient()
    .from("topics")
    .select("id, name, slug")
    .in("id", unique)
    .neq("source", "legacy_migration");
  return new Map((data ?? []).map((t) => [t.id, { name: t.name, slug: t.slug }]));
}

/** Every topic a post is tagged under (migrations/20260927_post_topics.sql),
 * default first — `created_at` ordering on post_topics is exactly insertion
 * order, and the composer always inserts the reader's chosen default first.
 * Falls back to just `[post.topic_id]`'s name for a post whose post_topics
 * rows predate this table (shouldn't happen post-backfill, but batching
 * degrades safely rather than surfacing an empty topic list). */
export async function getTopicNamesForPosts(postIds: string[]): Promise<Map<string, TopicRef[]>> {
  const unique = Array.from(new Set(postIds));
  if (unique.length === 0) return new Map();
  const { data } = await getSupabaseAdminClient()
    .from("post_topics")
    .select("post_id, topic_id")
    .in("post_id", unique)
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  const topics = await getTopicNamesByIds(rows.map((r) => r.topic_id));
  const byPost = new Map<string, TopicRef[]>();
  for (const row of rows) {
    const topic = topics.get(row.topic_id);
    if (!topic) continue;
    const list = byPost.get(row.post_id) ?? [];
    list.push(topic);
    byPost.set(row.post_id, list);
  }
  return byPost;
}

export async function getReactedNoteIds(readerId: string | undefined, noteIds: string[]): Promise<Set<string>> {
  if (!readerId || noteIds.length === 0) return new Set();
  const { data } = await getSupabaseAdminClient()
    .from("post_reactions")
    .select("post_id")
    .eq("reader_id", readerId)
    .in("post_id", noteIds);
  return new Set((data ?? []).map((r) => r.post_id));
}

/** Batch-hydrates a set of note rows into full Note[] — one author query,
 * one reactions query, and one topic-name query for the whole batch, in the
 * same reply/thread hydration shape every notes-reading route needs. */
export async function hydrateNotes(rows: NoteRow[], callerId: string | undefined): Promise<Note[]> {
  if (rows.length === 0) return [];
  const [authors, reacted, topicNamesByPost, defaultTopicNames] = await Promise.all([
    getAuthorsByReaderId(rows.map((r) => r.reader_id)),
    getReactedNoteIds(callerId, rows.map((r) => r.id)),
    getTopicNamesForPosts(rows.map((r) => r.id)),
    getTopicNamesByIds(rows.map((r) => r.topic_id)),
  ]);
  return rows.map((row) => {
    // post_topics is what's authoritative once populated; a row it has
    // nothing for (pre-backfill edge case, or an untagged discussion post
    // whose topic_id is a throwaway pseudo-topic) falls back to just its
    // default — dropped entirely (empty topics, not a raw id) when that
    // default has no displayable name of its own.
    const fallbackTopic = defaultTopicNames.get(row.topic_id);
    const topics = topicNamesByPost.get(row.id) ?? (fallbackTopic ? [fallbackTopic] : []);
    return toNote(row, authors.get(row.reader_id) ?? { pseudonym: "Unknown", city: null }, reacted.has(row.id), topics);
  });
}

/** Resolves the topic_id a brand-new thread-root note should get, since
 * posts.topic_id is NOT NULL and there's no topic-picker UI yet:
 *   1. Use the material's oldest linked topic (material_topics), if any —
 *      most books get one from the Categories->Topics seed migration.
 *   2. Otherwise fall back to a pseudo-topic, same shape the legacy data
 *      migration used: a fresh id, generated up front, reused as the
 *      topic's id (source='legacy_migration' — "no real topic, exclude from
 *      any browse/directory query").
 * Replies never call this — they inherit their thread root's topic_id
 * directly from the already-fetched parent row. */
export async function resolveTopicIdForNewThread(admin: SupabaseAdmin, materialId: string): Promise<string> {
  const { data: materialTopic } = await admin
    .from("material_topics")
    .select("topic_id")
    .eq("material_id", materialId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (materialTopic) return materialTopic.topic_id;

  const topicId = crypto.randomUUID();
  await admin.from("topics").insert({
    id: topicId,
    slug: `note-${topicId}`,
    name: `Note ${topicId}`,
    source: "legacy_migration",
    status: "archived",
  });
  return topicId;
}

/** Writes a brand-new thread root's full topic set (default first — see
 * post_topics's own doc comment) into post_topics. A reply never calls
 * this: it inherits its thread root's topics wholesale, same as it already
 * inherits topic_id, so there's nothing new to write. */
export async function insertPostTopics(admin: SupabaseAdmin, postId: string, topicIds: string[]): Promise<void> {
  const unique = Array.from(new Set(topicIds));
  if (unique.length === 0) return;
  await admin.from("post_topics").insert(unique.map((topicId) => ({ post_id: postId, topic_id: topicId })));
}
