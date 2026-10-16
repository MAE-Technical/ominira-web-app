import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Section } from "@/lib/book/schema";
import type { ReaderChunk } from "@/lib/materials/readerFiles";

const BACKGROUND_CONCURRENCY = 2;

/** Puts each chunk section's real passages into the tree. Everything outside
 * a changed node's own path keeps its object identity, so a memo keyed on an
 * unrelated section never invalidates. */
function fillPassages(sections: Section[], chunk: ReaderChunk): Section[] {
  let changed = false;
  const next = sections.map((s) => {
    const passages = chunk[s.id];
    const children = s.children.length > 0 ? fillPassages(s.children, chunk) : s.children;
    if (!passages && children === s.children) return s;
    changed = true;
    return { ...s, passages: passages ?? s.passages, children };
  });
  return changed ? next : sections;
}

/**
 * Fills in a book's prose from the CDN, chunk by chunk, on top of the
 * structure reader.json already gave (lib/materials/readerFiles.ts: every
 * section is real from the start, only `passage.text` starts blank).
 *
 *  - `ensureTextLoaded(sectionId)` fetches the chunk holding that section; a
 *    no-op if it's loaded or in flight, or if the section has no passages.
 *  - `loadAllTextInBackground(fromSectionId)` fetches every other chunk, the
 *    ones after the reader's own first and then the ones before, a couple at
 *    a time. Search, the notes index and narration all read the whole book.
 *  - `isTextLoaded(sectionId)` says whether that section's prose is in.
 *
 * Chunk URLs are immutable, so the browser and the service worker keep them.
 * A failed fetch leaves its sections blank; the `online` listener retries
 * every failed chunk, and the background wave if it didn't finish, when the
 * browser reconnects.
 *
 * `sections` is the live, ever-more-complete tree every reader consumer
 * (orderedSections, passageLookup, search, notes, narration) reads.
 */
export function useProgressiveText({
  contentBase,
  initialSections,
  chunks,
}: {
  /** The book's version folder on the CDN, ending in "/". */
  contentBase: string;
  initialSections: Section[];
  /** reader.json's `chunks`: the section ids each chunk holds. */
  chunks: string[][];
}) {
  const [sections, setSections] = useState(initialSections);
  const chunkOf = useMemo(() => {
    const map = new Map<string, number>();
    chunks.forEach((ids, i) => ids.forEach((id) => map.set(id, i)));
    return map;
  }, [chunks]);
  const loadedRef = useRef(new Set<number>());
  const inFlightRef = useRef(new Map<number, Promise<boolean>>());
  const failedRef = useRef(new Set<number>());
  const backgroundRef = useRef<{ from?: string; running: boolean; failed: boolean }>({ running: false, failed: false });

  /** Resolves true once chunk `n` is in, false if its fetch failed. */
  const loadChunk = useCallback(
    (n: number): Promise<boolean> => {
      if (loadedRef.current.has(n)) return Promise.resolve(true);
      const existing = inFlightRef.current.get(n);
      if (existing) return existing;
      const promise = fetch(`${contentBase}s/${n}.json`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`chunk ${n}: ${res.status}`);
          const chunk = (await res.json()) as ReaderChunk;
          setSections((prev) => fillPassages(prev, chunk));
          loadedRef.current.add(n);
          failedRef.current.delete(n);
          return true;
        })
        .catch(() => {
          failedRef.current.add(n);
          return false;
        })
        .finally(() => inFlightRef.current.delete(n));
      inFlightRef.current.set(n, promise);
      return promise;
    },
    [contentBase]
  );

  const isTextLoaded = useCallback(
    (sectionId: string) => {
      const n = chunkOf.get(sectionId);
      return n === undefined || loadedRef.current.has(n);
    },
    [chunkOf]
  );

  const ensureTextLoaded = useCallback(
    async (sectionId: string): Promise<void> => {
      const n = chunkOf.get(sectionId);
      if (n !== undefined) await loadChunk(n);
    },
    [chunkOf, loadChunk]
  );

  const loadAllTextInBackground = useCallback(
    async (fromSectionId?: string): Promise<void> => {
      const background = backgroundRef.current;
      if (background.running) return;
      background.running = true;
      background.failed = false;
      background.from = fromSectionId ?? background.from;
      const start = (background.from !== undefined ? chunkOf.get(background.from) : undefined) ?? 0;
      const order = Array.from({ length: chunks.length }, (_, i) => (start + i) % chunks.length);
      let next = 0;
      await Promise.all(
        Array.from({ length: BACKGROUND_CONCURRENCY }, async () => {
          while (next < order.length) {
            if (!(await loadChunk(order[next++]))) background.failed = true;
          }
        })
      );
      background.running = false;
    },
    [chunkOf, chunks.length, loadChunk]
  );

  useEffect(() => {
    const onOnline = () => {
      for (const n of failedRef.current) loadChunk(n);
      if (backgroundRef.current.failed) loadAllTextInBackground();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [loadChunk, loadAllTextInBackground]);

  return useMemo(
    () => ({ sections, isTextLoaded, ensureTextLoaded, loadAllTextInBackground }),
    [sections, isTextLoaded, ensureTextLoaded, loadAllTextInBackground]
  );
}
