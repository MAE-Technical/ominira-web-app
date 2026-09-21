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

/** NoteContent union -> posts.kind + posts.content (jsonb). A book-anchored
 * text note is stored as kind='citation' (posts.kind has more values than
 * the API's NoteContent.kind ever exposes) so the public Note.content shape
 * never has to change. */
export function contentToColumns(content: NoteContent) {
  if (content.kind === "text") {
    return { kind: "citation" as const, content: { kind: "citation", text: content.text } };
  }
  return {
    kind: "voice" as const,
    content: { kind: "voice", audioUrl: content.audioUrl, durationMs: content.durationMs },
  };
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
 * materialId/ranges are asserted non-null: every row this endpoint family
 * reads was created through POST /api/community/notes, which always sets
 * both. */
export function toNote(row: NoteRow, author: AuthorMeta, reactedByMe: boolean, topicName: string | null): Note {
  return {
    id: row.id,
    materialId: row.material_id!,
    author: { readerId: row.reader_id, pseudonym: author.pseudonym, city: author.city },
    ranges: row.ranges as AnnotationRange[],
    parentId: row.parent_id,
    replyingToId: row.replying_to_id,
    content: contentFromRow(row),
    visibility: row.visibility,
    reactionCount: row.reaction_count,
    reactedByMe,
    topicName,
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

/** Batched topic-name lookup, same shape as getAuthorsByReaderId — every
 * post has a topic_id, so this is always a real name (barring one of the
 * throwaway pseudo-topics resolveTopicIdForNewThread falls back to when a
 * material has no linked topic). */
export async function getTopicNamesByIds(topicIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(topicIds));
  if (unique.length === 0) return new Map();
  const { data } = await getSupabaseAdminClient().from("topics").select("id, name").in("id", unique);
  return new Map((data ?? []).map((t) => [t.id, t.name]));
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
  const [authors, reacted, topicNames] = await Promise.all([
    getAuthorsByReaderId(rows.map((r) => r.reader_id)),
    getReactedNoteIds(callerId, rows.map((r) => r.id)),
    getTopicNamesByIds(rows.map((r) => r.topic_id)),
  ]);
  return rows.map((row) =>
    toNote(row, authors.get(row.reader_id) ?? { pseudonym: "Unknown", city: null }, reacted.has(row.id), topicNames.get(row.topic_id) ?? null)
  );
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
