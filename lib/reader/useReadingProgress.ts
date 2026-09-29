import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BookDocument, Section } from "@/lib/book/schema";
import { buildEpubScale, locatorOfKind, type Locator } from "@/lib/reader/locator";
import { useLocatorScrollTracker, useProgressCommit } from "@/lib/reader/progressTracking";
import { useReadingPositionStore } from "@/stores/reading-position-store";

/**
 * EPUB's own progress tracking — the `epub` locator kind's counterpart to
 * useArticleProgress/useDocumentProgress, kept separate because a book is a
 * spine of independently-scrolling sections rather than one document, which
 * makes section changes a first-class event no other format has. The generic
 * parts (the settle debounce, the scroll/visibility wiring, the percentage)
 * come from lib/reader/progressTracking.ts; resume is useResumeScroll's job,
 * not this hook's.
 *
 * Two things happen here:
 *  - A genuine navigation to a *different* section starts back at its first
 *    passage — unless the stored position already points at the section being
 *    entered, in which case that's useResumeScroll's own jump landing (or the
 *    reader returning to a section they'd already made progress in), and the
 *    existing passageIndex is preserved rather than being stomped back to 0.
 *  - While remaining in one section, scroll position refines passageIndex
 *    further: "whichever passage is still visible at the very top of the
 *    viewport" is treated as the resume point.
 *
 * Deliberately never writes from an effect's *cleanup* — cleanup runs on every
 * dependency change (including React StrictMode's dev-only double-invoke on
 * mount), not just "the reader is genuinely leaving," so a write there landed
 * stale positions unrelated to anything the reader actually did.
 */
export function useReadingProgress({
  book,
  materialId,
  mode,
  activeSectionId,
  activeSection,
  getSlideEl,
  resumeReady,
}: {
  book: BookDocument;
  materialId: string;
  mode: "read" | "listen";
  activeSectionId: string | undefined;
  activeSection: Section | undefined;
  getSlideEl: (id: string) => HTMLDivElement | undefined;
  /** Whether useResumeScroll has finished landing the reader on their real
   * saved section/passage (Reader.tsx) — this hook has to stay off until
   * then. useResumeScroll's own `goTo` (jumping the carousel off its SSR-safe
   * default onto the real saved section) is itself a section *change* exactly
   * like a genuine reader navigation is, and the section-change branch below
   * can't tell the two apart while the position store is still mid-hydration:
   * it read `getPosition` as empty, defaulted to `passageIndex: 0`, and wrote
   * that back with a fresh timestamp — a wrong local value that then looked
   * *newer* than the real saved position, permanently blocking the correct one
   * from ever being applied. */
  resumeReady: boolean;
}) {
  const getPosition = useReadingPositionStore((s) => s.getPosition);
  const previousSectionRef = useRef<string | null>(null);
  const scale = useMemo(() => buildEpubScale(book), [book]);
  // Plain reading and listening write to one shared bookmark; `mode` is what
  // records which of them left it there, so a resume affordance can reopen
  // the same door the reader left by.
  const { commit, commitNow, positionFor } = useProgressCommit({
    materialId,
    mode,
    scale,
    enabled: resumeReady && mode === "read",
  });

  // Kept in sync every render (not read as an effect dependency below) —
  // `activeSection` is a fresh object identity every time useProgressiveText
  // swaps in more real prose (most notably its one-time "rest of the book"
  // background load, which lands moments after the reader arrives, right when
  // they're first settling in to read). Depending on the object itself tore
  // the tracker down and rebuilt it — cancelling any pending debounced write
  // with it — every time that happened, which routinely ate the very first
  // scroll-settle write of a session. `read` below consults this ref at call
  // time instead.
  const activeSectionRef = useRef(activeSection);
  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  const read = useCallback((): Locator | undefined => {
    const section = activeSectionRef.current;
    const el = activeSectionId ? getSlideEl(activeSectionId) : undefined;
    if (!section || !el || !activeSectionId) return undefined;

    const passageEls = el.querySelectorAll<HTMLElement>("[data-passage-id]");
    const containerTop = el.getBoundingClientRect().top;
    let lastId: string | undefined;
    for (const p of passageEls) {
      lastId = p.dataset.passageId;
      // The first passage not yet fully scrolled past the viewport's top
      // edge — i.e. whatever's showing right at the top right now.
      if (p.getBoundingClientRect().bottom > containerTop + 8) {
        const idx = section.passages.findIndex((pg) => pg.id === p.dataset.passageId);
        return idx >= 0 ? { kind: "epub", sectionId: activeSectionId, passageIndex: idx } : undefined;
      }
    }
    // Scrolled past every passage (e.g. resting on the "next chapter"
    // footer) — the last one is still the honest resume point, rather than
    // silently leaving whatever passageIndex was tracked earlier.
    const idx = lastId ? section.passages.findIndex((pg) => pg.id === lastId) : -1;
    return idx >= 0 ? { kind: "epub", sectionId: activeSectionId, passageIndex: idx } : undefined;
  }, [activeSectionId, getSlideEl]);

  // A genuine section change — see this hook's own doc comment. `previous ===
  // null` is the very first section observed after mount (whether that's
  // book.spine[0] or wherever useResumeScroll is about to jump to), left
  // alone rather than written back on its own.
  useEffect(() => {
    if (mode !== "read" || !activeSectionId || !resumeReady) return;
    const previous = previousSectionRef.current;
    previousSectionRef.current = activeSectionId;
    if (previous === null || previous === activeSectionId) return;

    const existing = locatorOfKind(getPosition(materialId)?.locator, "epub");
    const passageIndex = existing?.sectionId === activeSectionId ? existing.passageIndex : 0;
    commitNow({ kind: "epub", sectionId: activeSectionId, passageIndex });
  }, [materialId, mode, activeSectionId, resumeReady, getPosition, commitNow]);

  const getElement = useCallback(
    () => (activeSectionId ? getSlideEl(activeSectionId) : undefined),
    [activeSectionId, getSlideEl]
  );
  useLocatorScrollTracker({
    getElement,
    enabled: mode === "read" && resumeReady,
    read,
    commit,
    commitNow,
  });

  // For DocumentEndPanel's "Mark as finished" — evaluated at click time, same
  // as useDocumentProgress's own (see its comment). Returned rather than
  // committed: marking a material finished is not a progress write.
  const getPositionNow = useCallback(() => {
    const locator = read();
    return locator ? positionFor(locator) : undefined;
  }, [read, positionFor]);

  return { getPositionNow };
}
