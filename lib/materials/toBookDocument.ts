import { resolveMaterialRow } from "@/lib/materials/resolve";
import { projectMaterial } from "@/lib/materials/projection";
import type { BookDocument, Narrator, Note, Passage, Section } from "@/lib/book/schema";
import type { Database } from "@/lib/supabase/database.types";
import { fetchMaterialManifest } from "./manifest";
import { resolveBookCoverSrc, type CoverSource } from "./image";

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

export class MaterialNotFoundError extends Error {
  constructor(materialId: string) {
    super(`No published material found for "${materialId}"`);
    this.name = "MaterialNotFoundError";
  }
}

const FULL_CONTENT_FIELDS = [
  "title",
  "author",
  "description",
  "cover",
  "coverSource",
  "googleCoverUrl",
  "googleThumbnailUrl",
  "openlibraryCoverUrl",
  "openlibraryThumbnailUrl",
  "language",
  "publishedYear",
  "pageCountEstimate",
  "narrators",
  "notes",
  "sections",
];

/** Blanks out the actual prose (and its inline marks) on every passage
 * *except* the one section the reader is either landing on or has already
 * been told to load — everything else about the section (id, count, type,
 * level, audio, children) stays exactly as real/complete as before this
 * existed. That's deliberate: `passages.length`/`passage.type` are load-
 * bearing signals elsewhere (ChaptersDrawer's "does this chapter have
 * content" check, the endnotes-index heuristic, reading-progress's
 * passage-count math, resume/audio passage-index lookups) — stripping the
 * *array* itself would have made an unloaded chapter look structurally
 * different (and in ChaptersDrawer's case, wrongly non-clickable) rather
 * than just visually blank for a moment. Only `text` (by far the dominant
 * byte weight of a book's JSON) is what actually needed deferring; nothing
 * downstream reads it before the reader can actually see it.
 *
 * Image passages are left untouched — their `text` is alt copy, already
 * small, and `src` (the thing that actually renders) was never in scope
 * here anyway. */
function stripProseExceptSection(sections: Section[], keepSectionId: string): Section[] {
  return sections.map((s) => {
    const children = s.children.length > 0 ? stripProseExceptSection(s.children, keepSectionId) : s.children;
    if (s.id === keepSectionId) return children === s.children ? s : { ...s, children };
    const passages: Passage[] = s.passages.map((p) =>
      p.type === "image" ? p : ({ ...p, text: "", marks: undefined } as Passage)
    );
    return { ...s, children, passages };
  });
}

/**
 * What `/read/[slug]` and its modal counterpart actually load — every
 * section's real structure (spine order, ids, audio tracks, passage counts/
 * types) up front, but only *one* section's actual prose text eagerly: the
 * one the reader is either deep-linking straight into (`eagerSectionId`,
 * from `?section=`) or, absent that, the book's very first spine entry —
 * this function has no way to know a returning reader's real saved resume
 * position itself (that lives client-side, in reading-position-store's
 * localStorage, or behind a Bearer token this server call never sees), so
 * that's `useProgressiveText`'s job once mounted: resolve the real target,
 * and if it isn't the one section already eagerly included here, fetch
 * just that one before the reader can start reading, then fetch everything
 * else in the background. `eagerSectionIds` tells the client exactly which
 * section(s) it can trust as already-real, so it never re-fetches
 * needlessly or (worse) mistakes "not yet loaded" for "genuinely has no
 * content."
 *
 * Rather than bypass the materials table the way the old direct
 * `getBookDocument()` Storage read did, this resolves the row and calls
 * straight into the same `projectMaterial` the public
 * `GET /api/materials/{materialId}` route itself calls — no HTTP round
 * trip to this app's own API (same pattern as `listPublishedMaterials`) —
 * using `fullContent: true` to get the real `Section[]` tree instead of the
 * pruned DB-only TocSection[] outline. A slug that doesn't resolve to a
 * *published* materials row throws the same as the old `BookNotFoundError`
 * did — this is a real behavior improvement over the old direct Storage
 * read, which had no notion of "published" at all.
 */
export async function getBookDocumentFromMaterial(
  slug: string,
  opts: { eagerSectionId?: string } = {}
): Promise<{ book: BookDocument; materialId: string; eagerSectionIds: string[] }> {
  const row = await resolveMaterialRow(slug);
  if (!row) throw new MaterialNotFoundError(slug);
  return buildBookDocumentFromRow(row, opts);
}

/** Same as `getBookDocumentFromMaterial`, but takes an already-resolved row
 * — for callers (`loadReaderMaterial.ts`) that must check `material_type`
 * before deciding whether to build a `BookDocument` at all, so the row gets
 * resolved exactly once rather than once per branch. */
export async function buildBookDocumentFromRow(
  row: MaterialRow,
  opts: { eagerSectionId?: string } = {}
): Promise<{ book: BookDocument; materialId: string; eagerSectionIds: string[] }> {
  const [projected, manifest] = await Promise.all([
    projectMaterial(row, { fields: FULL_CONTENT_FIELDS, fullContent: true }),
    fetchMaterialManifest(row.slug),
  ]);
  const spine = manifest.spine;
  const fullSections = projected.sections as Section[];
  const eagerId = (opts.eagerSectionId && spine.includes(opts.eagerSectionId) ? opts.eagerSectionId : spine[0]) as
    | string
    | undefined;

  const book: BookDocument = {
    schemaVersion: 3,
    // BookDocument.id is ingestion's own slug-like internal id (api-spec.md:
    // deliberately distinct from materialId) — using the row's own slug
    // here is the closest equivalent available from this table, and is what
    // every publish actually sets it to in practice (scripts/publish-book.ts).
    id: row.slug,
    slug: row.slug,
    metadata: {
      title: projected.title as string,
      author: projected.author as string,
      description: (projected.description as string | null) ?? "",
      // Same own -> openlibrary -> google cascade as everywhere else covers/thumbnails
      // are resolved (lib/materials/image.ts) — every consumer of book.metadata.cover
      // (ChaptersDrawer, NowPlayingBar, NarrationEngine's media-session artwork) gets
      // it for free from this one resolution point.
      cover:
        resolveBookCoverSrc({
          cover: projected.cover as string | null,
          coverSource: projected.coverSource as CoverSource,
          googleCoverUrl: projected.googleCoverUrl as string | null,
          googleThumbnailUrl: projected.googleThumbnailUrl as string | null,
          openlibraryCoverUrl: projected.openlibraryCoverUrl as string | null,
          openlibraryThumbnailUrl: projected.openlibraryThumbnailUrl as string | null,
        }) ?? "",
      language: (projected.language as string | null) ?? "",
      publishedYear: (projected.publishedYear as number | null) ?? undefined,
      pageCountEstimate: (projected.pageCountEstimate as number | null) ?? 0,
    },
    narrators: projected.narrators as Narrator[],
    sections: eagerId ? stripProseExceptSection(fullSections, eagerId) : fullSections,
    spine,
    notes: projected.notes as Note[],
  };

  return { book, materialId: row.id, eagerSectionIds: eagerId ? [eagerId] : [] };
}
