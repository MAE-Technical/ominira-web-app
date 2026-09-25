import { useCallback, useEffect, useState } from "react";
import type { AnnotationRange } from "@/lib/api/types";
import { sameRanges, type Annotation } from "@/stores/library-store";
import { useSessionStore } from "@/stores/session-store";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useAnnotations } from "./useAnnotations";
import { useCreateHighlight, useDeleteHighlight } from "@/lib/materials/useHighlightMutations";
import { useDeleteNote } from "@/lib/community/useNoteMutations";
import { topLevelNotes } from "./noteThread";
import { computeSelectionRanges } from "./annotationSelection";

export type SelectionAnchor = { top: number; bottom: number; left: number; right: number };
export type SelectionState = { ranges: AnnotationRange[]; anchor: SelectionAnchor };

/** The synthetic id `getForPassage` stamps onto the pending-selection
 * overlay below — PassageText (PassageContent.tsx) checks for exactly this
 * id to render its wash without also making it clickable (see there for
 * why a click target is wrong for a row that isn't backed by anything real
 * yet). */
export const PENDING_ANNOTATION_ID = "pending-selection";

/** Replaces the SelectionMenu pill in place, anchored at whatever selection
 * triggered it (see SelectionMenu's own `override` prop) — "auth" for a
 * signed-out reader's highlight attempt (MembersOnlyPrompt, stays up until
 * dismissed since it carries real Log in/Join us links), "error" for a
 * failed optimistic highlight create/delete (a brief message, self-clears —
 * see the timer effect below). Kept independent of `selection` itself since
 * an "error" only surfaces after `selection` has already been cleared (the
 * mutation was already dispatched). */
export type SelectionOverlay = { anchor: SelectionAnchor; kind: "auth" | "error" };

export type NotesPanelState = {
  passageId: string;
  annotationId?: string;
  ranges?: AnnotationRange[];
  /** Set only when editing one specific existing note entry in place
   * (from a per-entry Edit) — absent, the panel composes a fresh note to
   * append to the thread instead of overwriting one. */
  editingNoteId?: string;
  /** When deep-linked from a notification, the specific thread (root note
   * id) whose replies should be fully expanded (show all) rather than
   * collapsed to 2. */
  targetThreadId?: string;
};

/**
 * Everything about highlighting and note-taking on passage text, in one
 * place — capturing a selection (including one that spans several
 * passages), the tooltip's Highlight/Note actions, the notes panel's open/
 * closed state, and routing a click on an existing note straight to it.
 * Reader.tsx calls this once and wires the result into SelectionMenu/
 * NotesSidebar; nothing else in the component tree owns this state.
 *
 * Selecting text is the *only* way to start a highlight or note (per
 * product decision) — there's no separate "add" affordance on unmarked
 * passages, so this hook has no "create from nothing" entry point beyond
 * onTextSelect. Highlight/note *data* comes from useAnnotations (real
 * server rows via TanStack Query); this hook owns only the interaction
 * state on top of it plus the two mutations a selection itself can
 * trigger (toggling a highlight, deleting a whole annotation).
 */
