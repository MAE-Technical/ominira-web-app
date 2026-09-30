import type { Annotation } from "@/stores/library-store";
import type { Section } from "@/lib/book/schema";
import { sectionLabel } from "./sectionHeading";

export type FeedEntry = {
  annotation: Annotation;
  sectionId: string;
  /** The annotation's own first range's passage — the "jump to" target;
   * a multi-passage annotation is anchored at wherever it starts, same as
   * how its quote/citation is already built elsewhere. */
  passageId: string;
  /** The run label the feed files it under — a chapter, a PDF page, an
   * article's heading. */
  label: string;
};

/** Where a block (an EPUB passage, a PDF page, an article paragraph) sits in
 * its material: the run the feed groups it under, that run's label, and its
 * reading order. Each format supplies its own; the feed itself never knows
 * which format it's showing. */
export type FeedLocation = { sectionId: string; label: string; order: number };
export type FeedLocator = (passageId: string) => FeedLocation | null;

/** An EPUB's locator: chapters in spine order, passages in order within them. */
export function epubFeedLocator(orderedSections: Section[]): FeedLocator {
  const at = new Map<string, FeedLocation>();
  for (const section of orderedSections) {
    const label = sectionLabel(section) ?? "";
    for (const p of section.passages) at.set(p.id, { sectionId: section.id, label, order: at.size });
  }
  return (passageId) => at.get(passageId) ?? null;
}

/** The book-wide annotation feed's view-model: every Annotation the reader
 * has marked — a bare highlight and a full note thread alike, so the feed
 * reads as "everything I marked in this book," not just the subset that
 * happens to have a note on it — in reading order (block order, then range
 * start as a tiebreaker for more than one annotation on the same block).
 * Blocks the locator doesn't know (content since removed) are left out. */
export function buildAnnotationFeedEntries(annotations: Annotation[], locate: FeedLocator): FeedEntry[] {
  const located: { entry: FeedEntry; order: number }[] = [];
  for (const annotation of annotations) {
    if (!annotation.highlighted && annotation.notes.length === 0) continue;
    const { passageId } = annotation.ranges[0];
    const at = locate(passageId);
    if (!at) continue;
    located.push({ entry: { annotation, sectionId: at.sectionId, passageId, label: at.label }, order: at.order });
  }
  located.sort((a, b) => a.order - b.order || a.entry.annotation.ranges[0].start - b.entry.annotation.ranges[0].start);
  return located.map((l) => l.entry);
}
