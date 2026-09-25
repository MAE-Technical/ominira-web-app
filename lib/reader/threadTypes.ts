import type { NoteContent, NoteVisibility } from "@/lib/api/types";

/** Cross-entry UI state one thread shares — which single menu/edit is
 * active at a time, and which single entry the thread's one shared
 * composer currently targets, produced by useThreadInteraction and
 * threaded down to whichever NoteThreadCard/ReplyEntry it concerns.
 *
 * `activeComposerFor: null` means no composer is showing anywhere in this
 * thread — there is no default/always-on composer. It only ever becomes
 * non-null when a reader deliberately clicks a "Reply" trigger on a
 * specific entry (the root note or one of its replies, `id` either way),
 * and the composer then mounts right there, inline under that entry — not
 * in one fixed slot shared by every target. Clicking that same entry's
 * trigger again (or an outside click — see NoteComposer's own onCancel
 * handling) resets this back to `null`, unmounting it. */
export type ThreadUIState = {
  activeComposerFor: string | null;
  toggleComposer: (id: string) => void;
  activeMenuFor: string | null;
  toggleMenu: (id: string | null) => void;
  editingId: string | null;
  startEdit: (id: string | null) => void;
  /** A brief message for a failed optimistic write anywhere in this thread
   * (create/edit/delete/react) — self-clears after a few seconds (see
   * useThreadInteraction). `reportError` lets a composer that calls its own
   * mutation directly (the root "new note" composer, which doesn't go
   * through `actions.reply`) report a failure the same way. */
  actionError: string | null;
  reportError: (message: string) => void;
};

/** The store-backed mutations a note/reply card can trigger, bundled so
 * each card takes one prop instead of four. `reply`'s `parentId` is
 * whichever entry's own Reply button was tapped (root note or a reply) —
 * the store itself resolves that down to the two-tier-flat shape. */
export type ThreadActions = {
  reply: (parentId: string, content: NoteContent, visibility: NoteVisibility) => void;
  saveEdit: (noteId: string, content: NoteContent, visibility: NoteVisibility) => void;
  delete: (noteId: string) => void;
  toggleReaction: (noteId: string) => void;
};