export function useTextAnnotations(materialId: string) {
  const { annotationsByPassage } = useAnnotations(materialId);
  const createHighlight = useCreateHighlight(materialId);
  const deleteHighlight = useDeleteHighlight(materialId);
  const deleteNote = useDeleteNote(materialId);
  const isAuthenticated = useIsAuthenticated();
  const readerId = useSessionStore((s) => s.readerId);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [notesPanel, setNotesPanel] = useState<NotesPanelState | null>(null);
  const [overlay, setOverlay] = useState<SelectionOverlay | null>(null);

  // The "error" overlay is purely informational (no links to click, unlike
  // "auth") — self-clears rather than waiting on an outside tap.
  useEffect(() => {
    if (overlay?.kind !== "error") return;
    const timer = setTimeout(() => setOverlay(null), 2500);
    return () => clearTimeout(timer);
  }, [overlay]);

  const getForPassage = useCallback(
    (passageId: string): Annotation[] => annotationsByPassage[passageId] ?? [],
    [annotationsByPassage]
  );

  // Called from the active section's own onMouseUp (not per-passage) so a
  // drag that crosses paragraph boundaries is captured as one selection
  // rather than only reacting to whichever passage the mouse happened to
  // release over.
  const onTextSelect = useCallback((sectionEl: HTMLElement) => {
    const ranges = computeSelectionRanges(sectionEl);
    if (!ranges) {
      // A plain tap (mouseup/touchend that leaves nothing selected) ends
      // whatever selection is currently on screen — the same gesture that
      // opened the pill now closes it. This used to be the job of a
      // full-screen "click outside" catcher in SelectionMenu, but that was
      // a bare `fixed inset-0` div sitting outside the scrollable content
      // tree with no scrollable ancestor of its own, so it silently
      // swallowed every touch-scroll gesture for as long as the pill was
      // open (Safari/iPhone: "selects everything and you can't scroll").
      setSelection(null);
      return;
    }
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    setSelection({ ranges, anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } });
  }, []);

  const dismissSelection = useCallback(() => setSelection(null), []);

  // Re-selecting an already-highlighted span toggles it off instead of
  // stacking a duplicate — the tooltip's Highlight button is the only
  // affordance for removing a highlight, matching "selection is the only
  // mechanism" (no separate click-to-cancel menu on marked text).
  // existing.highlightId (the underlying Highlight row's own id) is what
  // deleteHighlight actually needs — existing.id is the grouped view's
  // deterministic range-derived key, not a real row id.
  const highlightSelection = useCallback(() => {
    if (!selection) return;
    const { ranges, anchor } = selection;
    const existing = getForPassage(ranges[0].passageId).find((a) => a.highlighted && sameRanges(a.ranges, ranges));
    if (!isAuthenticated) {
      setOverlay({ anchor, kind: "auth" });
      setSelection(null);
      return;
    }
    const onError = () => setOverlay({ anchor, kind: "error" });
    if (existing?.highlightId) deleteHighlight.mutate(existing.highlightId, { onError });
    else createHighlight.mutate(ranges, { onError });
    setSelection(null);
  }, [selection, getForPassage, deleteHighlight, createHighlight, isAuthenticated]);

  // Adding a note always inserts a brand-new, independent note row — there
  // is no shared parent object to find-or-create, so a re-selection of an
  // already-noted range and a selection with nothing on it yet both just
  // create a fresh note with the current ranges (see NotesSidebar/
  // FeedHighlightThread's own composer onSave). The panel still looks up
  // whatever thread already lives at this exact selection so it has
  // something to *display* above the composer, but that lookup is purely
  // for rendering, not for routing the save.
  const noteFromSelection = useCallback(() => {
    if (!selection) return;
    const { ranges } = selection;
    const existing = getForPassage(ranges[0].passageId).find((a) => sameRanges(a.ranges, ranges));
    setNotesPanel({ passageId: ranges[0].passageId, annotationId: existing?.id, ranges });
    setSelection(null);
  }, [selection, getForPassage]);

  // Whatever highlight/note thread already lives at the exact ranges of the
  // *current* selection — purely for deciding whether the selection pill
  // should offer a Delete action at all (undefined = nothing here yet).
  const existingForSelection = selection
    ? getForPassage(selection.ranges[0].passageId).find((a) => sameRanges(a.ranges, selection.ranges))
    : undefined;

  // Removes everything *this reader owns* at this selection in one action —
  // their own highlight (if any) and every root note they themselves
  // authored (if any), never another reader's public note that just
  // happens to share this exact selection's ranges (deleting a highlight/
  // note is always own-content-only — the server enforces this too, a 403
  // for anything else, but filtering here avoids firing doomed requests).
  // Only the *root* notes are deleted explicitly: DELETE /api/community/
  // notes/{id} cascades to that note's own replies server-side
  // (parent_id on delete cascade, models-spec.md), so deleting every own
  // root already removes that reader's whole sub-thread.
  const deleteSelection = useCallback(() => {
    if (!selection || !existingForSelection) return;
    const { anchor } = selection;
    if (existingForSelection.highlightId) {
      deleteHighlight.mutate(existingForSelection.highlightId, {
        onError: () => setOverlay({ anchor, kind: "error" }),
      });
    }
    for (const note of topLevelNotes(existingForSelection.notes)) {
      if (note.author.readerId === readerId) deleteNote.mutate(note.id);
    }
    setSelection(null);
  }, [selection, existingForSelection, deleteHighlight, deleteNote, readerId]);

  // Clicking any existing mark (highlight-only or noted) — opens its thread
  // directly, no intermediate menu. Removing a highlight or deleting a note
  // stays a *selection*-driven action (re-select the marked text, partially
  // or in full, and use the pill's Highlight/Delete — see selection/
  // deleteSelection above), so a plain click has exactly one job: read/add
  // to this span's notes.
  const onNoteMarkerClick = useCallback(
    (passageId: string, annotationId: string, opts?: { targetThreadId?: string }) => {
      setNotesPanel({ passageId, annotationId, targetThreadId: opts?.targetThreadId });
    },
    []
  );

  const closeNotesPanel = useCallback(() => setNotesPanel(null), []);

  // Once the reader taps "Note," the browser collapses its own native
  // selection as ordinary click-handling fallout (no code here does that —
  // it happens before this hook's onClick even runs), so the marked text
  // would otherwise go visually bare for as long as the panel is open on a
  // brand-new thread. Splicing in this synthetic, unsaved-but-highlighted
  // entry keeps the exact same wash a real Highlight would have produced —
  // gone the moment the panel closes, whether or not anything was actually
  // saved, since it's never written to the server. Only for a *fresh*
  // thread (no `annotationId` yet) — one already backed by a real
  // Annotation is already rendering correctly on its own.
  const getForPassageWithPending = useCallback(
    (passageId: string): Annotation[] => {
      const real = getForPassage(passageId);
      if (!notesPanel || notesPanel.annotationId || !notesPanel.ranges) return real;
      const range = notesPanel.ranges.find((r) => r.passageId === passageId);
      if (!range) return real;
      const pending: Annotation = {
        id: PENDING_ANNOTATION_ID,
        ranges: notesPanel.ranges,
        highlighted: true,
        notes: [],
        savedAt: 0,
      };
      return [...real, pending];
    },
    [getForPassage, notesPanel]
  );

  return {
    getForPassage: getForPassageWithPending,
    selection,
    notesPanel,
    overlay,
    dismissOverlay: useCallback(() => setOverlay(null), []),
    onTextSelect,
    dismissSelection,
    highlightSelection,
    noteFromSelection,
    hasExistingAnnotation: Boolean(existingForSelection),
    deleteSelection,
    onNoteMarkerClick,
    closeNotesPanel,
  };
}
