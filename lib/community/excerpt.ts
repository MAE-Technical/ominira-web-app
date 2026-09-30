import type { BookDocument } from "@/lib/book/schema";
import { buildPassageIndex, buildSectionsById } from "@/lib/reader/sections";
import { sectionLabel } from "@/lib/reader/sectionHeading";
import type { AnnotationRange } from "@/lib/api/types";

export type NoteExcerpt = { sectionId: string; label: string; excerpt: string };

/** Resolves a note's `ranges[0]` against the book's own passage/section
 * tree into the quoted excerpt text plus its section/label — the one bit
 * of enrichment every notes-reading endpoint that ships a quote alongside
 * its note needs (the global feed, and the per-material feed for the book
 * details page's own community-notes tab). Falls back to all-empty when the
 * book doc or the range's passage can't be resolved, same as before this
 * was pulled out into its own helper. */
export function resolveExcerpt(
  book: BookDocument | undefined,
  // Null on a general note — one about the material as a whole, not a passage.
  ranges: AnnotationRange[] | null
): NoteExcerpt {
  ranges ??= [];
  const range = ranges[0];
  // Every format but EPUB (a PDF, a web article, a DOCX) carries its own quote
  // on each range, since the server has no book to read it back out of.
  const stored: NoteExcerpt = {
    sectionId: "",
    label: storedLabel(range?.passageId),
    excerpt: ranges.map((r) => r.text ?? "").filter(Boolean).join(" … "),
  };
  if (!book || !range) return stored;

  const passageEntry = buildPassageIndex(book.sections).get(range.passageId);
  if (!passageEntry) return stored;

  const section = buildSectionsById(book.sections).get(passageEntry.sectionId);
  return {
    sectionId: passageEntry.sectionId,
    label: (section && sectionLabel(section)) ?? "",
    excerpt: passageEntry.passage.text.slice(range.start, range.end),
  };
}

/** A location label for a stored quote, from its block id: a PDF page
 * ("pdf:p11" → "Page 12"); other surfaces have none worth showing. */
function storedLabel(block: string | undefined): string {
  const page = block?.match(/^pdf:p(\d+)$/);
  return page ? `Page ${Number(page[1]) + 1}` : "";
}
