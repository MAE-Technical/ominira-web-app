import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { loadBookDocuments } from "@/lib/materials/bookDocuments";
import { resolveExcerpt } from "./excerpt";
import { hydrateNotes, type NoteRow } from "./notes";
import type { AnnotationRange, MaterialSummary, Note } from "@/lib/api/types";
import { MATERIAL_SUMMARY_COLUMNS } from "@/lib/materials/columns";
import { parseGoogleMetaData, parseOpenLibraryMetaData } from "@/lib/materials/providerMeta";

export type FeedItem = {
  note: Note;
  material: Pick<
    MaterialSummary,
    | "id" | "slug" | "title" | "author" | "cover" | "thumbnail"
    | "googleCoverUrl" | "googleThumbnailUrl" | "openlibraryCoverUrl" | "openlibraryThumbnailUrl" | "coverSource"
  >;
  sectionId: string;
  label: string;
  excerpt: string;
  /** Every visible reply to this note, already hydrated and chronological —
   * shipped inline with the feed page itself so a card can show its
   * accurate count and full thread immediately, with no separate
   * per-note fetch and no click-to-reveal step (there's no threshold here;
   * everything visible to the caller comes down with the page). */
  replies: Note[];
};

/**
 * Turns a page of top-level note rows into full feed items — the
 * material/section/label/excerpt enrichment `GET /api/community/notes` and
 * `GET /api/community/notes/{noteId}` both need (api-spec.md § 3). One
 * Storage fetch per unique material referenced on the page (not per note),
 * and one reply query for the whole page.
 */
export async function enrichFeedItems(rows: NoteRow[], callerId: string | undefined): Promise<FeedItem[]> {
  if (rows.length === 0) return [];
  const admin = getSupabaseAdminClient();

  // material_id is nullable on posts in general (a topic-only discussion
  // post has none), but every row this function ever receives came from a
  // book-anchored notes feed, where it's always set.
  const materialIds = Array.from(new Set(rows.map((r) => r.material_id).filter((id): id is string => id !== null)));
  const { data: materials } = await admin.from("materials").select(`${MATERIAL_SUMMARY_COLUMNS}, json_storage_path`).in("id", materialIds);
  const materialsById = new Map((materials ?? []).map((m) => [m.id, m]));

  const bookByMaterialId = await loadBookDocuments(materials ?? []);

  const { data: replyRows } = rows.length
    ? await admin
        .from("posts")
        .select("*")
        .in(
          "parent_id",
          rows.map((r) => r.id)
        )
        .order("created_at", { ascending: true })
    : { data: [] };
  // Same visibility rule as everywhere else (visibleToFilter): a private
  // reply is only visible to its own author. Filtered in app code rather
  // than the query above since it's an `.in(parent_id)` already, and this
  // keeps it identical to the single-thread route's own filter.
  const visibleReplyRows = ((replyRows ?? []) as NoteRow[]).filter(
    (r) => r.visibility === "public" || r.reader_id === callerId
  );
  const repliesByParent = new Map<string, NoteRow[]>();
  for (const r of visibleReplyRows) {
    if (!r.parent_id) continue;
    const list = repliesByParent.get(r.parent_id) ?? [];
    list.push(r);
    repliesByParent.set(r.parent_id, list);
  }

  // One pseudonym/reaction batch across top-level notes AND their replies —
  // hydrateNotes already dedupes reader ids internally, so this stays a
  // single extra query each, not one per note.
  const hydratedById = new Map(
    (await hydrateNotes([...rows, ...visibleReplyRows], callerId)).map((n) => [n.id, n])
  );

  const items: FeedItem[] = [];
  for (const row of rows) {
    const material = row.material_id ? materialsById.get(row.material_id) : undefined;
    const note = hydratedById.get(row.id);
    if (!material || !note) continue;

    // material_id is non-null here — the `!material` check above already
    // continued past any row where it wasn't.
    const { sectionId, label, excerpt } = resolveExcerpt(bookByMaterialId.get(row.material_id!), row.ranges as AnnotationRange[]);

    const replies = (repliesByParent.get(row.id) ?? [])
      .map((r) => hydratedById.get(r.id))
      .filter((n): n is Note => Boolean(n));

    const google = parseGoogleMetaData(material.google_meta_data);
    const openlibrary = parseOpenLibraryMetaData(material.openlibrary_meta_data);

    items.push({
      note,
      material: {
        id: material.id,
        slug: material.slug,
        title: material.title,
        author: material.author,
        cover: material.cover_url,
        thumbnail: material.thumbnail_url,
        googleCoverUrl: google.coverUrl,
        googleThumbnailUrl: google.thumbnailUrl,
        openlibraryCoverUrl: openlibrary.coverUrl,
        openlibraryThumbnailUrl: openlibrary.thumbnailUrl,
        coverSource: material.cover_source,
      },
      sectionId,
      label,
      excerpt,
      replies,
    });
  }
  return items;
}
