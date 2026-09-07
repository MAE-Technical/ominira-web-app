import { useCallback, useMemo, useState } from "react";
import type { Note } from "@/lib/api/types";
import type { Passage, Section } from "@/lib/book/schema";
import { useAnnotations } from "./useAnnotations";
import { topLevelNotes } from "./noteThread";
import { buildAnnotationFeedGroups, type FeedSectionGroup } from "./annotationFeed";

/** Which entries the panel actually renders — "notes" (labeled "Public
 * notes") narrows down to entries with at least one note, "highlights"
 * (labeled "Your highlights") is the complement, bare highlights only,
 * nothing discussed yet. Every entry is exactly one or the other (never
 * both, never neither), so these two exhaust the feed on their own — no
 * third "all" option needed. Purely a display filter — totals below are
 * always computed from the full, unfiltered set, so the header badge/
 * subtitle never appears to shrink just because the reader narrowed their
 * own view. */
export type AnnotationFeedFilter = "notes" | "highlights";

/**
 * Owns the book-wide annotation feed panel's own state — open/closed, the
 * section-grouped view-model, and which of the two tabs the reader currently
 * has selected. Defaults to "notes" — the feed's whole point is surfacing
 * discourse worth re-reading, and a heavily-highlighted book would otherwise
 * bury that under every bare highlight on first open. Which highlight's
 * thread is doing what (composer/menu/edit) is each FeedHighlightThread's
 * own concern via useThreadInteraction, not centralized here — there's no
 * single "active" entry for this panel anymore (see the section-grouped
 * redesign).
 */
export function useBookAnnotationFeed({
  materialId,
  orderedSections,
  passageLookup,
}: {
  materialId: string;
  orderedSections: Section[];
  passageLookup: { byId: Map<string, Passage>; sectionOf: Map<string, string> };
}) {
  const { notes, allAnnotations } = useAnnotations(materialId);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AnnotationFeedFilter>("notes");

  const groups: FeedSectionGroup[] = useMemo(
    () => buildAnnotationFeedGroups(allAnnotations, orderedSections, passageLookup.sectionOf, passageLookup.byId),
    [allAnnotations, orderedSections, passageLookup]
  );

  const visibleGroups: FeedSectionGroup[] = useMemo(() => {
    const keep = (e: FeedSectionGroup["entries"][number]) =>
      filter === "notes" ? e.annotation.notes.length > 0 : e.annotation.notes.length === 0;
    return groups.map((g) => ({ ...g, entries: g.entries.filter(keep) })).filter((g) => g.entries.length > 0);
  }, [groups, filter]);

  // Book-level notes — no ranges, so they never entered `allAnnotations` in
  // the first place (useAnnotations' own bucketByPassage only ever visits a
  // note's `ranges`, which is empty here) and have no passage/section to
  // group by the way buildAnnotationFeedGroups requires. A flat, newest-
  // first list instead of a FeedSectionGroup — same "independent card per
  // root note" shape as the home feed/book-details community tab, not
  // merged into one shared thread the way same-ranges annotated notes are
  // (see GeneralNoteThread). "Your highlights" never includes these — a
  // general note is always an actual note, never a bare highlight, so it
  // only ever shows under "notes".
  const generalNotes: Note[] = useMemo(() => {
    if (filter !== "notes") return [];
    return topLevelNotes(notes)
      .filter((n) => n.ranges.length === 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [notes, filter]);

  const totalNoteCount =
    groups.reduce((sum, g) => sum + g.entries.reduce((s, e) => s + e.annotation.notes.length, 0), 0) +
    // Independent of `filter` (unlike generalNotes above) — this header
    // count should never appear to shrink just because the reader is on
    // the "Your highlights" tab, same reasoning as passageCount below.
    topLevelNotes(notes)
      .filter((n) => n.ranges.length === 0)
      .reduce((sum, n) => sum + 1 + notes.filter((r) => r.parentId === n.id).length, 0);
  const passageCount = groups.reduce((sum, g) => sum + g.entries.length, 0);

  const openFeed = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    open,
    groups: visibleGroups,
    generalNotes,
    // The material's whole flat note list — GeneralNoteThread needs it to
    // look up each general note's own replies (repliesFor), same as every
    // other thread renderer already does with allAnnotations' per-
    // annotation notes; general notes just have nowhere else to source it
    // from since they never made it into an Annotation.
    notes,
    filter,
    setFilter,
    totalNoteCount,
    passageCount,
    openFeed,
    close,
  };
}
