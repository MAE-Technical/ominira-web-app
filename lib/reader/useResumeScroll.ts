import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BookDocument, Section } from "@/lib/book/schema";
import { resolveSpineTarget } from "@/lib/reader/sections";
import { readLocalPositionSync, useReadingPositionStore, type Position } from "@/stores/reading-position-store";

/**
 * Resolves the exact {sectionId, passageIndex} the reader should actually
 * land on — this device's own last-known position (`readLocalPositionSync`,
 * synchronous, no store hydration to wait on) unless `targetSectionId`
 * (`?section=`, a chapter link) overrides it, resolved through
 * `resolveSpineTarget` since it can legitimately name a pure navigation
 * label with no spine slot of its own. Returns `null` when neither source
 * names a resolvable section — a first-time reader, an incognito profile,
 * or a target pointing at a section this book's own `spine` doesn't contain
 * — so callers can tell "nothing to resume" apart from "resume to the first
 * section", which never needs a `goTo` call at all (that's where the
 * carousel's own default state already sits).
 *
 * Called exactly once per mount (see `resumeTargetRef` below) rather than
 * separately by each of useResumeScroll's three steps — `readLocalPositionSync`
 * reads *live* localStorage, and this device's own saved position keeps
 * moving in real time while a book is playing (NarrationEngine's own
 * position-persist effect writes it on every passage/section advance, even
 * while the reader itself isn't mounted). Re-reading it independently in a
 * later step used to mean step 1 could `goTo` the section this returned at
 * mount, while step 2 — reading it fresh a tick later — got back a
 * *different*, since-advanced section and waited forever for `activeSectionId`
 * to match a target `goTo` was never actually asked to reach. A single
 * frozen read is what step 2's own doc comment already claimed ("the two
 * agree on exactly what resume meant here") — this is what actually makes
 * that true.
 */
function resolveInitialTarget(
  book: BookDocument,
  materialId: string,
  targetSectionId: string | undefined,
  targetPassageIndex: number | undefined
): { sectionId: string; passageIndex: number } | null {
  if (targetSectionId) {
    const sectionId = resolveSpineTarget(targetSectionId, book.sections, book.spine);
    return sectionId ? { sectionId, passageIndex: targetPassageIndex ?? 0 } : null;
  }
  return readLocalPositionSync(materialId) ?? null;
}

/**
 * Lands the reader where they actually left off. Three steps:
 *
 *  1. A `useLayoutEffect`, once, on mount — corrects which section is
 *     active *before the browser paints*, straight off this device's own
 *     localStorage (no async store hydration to wait on). This has to be a
 *     layout effect and not a lazy `useState` initializer on the carousel
 *     itself: the carousel's initial render has to come out identical on
 *     the server and the client's first hydration pass (the server has no
 *     way to know a resume position at all — it never sees this reader's
 *     Bearer token), and reading localStorage inside that shared initial
 *     render broke exactly that, throwing a hydration mismatch and forcing
 *     React to regenerate the whole tree from scratch. Running the
 *     correction here instead, strictly after hydration has already
 *     committed, sidesteps the mismatch entirely — and it's still
 *     effectively flash-free, since a layout effect's own state updates are
 *     flushed before the browser ever paints the (momentarily wrong) first
 *     frame.
 *  2. An ordinary effect that, once the carousel has actually settled on
 *     that section, scrolls to the exact saved passage within it.
 *  3. A later reconciliation effect for the one thing step 1's synchronous
 *     local read can't see: a *fresher* position saved from another
 *     device, which only the real `GET /continue-reading` round trip can
 *     supply — jumps again if the server's real position disagrees.
 *
 * `targetPassageId` (the home community feed's deep links) narrows either
 * source further to one specific passage within the section, instead of
 * always landing on the section's first passage. `targetPassageIndex` is
 * the same idea for the book-detail page's own "Resume reading" button
 * (BookDetailView.tsx): it already has this reader's real `reader_activities`
 * row in hand (via useContinueReading) the moment it renders that button, so
 * it hands the exact `sectionId`/`passageIndex` straight through the URL
 * (`?section=&passageIndex=`) instead of asking this hook to reconstruct the
 * same thing from a local mirror that may not agree with the server. When
 * present, it takes over step 2 entirely (see below) — there's nothing left
 * to reconcile in step 3 either, since the server value *is* the target.
 *
 * Returns whether the resume attempt (successful or not — an unsaved book
 * has nothing to resume) has finished, so a caller can hold off revealing
 * the reader until it has.
 */
