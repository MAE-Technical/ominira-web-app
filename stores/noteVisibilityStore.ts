import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NoteVisibility } from "@/lib/api/types";

type NoteVisibilityState = {
  /** What a fresh compose surface (a brand-new note or reply — never an
   * edit, which starts from the note's own current visibility instead)
   * defaults its own toggle to. Public until a reader deliberately switches
   * to private at least once; from then on it stays whatever they last
   * left it at, across notes, across sessions, across devices this
   * persisted value doesn't sync to (this is per-device localStorage, not
   * a reader-account setting) — the point is just "don't make me re-flip
   * this every single time," not durability across a phone/laptop switch. */
  lastVisibility: NoteVisibility;
  setLastVisibility: (v: NoteVisibility) => void;
};

/** A composing preference, not reading-position/typography state — kept in
 * its own tiny store rather than folded into reader-store.ts, which is
 * explicitly scoped to "durable, cross-book preferences" (its own doc
 * comment) and already carries a versioned migrate() history for that
 * narrower set of fields; this one field has nothing to do with any of it.
 * No skipHydration/manual-rehydrate dance either — unlike theme (rendered
 * on first paint), nothing here is read before a reader has already
 * clicked into a composer, well after this store's had time to hydrate. */
export const useNoteVisibilityStore = create<NoteVisibilityState>()(
  persist(
    (set) => ({
      lastVisibility: "public",
      setLastVisibility: (v) => set({ lastVisibility: v }),
    }),
    { name: "ominira-note-visibility" }
  )
);
