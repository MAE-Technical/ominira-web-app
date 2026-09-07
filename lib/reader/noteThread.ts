import type { Note } from "@/lib/api/types";

/** The thread's top-level notes — everything replying directly to the
 * highlighted passage itself, not to another note. */
export function topLevelNotes(allNotes: Note[]): Note[] {
  return allNotes.filter((n) => !n.parentId);
}

/** One top-level note's own flat reply list, oldest first — the thread
 * stays two-tier flat (see Note.parentId), so this is every reply that
 * note has, never a further level of nesting. */
export function repliesFor(allNotes: Note[], noteId: string): Note[] {
  return allNotes.filter((n) => n.parentId === noteId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** A thread's own "last activity" (ms epoch) — the max `updatedAt` across
 * its root note and every one of its replies. Distinct from the root
 * note's own `updatedAt` (which AuthorRow already shows per-entry): this is
 * what makes a section/bucket in the book-wide feed feel like a forum
 * rather than an archive — a thread that just got a new reply should read
 * as more "alive" than one nobody's touched in weeks, regardless of which
 * one was *started* first. */
export function lastActivityAt(note: Note, replies: Note[]): number {
  return replies.reduce((max, r) => Math.max(max, Date.parse(r.updatedAt)), Date.parse(note.updatedAt));
}

export type NoteSortMode = "top" | "chronological";

/** Sorts a list of top-level notes for display — "top" ranks by
 * `reactionCount` (ties keep insertion order, via a stable sort),
 * "chronological" is oldest-first, reading like a conversation transcript
 * from its start. `createdAt` (not `updatedAt`) drives chronological order
 * — editing a note shouldn't reshuffle where it sits in the thread. Reply
 * lists are never independently sortable (see repliesFor) — the two-tier
 * cap keeps any one list short enough that it doesn't need to be. */
export function sortNotes(notes: Note[], mode: NoteSortMode): Note[] {
  if (mode === "chronological") return [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...notes].sort((a, b) => b.reactionCount - a.reactionCount);
}
