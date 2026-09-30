import type { AnnotationRange } from "@/stores/library-store";

/** Joins each touched passage's own local slice — a highlight/note/copy can
 * span more than one passage, so "the text" isn't always a single
 * substring of one Passage.text. Shared by the selection pill's Copy action
 * and the notes panel's quote display so neither can drift into a different
 * way of stitching a cross-passage selection back into one string. */
export function quoteForRanges(ranges: AnnotationRange[], getPassageText: (passageId: string) => string): string {
  // A range's own stored quote first (every format but EPUB carries one — see
  // AnnotationRange.text), else sliced from the passage it points into.
  return ranges.map((r) => r.text ?? getPassageText(r.passageId).slice(r.start, r.end)).join(" … ");
}
