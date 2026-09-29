import { useCallback, useEffect, useRef } from "react";
import {
  locatorOfKind,
  locatorPercent,
  type Locator,
  type LocatorKind,
  type LocatorScale,
  type ReaderMode,
} from "@/lib/reader/locator";
import { readLocalPositionSync, useReadingPositionStore, type PositionInput } from "@/stores/reading-position-store";

// A locator is only committed once movement has settled for this long —
// reset on every event, so continuous scrolling never writes at all until
// the reader actually stops.
const SETTLE_MS = 600;

/**
 * The write half of progress tracking, shared by every format: turns a
 * `Locator` into a store write with its percentage attached, debounced so
 * continuous movement doesn't write continuously.
 *
 * Deliberately format-agnostic — computing *where the reader is* is the only
 * part that differs per format (a spine passage, a page number, a block
 * index), and that stays with the viewer that can actually answer it.
 *
 * `commit` is for ordinary movement; `commitNow` skips the settle timer, for
 * the one signal that genuinely means "the reader is leaving" (the tab being
 * hidden) where waiting could lose the last few paragraphs. `positionFor`
 * exposes the same locator-to-record conversion without writing anything —
 * what a deliberate one-off act (marking a material finished) needs, since it
 * has to describe the reader's position without pretending to be progress.
 */
export function useProgressCommit({
  materialId,
  mode,
  scale,
  enabled,
}: {
  materialId: string;
  mode: ReaderMode;
  /** Undefined until the material's extent is known (a PDF's page count, a
   * rendered document's block count) — a commit made before then still
   * records the locator, just with 0%, and the next one corrects it. */
  scale: LocatorScale | undefined;
  /** Whether writing is allowed yet. Every caller must hold this false until
   * resume has actually landed: a write made while the position is still
   * being restored stamps a fresh-but-wrong record, which then *beats* the
   * correct saved one on `updatedAt` and blocks it permanently. */
  enabled: boolean;
}) {
  const setPosition = useReadingPositionStore((s) => s.setPosition);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read at call time rather than captured, so `commit`/`commitNow` stay
  // referentially stable: they're wired into scroll listeners and effect
  // dependency arrays, and a new identity on every scale/mode change would
  // tear those down mid-scroll (and with them any pending settle timer).
  // Synced in an effect declared *before* every effect that can commit, so a
  // consumer's own effect never reads a stale snapshot.
  const latest = useRef({ materialId, mode, scale, enabled });
  useEffect(() => {
    latest.current = { materialId, mode, scale, enabled };
  }, [materialId, mode, scale, enabled]);

  const positionFor = useCallback((locator: Locator): PositionInput => {
    const { mode, scale } = latest.current;
    return { locator, mode, progressPercent: locatorPercent(scale, locator) };
  }, []);

  const write = useCallback(
    (locator: Locator) => {
      const { materialId, enabled } = latest.current;
      if (!enabled) return;
      setPosition(materialId, positionFor(locator));
    },
    [setPosition, positionFor]
  );

  const commitNow = useCallback(
    (locator: Locator | undefined) => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (locator) write(locator);
    },
    [write]
  );

  const commit = useCallback(
    (locator: Locator | undefined) => {
      if (!locator) return;
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => write(locator), SETTLE_MS);
    },
    [write]
  );

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    []
  );

  return { commit, commitNow, positionFor };
}

/**
 * Wires a scrolling element to a `useProgressCommit` pair: scroll events
 * commit (debounced), and the tab being hidden commits immediately.
 *
 * `read` is recomputed fresh at event time rather than tracked as state —
 * the element is still mounted and attached for as long as this listener is,
 * so there's no need to guess, and nothing here re-renders on scroll.
 */
export function useLocatorScrollTracker({
  getElement,
  enabled,
  read,
  commit,
  commitNow,
}: {
  /** Resolved inside the effect, not at render time: the element a viewer
   * wants to listen on can be one that only mounts in the same commit as the
   * state change pointing at it (a carousel swapping in the next section's
   * slide), which a value read during render would miss. Memoize it over
   * whatever identifies the element — that's this hook's re-attach trigger. */
  getElement: () => HTMLElement | null | undefined;
  enabled: boolean;
  read: () => Locator | undefined;
  commit: (locator: Locator | undefined) => void;
  commitNow: (locator: Locator | undefined) => void;
}) {
  // Same reasoning as useProgressCommit's own ref: `read` is typically an
  // inline closure over DOM state, so a fresh identity every render must not
  // be allowed to re-run this effect and drop the scroll listener.
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  }, [read]);

  useEffect(() => {
    const element = getElement();
    if (!element || !enabled) return;

    const onScroll = () => commit(readRef.current());
    element.addEventListener("scroll", onScroll, { passive: true });

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") commitNow(readRef.current());
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      element.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [getElement, enabled, commit, commitNow]);
}

/**
 * The locator a viewer should open at: an explicit URL target if the link
 * that got here carried one, otherwise this device's own last-known position
 * read synchronously from localStorage (no hydration or network to wait on).
 *
 * Frozen on first call per mount by the caller (see `useResumeLocator` and
 * useResumeScroll) — localStorage keeps moving in real time while narration
 * plays, so two independent reads can legitimately disagree and leave a
 * viewer waiting to land on a target nothing asked it to reach.
 */
export function resolveResumeLocator<K extends LocatorKind>(
  materialId: string,
  kind: K,
  urlLocator: Locator | undefined
): Extract<Locator, { kind: K }> | undefined {
  return (
    locatorOfKind(urlLocator, kind) ?? locatorOfKind(readLocalPositionSync(materialId)?.locator, kind)
  );
}