export function useResumeScroll({
  book,
  materialId,
  sectionsById,
  orderedSections,
  activeSectionId,
  goTo,
  getSlideEl,
  targetSectionId,
  targetPassageId,
  targetPassageIndex,
  serverPositionReady,
}: {
  book: BookDocument;
  materialId: string;
  sectionsById: Map<string, Section>;
  orderedSections: Section[];
  /** The carousel's own current slide — used to tell when step 1's `goTo`
   * call has actually landed, so step 2 doesn't scroll within whatever
   * slide happened to still be mounted at the time. */
  activeSectionId: string | undefined;
  goTo: (index: number, opts?: { animate?: boolean }) => void;
  getSlideEl: (id: string) => HTMLDivElement | undefined;
  targetSectionId?: string;
  targetPassageId?: string;
  /** ?passageIndex=<n> — see this hook's own doc comment above. Only ever
   * meaningful alongside targetSectionId; ignored on its own. */
  targetPassageIndex?: number;
  /** Whether GET /continue-reading has had its chance to correct this
   * device's local mirror yet (Reader.tsx) — see the reconciliation effect
   * below for why this matters as much as `hasHydrated` does. */
  serverPositionReady: boolean;
}) {
  const getPosition = useReadingPositionStore((s) => s.getPosition);
  const hasHydrated = useReadingPositionStore((s) => s.hasHydrated);
  const positionSourceReady = hasHydrated && serverPositionReady;

  const scrollToPassage = (sectionId: string, passageId: string) => {
    requestAnimationFrame(() => {
      getSlideEl(sectionId)
        ?.querySelector(`[data-passage-id="${passageId}"]`)
        ?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  // Frozen once, on mount — see resolveInitialTarget's own doc comment on
  // why a single shared read (not each step re-reading live localStorage
  // independently) is what actually keeps steps 1 and 2 pointed at the same
  // target while narration keeps advancing this device's saved position in
  // the background.
  const resumeTargetRef = useRef<{ sectionId: string; passageIndex: number } | null>(null);

  // Step 1 — see this hook's own doc comment.
  const hasAppliedInitialSectionRef = useRef(false);
  useLayoutEffect(() => {
    if (hasAppliedInitialSectionRef.current) return;
    hasAppliedInitialSectionRef.current = true;
    const resolved = resolveInitialTarget(book, materialId, targetSectionId, targetPassageIndex);
    resumeTargetRef.current = resolved;
    if (!resolved) return;
    const index = orderedSections.findIndex((s) => s.id === resolved.sectionId);
    if (index > 0) goTo(index, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount only
  }, []);

  // Step 2 — waits for `activeSectionId` to actually be the resolved
  // target (step 1's goTo, once its state update has landed) before
  // scrolling within it. Reads step 1's own frozen resumeTargetRef rather
  // than resolving again, so the two steps are guaranteed to agree on
  // exactly what "resume" meant here.
  const usedPositionRef = useRef<{ sectionId: string; passageIndex: number } | null>(null);
  const hasScrolledInitialRef = useRef(false);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  useEffect(() => {
    if (hasScrolledInitialRef.current || !activeSectionId) return;

    const stored = resumeTargetRef.current;

    // Nothing to resume at all, or it names a section that isn't (or isn't
    // any longer) actually in this book's spine — step 1 has nothing to
    // `goTo` in that case either, so `activeSectionId` will never become
    // `stored.sectionId`; done immediately rather than waiting forever for
    // a match that can't happen. Deferred a frame purely to satisfy the
    // no-setState-in-effect-body rule, same as the found-a-target path
    // below.
    const sectionExists = stored && orderedSections.some((s) => s.id === stored.sectionId);
    if (!stored || !sectionExists) {
      hasScrolledInitialRef.current = true;
      const raf = requestAnimationFrame(() => setInitialScrollDone(true));
      return () => cancelAnimationFrame(raf);
    }
    // Step 1's goTo hasn't landed on this section yet (still mid-render) —
    // wait for the next pass rather than scrolling within the wrong slide.
    if (stored.sectionId !== activeSectionId) return;

    hasScrolledInitialRef.current = true;
    const passageId = targetPassageId ?? sectionsById.get(stored.sectionId)?.passages[stored.passageIndex]?.id;
    if (passageId) {
      usedPositionRef.current = stored;
      scrollToPassage(stored.sectionId, passageId);
    }
    const raf = requestAnimationFrame(() => setInitialScrollDone(true));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, materialId, activeSectionId, targetSectionId, targetPassageId, targetPassageIndex]);

  // Step 3 — reconciliation against a fresher position from another
  // device, the one thing step 1/2's synchronous local reads can't see.
  // A no-op the overwhelming majority of the time (the local read already
  // agreed with the server).
  const hasReconciledRef = useRef(false);
  useEffect(() => {
    if (hasReconciledRef.current || !initialScrollDone) return;
    if (targetSectionId || !positionSourceReady) return; // a chapter-link jump never gets second-guessed by resume
    hasReconciledRef.current = true;

    const stored: Position | undefined = getPosition(materialId);
    if (!stored) return;
    const used = usedPositionRef.current;
    if (used && used.sectionId === stored.sectionId && used.passageIndex === stored.passageIndex) return;

    const sectionIndex = orderedSections.findIndex((s) => s.id === stored.sectionId);
    if (sectionIndex < 0) return;
    const passageId = sectionsById.get(stored.sectionId)?.passages[stored.passageIndex]?.id;
    if (!passageId) return;

    goTo(sectionIndex, { animate: false });
    scrollToPassage(stored.sectionId, passageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScrollDone, positionSourceReady, materialId, targetSectionId]);

  return initialScrollDone;
}
