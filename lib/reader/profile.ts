import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { MATERIAL_SUMMARY_COLUMNS } from "@/lib/materials/columns";
import { toMaterialSummary } from "@/lib/materials/summary";
import { loadBookDocuments } from "@/lib/materials/bookDocuments";
import { resolveExcerpt } from "@/lib/community/excerpt";
import { enrichFeedItems, type FeedItem } from "@/lib/community/feed";
import type { NoteRow } from "@/lib/community/notes";
import { resolveReaderBySlug } from "./profileSlug";
import { listReaderActivities } from "./activity";
import type { AnnotationRange, MaterialSummary } from "@/lib/api/types";
import type { Database } from "@/lib/supabase/database.types";

type HighlightRow = Database["public"]["Tables"]["highlights"]["Row"];

export class ReaderNotFoundError extends Error {
  constructor(slug: string) {
    super(`No reader found for "${slug}"`);
    this.name = "ReaderNotFoundError";
  }
}

// How much a profile page ships up front — generous enough that "load more"
// isn't needed for any reader on this app today, capped so one very
// prolific comrade's profile can't balloon the response indefinitely.
const PROFILE_PUBLIC_NOTES_CAP = 20;
const PROFILE_CURRENTLY_READING_CAP = 6;
const PROFILE_HIGHLIGHTS_CAP = 30;

export type ReaderProfileStats = { notes: number; reading: number; reactions: number };

export type ReaderProfileCurrentlyReading = {
  material: Pick<
    MaterialSummary,
    | "id" | "slug" | "title" | "author" | "cover" | "thumbnail"
    | "googleCoverUrl" | "googleThumbnailUrl" | "openlibraryCoverUrl" | "openlibraryThumbnailUrl" | "coverSource"
  >;
  /** Only populated for `isSelf` — how far into a book someone else is
   * stays private; a visitor sees *which* books a reader has open, never
   * their exact progress in one. */
  progressPercent: number | null;
};

export type ReaderProfileHighlight = {
  id: string;
  material: Pick<MaterialSummary, "id" | "slug" | "title" | "author">;
  excerpt: string;
  createdAt: string;
};

export type ReaderProfilePage = {
  reader: { id: string; pseudonym: string; city: string | null; country: string | null; joinedAt: string };
  /** Whether this bundle was resolved for the profile's own owner (matched
   * by auth token, not by slug — see getReaderProfilePage's `viewerId`).
   * Drives ReaderProfileView's self-vs-public chrome and which tab set
   * renders (see that component's own doc comment). */
  isSelf: boolean;
  stats: ReaderProfileStats;
  currentlyReading: ReaderProfileCurrentlyReading[];
  publicNotes: FeedItem[];
  /** Only populated when `isSelf` — highlights have no `visibility` column
   * at all (migrations/migration.sql), always private to their author, so
   * a public request never even queries them. */
  highlights: ReaderProfileHighlight[] | null;
};

/** highlights rows -> quote-only cards (no note content — a bare highlight
 * has none), same excerpt-resolution step enrichFeedItems uses for notes.
 * Rows with nothing left to quote (a deleted section, an unparseable book
 * doc) are dropped rather than shown as an empty card. */
async function enrichHighlights(rows: HighlightRow[]): Promise<ReaderProfileHighlight[]> {
  if (rows.length === 0) return [];
  const materialIds = Array.from(new Set(rows.map((r) => r.material_id)));
  const { data: materials } = await getSupabaseAdminClient()
    .from("materials")
    .select("id, slug, title, author, json_storage_path")
    .in("id", materialIds);
  const materialsById = new Map((materials ?? []).map((m) => [m.id, m]));
  const bookByMaterialId = await loadBookDocuments(materials ?? []);

  return rows
    .map((row) => {
      const material = materialsById.get(row.material_id);
      if (!material) return null;
      const { excerpt } = resolveExcerpt(bookByMaterialId.get(row.material_id), row.ranges as AnnotationRange[]);
      if (!excerpt) return null;
      return {
        id: row.id,
        material: { id: material.id, slug: material.slug, title: material.title, author: material.author },
        excerpt,
        createdAt: row.created_at,
      };
    })
    .filter((h): h is ReaderProfileHighlight => h !== null);
}

/**
 * The reader-profile page's full data bundle (app/(app)/[handle]'s
 * `/@{pseudonym}`, ReaderProfileView) — one reader's public dossier,
 * resolved by pseudonym slug (lib/reader/profileSlug.ts), plus (only for
 * `viewerId === reader.id`)
 * their own private highlights. Everything else here is visible to any
 * caller, signed in or not, the same "public until proven private" rule
 * lib/community/notes.ts's visibleToFilter uses everywhere else.
 */
export async function getReaderProfilePage(slug: string, viewerId: string | undefined): Promise<ReaderProfilePage> {
  const readerRow = await resolveReaderBySlug(slug);
  if (!readerRow) throw new ReaderNotFoundError(slug);
  const isSelf = viewerId === readerRow.id;

  const admin = getSupabaseAdminClient();
  const [{ data: ownPublicNotes }, activities, { data: rootNoteRows }] = await Promise.all([
    // id + reaction_count only, unbounded — this reader's own note-writing
    // stays small enough (dozens, not thousands) that summing in app code
    // is cheaper than round-tripping through a DB-side aggregate for it.
    // Doubles as both stats below: `.length` is the Notes count,
    // reaction_count summed is Reactions received.
    admin.from("posts").select("id, reaction_count").eq("reader_id", readerRow.id).eq("visibility", "public"),
    listReaderActivities(readerRow.id),
    admin
      .from("posts")
      .select("*")
      .eq("reader_id", readerRow.id)
      .is("parent_id", null)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(PROFILE_PUBLIC_NOTES_CAP),
  ]);

  const stats: ReaderProfileStats = {
    notes: ownPublicNotes?.length ?? 0,
    reading: activities.length,
    reactions: (ownPublicNotes ?? []).reduce((sum, row) => sum + row.reaction_count, 0),
  };

  const publicNotes = await enrichFeedItems((rootNoteRows ?? []) as NoteRow[], viewerId);

  const currentlyReadingActivities = activities.slice(0, PROFILE_CURRENTLY_READING_CAP);
  let currentlyReading: ReaderProfileCurrentlyReading[] = [];
  if (currentlyReadingActivities.length > 0) {
    const { data: materials } = await admin
      .from("materials")
      .select(MATERIAL_SUMMARY_COLUMNS)
      .in("id", currentlyReadingActivities.map((a) => a.materialId));
    const materialsById = new Map((materials ?? []).map((m) => [m.id, toMaterialSummary(m)]));
    currentlyReading = currentlyReadingActivities
      .map((activity) => {
        const material = materialsById.get(activity.materialId);
        return material ? { material, progressPercent: isSelf ? activity.progressPercent : null } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }

  let highlights: ReaderProfileHighlight[] | null = null;
  if (isSelf) {
    const { data: highlightRows } = await admin
      .from("highlights")
      .select("*")
      .eq("reader_id", readerRow.id)
      .order("created_at", { ascending: false })
      .limit(PROFILE_HIGHLIGHTS_CAP);
    highlights = await enrichHighlights((highlightRows ?? []) as HighlightRow[]);
  }

  return {
    reader: {
      id: readerRow.id,
      pseudonym: readerRow.pseudonym,
      city: readerRow.city,
      country: readerRow.country,
      joinedAt: readerRow.joined_at,
    },
    isSelf,
    stats,
    currentlyReading,
    publicNotes,
    highlights,
  };
}
