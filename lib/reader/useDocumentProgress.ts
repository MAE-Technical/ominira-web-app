"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { locatorOfKind, sameLocator, type Locator, type LocatorKind, type LocatorScale, type ReaderMode } from "@/lib/reader/locator";
import { resolveResumeLocator, useLocatorScrollTracker, useProgressCommit } from "@/lib/reader/progressTracking";
import { useServerPositionReady } from "@/lib/reader/useServerPositionReady";
import { useReadingPositionStore } from "@/stores/reading-position-store";

/**
 * Resume + progress tracking for the single-document viewers (PDF, DOCX, web
 * article) — everything EPUB's own useResumeScroll/useReadingProgress pair
 * does, minus the parts that only exist because a book is a spine of
 * independently-scrolling sections.
 *
 * The viewer supplies only the two things that are genuinely format-specific:
 * `apply` (put me at this locator) and `read` (where am I now). Everything
 * else — which locator to open at, waiting for the server's own possibly
 * fresher position, the ordering that keeps tracking from overwriting the
 * position it's still restoring — lives here, once, for every format that
 * ever uses it.
 *
 * Order matters and is the whole point of this hook:
 *
 *  1. Resolve the resume locator *once* (URL target, else this device's
 *     localStorage), frozen for the lifetime of the mount.
 *  2. Apply it as soon as the viewer can act on it (`contentReady`), then —
 *     and only then — allow tracking to write. A write made during step 2
 *     stamps a fresh-but-wrong record that beats the real saved one on
 *     `updatedAt` and blocks it permanently; this is exactly the bug EPUB's
 *     `resumeReady` gate exists for.
 *  3. Reconcile once against the server's own row, the one thing step 1's
 *     synchronous local read cannot see (a position saved on another
 *     device) — skipped entirely the moment the reader has moved on their
 *     own, since their live position always outranks a just-arrived
 *     historical one.
 */
export function useDocumentProgress<K extends LocatorKind>({
  materialId,
  kind,
  mode = "read",
  urlLocator,
  scale,
  contentReady,
  getScrollElement,
  apply,
  read,
}: {
  materialId: string;
  /** The addressing scheme this viewer speaks — a stored locator of any
   * other kind is ignored rather than guessed at. */
  kind: K;
  /** Defaults to plain reading; a viewer that grows listening support passes
   * "listen" while playback owns the position. */
  mode?: ReaderMode;
  /** The locator this viewer was linked to, if any (`locatorFromQuery`). */
  urlLocator: Locator | undefined;
  /** Undefined until the document's extent is known — see LocatorScale. */
  scale: LocatorScale | undefined;
  /** Whether the viewer can actually act on a locator yet (a fetched-and-
   * converted DOCX, a loaded PDF). Until it can, there's nothing to restore
   * onto and nothing meaningful to read back. */
  contentReady: boolean;
  /** The scrolling element to track, for continuously-scrolled documents.
   * Omitted by discrete viewers (a PDF pager), which commit on their own
   * state changes instead of on scroll. */
  getScrollElement?: () => HTMLElement | null | undefined;
  apply: (locator: Extract<Locator, { kind: K }>) => void;
  read: () => Extract<Locator, { kind: K }> | undefined;
}) {
  const serverPositionReady = useServerPositionReady();

  // Declared before the commit pair below because it's what gates it: see
  // step 2 in this hook's own doc comment for why a write before resume has
  // landed permanently blocks the position it was restoring.
  const [resumeApplied, setResumeApplied] = useState(false);
  const {
    commit: commitRaw,
    commitNow: commitNowRaw,
    positionFor,
  } = useProgressCommit({ materialId, mode, scale, enabled: resumeApplied });

  // Any commit at all means the reader has moved under their own steam, so
  // the server reconciliation below must stand down — their live position is
  // by definition the freshest one there is.
  const hasCommittedRef = useRef(false);
  const commit = useCallback(
    (locator: Locator | undefined) => {
      if (locator) hasCommittedRef.current = true;
      commitRaw(locator);
    },
    [commitRaw]
  );
  const commitNow = useCallback(
    (locator: Locator | undefined) => {
      if (locator) hasCommittedRef.current = true;
      commitNowRaw(locator);
    },
    [commitNowRaw]
  );

  // Resolved once, on mount (a lazy initializer, not an effect — the whole
  // point is to have the target in hand before the first paint): localStorage
  // keeps moving in real time while narration plays, so two independent reads
  // can legitimately disagree and leave a viewer waiting to land somewhere
  // nothing asked it to reach. See resolveResumeLocator's own comment.
  const [resumeLocator] = useState(() => resolveResumeLocator(materialId, kind, urlLocator));

  // Step 2 — apply, then open the gate. `appliedLocatorRef` is what step 3
  // compares against, so a server row that agrees with what was already
  // applied costs nothing.
  const appliedLocatorRef = useRef<Locator | undefined>(undefined);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);
  useEffect(() => {
    if (resumeApplied || !contentReady) return;
    if (resumeLocator) {
      appliedLocatorRef.current = resumeLocator;
      applyRef.current(resumeLocator);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the tracking gate once the DOM has actually been positioned; there is no render-derivable value for "the restore has happened"
    setResumeApplied(true);
  }, [contentReady, resumeApplied, resumeLocator]);

  // Step 3 — the cross-device correction, a no-op the overwhelming majority
  // of the time (the local read already agreed with the server).
  const hasReconciledRef = useRef(false);
  useEffect(() => {
    if (hasReconciledRef.current || !resumeApplied || !serverPositionReady) return;
    hasReconciledRef.current = true;
    if (hasCommittedRef.current) return;
    // Read imperatively rather than subscribed: this viewer has no reason to
    // re-render on its own progress writes (every settle would otherwise
    // re-render a whole document body), and by the time `serverPositionReady`
    // flips, useContinueReading's own hydration effect — declared before this
    // one, via useServerPositionReady — has already folded the server's row
    // into the store.
    const remote = locatorOfKind(useReadingPositionStore.getState().positions[materialId]?.locator, kind);
    if (!remote || sameLocator(remote, appliedLocatorRef.current)) return;
    appliedLocatorRef.current = remote;
    applyRef.current(remote);
  }, [resumeApplied, serverPositionReady, kind, materialId]);

  // Tracking, for continuously-scrolled documents only — gated on resume
  // having landed (step 2), never merely on the content existing.
  const noElement = useCallback(() => undefined, []);
  useLocatorScrollTracker({
    getElement: getScrollElement ?? noElement,
    enabled: resumeApplied,
    read,
    commit,
    commitNow,
  });

  // Evaluated on demand rather than per render: its one caller is a deliberate
  // act (DocumentEndPanel's "Mark as finished"), and the honest answer is where
  // the reader is when they tap it.
  const getPositionNow = useCallback(() => {
    const locator = read();
    return locator ? positionFor(locator) : undefined;
  }, [read, positionFor]);

  return { commit, commitNow, resumeApplied, getPositionNow };
}
