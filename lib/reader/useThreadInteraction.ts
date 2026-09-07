import { useEffect, useState } from "react";
import type { AnnotationRange, Note } from "@/lib/api/types";
import { useCreateNote, useUpdateNote, useDeleteNote, useToggleReaction } from "@/lib/community/useNoteMutations";
import { topLevelNotes } from "./noteThread";
import type { ThreadActions, ThreadUIState } from "./threadTypes";

const SAVE_FAILED_MESSAGE = "Couldn't save — check your connection and try again.";

/**
 * Everything about how one highlight's thread behaves interactively —
 * which single composer/menu/edit is active (never more than one at a
 * time, across the whole thread), which top-level notes have their
 * replies expanded, and the server-backed mutations bound to this
 * highlight's own `ranges`. Extracted out of NotesSidebar (the per-
 * highlight note panel) so the book-wide feed can give each highlight it
 * lists the exact same interactive thread — reply, edit, delete, react —
 * rather than a second, read-only implementation of the same thing.
 */
export function useThreadInteraction({
  materialId,
  ranges,
  allNotes,
  initialEditingId,
  initialExpandAll,
  onNoteAdded,
}: {
  materialId: string;
  ranges: AnnotationRange[];
  allNotes: Note[];
  /** Deep-links straight into editing one specific existing entry, and
   * auto-expands its parent so editing a reply never opens into a
   * collapsed, invisible thread. Only the standalone note panel uses this
   * (a deep-link from elsewhere in the reader) — the feed never does. */
  initialEditingId?: string;
  /** Starts every top-level note's replies expanded rather than collapsed
   * — the home feed's deep link into one specific note sets this, since a
   * reader arriving from a community discussion came for the conversation
   * and shouldn't have to expand every reply by hand to see it. A plain
   * marker click leaves this unset (collapsed default). */
  initialExpandAll?: boolean;
  /** Fires right when a reply is sent (optimistic-timed, not gated on the
   * request actually landing — same "instant" feel as the optimistic row
   * itself) — the book-wide feed's own FeedHighlightThread uses this to
   * jump the reader to the passage a reply just landed on, the same
   * "navigate to where it is" a note deserves whether the reader tapped
   * its quote or just added to it from afar while browsing. Never fires
   * for edit/delete/react — none of those move where a note lives, so
   * there's nothing to navigate to. Left unset (no-op) by every caller
   * where "position" isn't a meaningful concept: the standalone per-
   * highlight panel (the reader's already there) and a rangeless general
   * note's own thread (nowhere to jump to). */
  onNoteAdded?: () => void;
}) {
  const createNote = useCreateNote(materialId);
  const updateNote = useUpdateNote(materialId);
  const deleteNote = useDeleteNote(materialId);
  const toggleReaction = useToggleReaction(materialId);

  // Evaluated once at mount, same as editingId below — not a live
  // subscription, since allNotes/initialEditingId are set once per
  // thread instance (a fresh NotesSidebar/FeedHighlightThread mount).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (initialExpandAll) return new Set(topLevelNotes(allNotes).map((n) => n.id));
    const target = initialEditingId ? allNotes.find((n) => n.id === initialEditingId) : undefined;
    return target?.parentId ? new Set([target.parentId]) : new Set();
  });
  // Only one composer/menu is ever open across this thread at a time —
  // opening a new one implicitly closes whatever else was open. Keyed by
  // whichever note/reply id it belongs to.
  const [activeComposerFor, setActiveComposerFor] = useState<string | null>(null);
  const [activeMenuFor, setActiveMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(initialEditingId ?? null);
  // A failure here always arrives after the affordance that triggered it has
  // already moved on (the composer already collapsed/reset, the reaction
  // pill already flipped back) — same reasoning as useTextAnnotations' own
  // overlay for highlights — so this is a shared, thread-wide banner rather
  // than something any one composer/button renders itself. Self-clears; see
  // the timer effect below.
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 4000);
    return () => clearTimeout(timer);
  }, [actionError]);
  const reportError = (message: string) => setActionError(message);

  const ui: ThreadUIState = {
    activeComposerFor,
    toggleComposer: (id) => setActiveComposerFor((cur) => (cur === id ? null : id)),
    activeMenuFor,
    toggleMenu: (id) => setActiveMenuFor(id),
    editingId,
    startEdit: (id) => setEditingId(id),
    actionError,
    reportError,
  };
  const onError = () => reportError(SAVE_FAILED_MESSAGE);
  const actions: ThreadActions = {
    // Signed-out gating happens above this layer now, not by wrapping these:
    // reply/edit/delete are only ever reachable via affordances that are
    // themselves already gated (NoteComposer's own MembersOnlyPrompt for
    // reply; Edit/Delete's menu items never render for a non-owned note,
    // and a reader is never "own" while signed out — see useIsOwnNote), and
    // ReactionButton gates itself before calling toggleReaction.
    reply: (parentId, content, visibility) => {
      createNote.mutate({ ranges, content, parentId, visibility }, { onError });
      onNoteAdded?.();
    },
    saveEdit: (noteId, content, visibility) => updateNote.mutate({ noteId, content, visibility }, { onError }),
    delete: (noteId) => deleteNote.mutate(noteId, { onError }),
    toggleReaction: (noteId) => toggleReaction.mutate(noteId, { onError }),
  };

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return { ui, actions, expandedIds, toggleExpanded };
}
