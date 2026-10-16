import type { AnnotationRange } from "@/lib/api/types";

export type NoteExcerpt = { sectionId: string; label: string; excerpt: string };

/** A note's quote and location, from its own ranges: every range carries the
 * text it covers (lib/annotations/surface.ts), and an EPUB passage id is its
 * section's id plus "-p<n>", so no book has to be read. `labels` is the
 * material's section id -> label (lib/materials/sectionLabels.ts); without
 * it the label is empty, except a PDF page's. */
export function resolveExcerpt(
  // Null on a general note — one about the material as a whole, not a passage.
  ranges: AnnotationRange[] | null,
  labels?: Map<string, string>
): NoteExcerpt {
  ranges ??= [];
  const passageId = ranges[0]?.passageId;
  const excerpt = ranges.map((r) => r.text ?? "").filter(Boolean).join(" … ");
  const sectionId = passageId?.match(/^(.+)-p\d+$/)?.[1];
  if (labels && sectionId) return { sectionId, label: labels.get(sectionId) ?? "", excerpt };
  return { sectionId: "", label: storedLabel(passageId), excerpt };
}

/** A location label for a stored quote, from its block id: a PDF page
 * ("pdf:p11" → "Page 12"); other surfaces have none worth showing. */
function storedLabel(block: string | undefined): string {
  const page = block?.match(/^pdf:p(\d+)$/);
  return page ? `Page ${Number(page[1]) + 1}` : "";
}
