import { getBookDocumentFromMaterial } from "@/lib/materials/toBookDocument";
import { buildPassageIndex } from "@/lib/reader/sections";
import type { AnnotationRange } from "@/lib/api/types";
import { rangesKey } from "@/stores/library-store";

/** The reader destination for an interaction with a community note.
 *
 * Anchored notes use the reader's established `section`/`passage`/`note`
 * handoff, which opens the exact annotation drawer and flashes its source
 * text. General discussion has no passage to land on, so it names the root
 * post for the book-wide notes panel instead.
 */
export async function noteInteractionUrl({
  materialSlug,
  ranges,
  rootNoteId,
}: {
  materialSlug: string;
  ranges: AnnotationRange[];
  rootNoteId: string;
}): Promise<string> {
  const range = ranges[0];
  if (!range) return `/reader/${encodeURIComponent(materialSlug)}?noteId=${encodeURIComponent(rootNoteId)}`;

  // A note's first range is its canonical in-book anchor everywhere else in
  // the product. Resolve its section here so a cold notification launch can
  // eagerly load the right reader slide instead of briefly landing at the
  // book's beginning first.
  const { book } = await getBookDocumentFromMaterial(materialSlug);
  const sectionId = buildPassageIndex(book.sections).get(range.passageId)?.sectionId;
  if (!sectionId) return `/reader/${encodeURIComponent(materialSlug)}?noteId=${encodeURIComponent(rootNoteId)}`;

  return `/reader/${encodeURIComponent(materialSlug)}?${new URLSearchParams({
    section: sectionId,
    passage: range.passageId,
    note: rangesKey(ranges),
    thread: rootNoteId,
  }).toString()}`;
}
