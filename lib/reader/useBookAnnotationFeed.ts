import { useCallback, useMemo, useState } from "react";
import type { Note } from "@/lib/api/types";
import type { Passage, Section } from "@/lib/book/schema";
import { useAnnotations } from "./useAnnotations";
import { topLevelNotes } from "./noteThread";
import { annotationSortKey, generalNoteSortKey, type FeedSort } from "./feedSort";
import { buildAnnotationFeedGroups, type FeedEntry } from "./annotationFeed";

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

/** One row the panel actually renders — a highlighted passage's discussion
 * (with its own chapter/section `label` for context — see FeedEntry) or a
 * book-level General discussion note (no passage, so no `label` of its
 * own; the panel supplies "General discussion" directly). A single flat,
 * sortable list rather than the old per-chapter grouping — every entry
 * carries its own context label inline instead, so "where is this from"
 * lives on the entry, not on a section it sits under (see
 * BookAnnotationFeedPanel). */
export type FeedItem = { kind: "highlight"; entry: FeedEntry } | { kind: "general"; note: Note };

function feedItemKey(item: FeedItem, notes: Note[], sort: "recent" | "top"): number {
  return item.kind === "highlight"
    ? annotationSortKey(item.entry.annotation, sort)
    : generalNoteSortKey(item.note, notes, sort);
}

/**
 * Owns the book-wide annotation feed panel's own state — open/closed, the
 * flat sorted view-model, and which of the two tabs the reader currently
 * has selected. Defaults to "notes" — the feed's whole point is surfacing
 * discourse worth re-reading, and a heavily-highlighted book would
 * otherwise bury that under every bare highlight on first open. Which
 * highlight's thread is doing what (composer/menu/edit) is each
 * FeedHighlightThread's own concern via useThreadInteraction, not
 * centralized here — there's no single "active" entry for this panel.
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
  // "Book order" — General discussion first, then every highlight in
  // spine order — is the default: it's this panel's own natural browsing
  // order (General discussion first since it's not tied to any one place
  // in the book, then the book itself front to back), not an engagement
  // ranking a reader has to opt into. Only meaningful on the "notes" tab —
  // "Your highlights" has no discussion to rank by engagement/activity
  // anyway, so it always stays in book order regardless of this value (see
  // `items` below).
  const [sort, setSort] = useState<FeedSort>("book");

  // Still built section-by-section (buildAnnotationFeedGroups) purely to
  // get each entry stamped with its own chapter label in spine order —
  // flattened right back out below. The book-wide feed itself no longer
  // renders these as separate sections (see BookAnnotationFeedPanel's own
  // doc comment); every entry carries its context with it instead.
  const flatEntries: FeedEntry[] = useMemo(() => {
    const groups = buildAnnotationFeedGroups(allAnnotations, orderedSections, passageLookup.sectionOf, passageLookup.byId);
    return groups.flatMap((g) => g.entries);
  }, [allAnnotations, orderedSections, passageLookup]);

  const items: FeedItem[] = useMemo(() => {
    const highlightItems: FeedItem[] = flatEntries
      .filter((e) => (filter === "notes" ? e.annotation.notes.length > 0 : e.annotation.notes.length === 0))
      .map((entry) => ({ kind: "highlight", entry }));

    if (filter !== "highlights") {
      // Book-level notes — no ranges, so they never entered `allAnnotations`
      // in the first place (useAnnotations' own bucketByPassage only ever
      // visits a note's `ranges`, which is empty here) and have no
      // passage/section to carry a `label` the way a FeedEntry does; the
      // panel supplies "General discussion" for these directly. "Your
      // highlights" never includes these — a general note is always an
      // actual note, never a bare highlight.
      const generalNotes = topLevelNotes(notes).filter((n) => n.ranges.length === 0);

      if (sort === "book") {
        // General discussion first (oldest first among themselves — read
        // start to finish, same convention NoteSortMode's own
        // "chronological" already uses within one thread), then every
        // highlight in the book's own spine order (`highlightItems` is
        // already that order, unsorted) — this mode doesn't rank items
        // against each other at all, so there's no `feedItemKey` call
        // here.
        const generalItems: FeedItem[] = [...generalNotes]
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((note) => ({ kind: "general", note }));
        return [...generalItems, ...highlightItems];
      }

      const generalItems: FeedItem[] = generalNotes.map((note) => ({ kind: "general", note }));
      return [...highlightItems, ...generalItems].sort(
        (a, b) => feedItemKey(b, notes, sort) - feedItemKey(a, notes, sort)
      );
    }

    // "Your highlights" has no discussion to rank by engagement/activity —
    // stays in book order (flatEntries' own spine order), same as
    // browsing the book itself.
    return highlightItems;
  }, [flatEntries, notes, filter, sort]);

  const totalNoteCount =
    flatEntries.reduce((sum, e) => sum + e.annotation.notes.length, 0) +
    // Independent of `filter` (unlike `items` above) — this header count
    // should never appear to shrink just because the reader is on the
    // "Your highlights" tab, same reasoning as passageCount below.
    topLevelNotes(notes)
      .filter((n) => n.ranges.length === 0)
      .reduce((sum, n) => sum + 1 + notes.filter((r) => r.parentId === n.id).length, 0);
  const passageCount = flatEntries.length;

  const openFeed = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    open,
    items,
    // The material's whole flat note list — GeneralNoteThread needs it to
    // look up each general note's own replies (repliesFor), same as every
    // other thread renderer already does with allAnnotations' per-
    // annotation notes; general notes just have nowhere else to source it
    // from since they never made it into an Annotation.
    notes,
    filter,
    setFilter,
    sort,
    setSort,
    totalNoteCount,
    passageCount,
    openFeed,
    close,
  };
}
