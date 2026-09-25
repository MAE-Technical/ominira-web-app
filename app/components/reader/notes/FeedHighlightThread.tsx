"use client";

import { useCreateNote } from "@/lib/community/useNoteMutations";
import { quoteForRanges } from "@/lib/reader/annotationSelection";
import { topLevelNotes, repliesFor, sortNotes } from "@/lib/reader/noteThread";
import { useThreadInteraction } from "@/lib/reader/useThreadInteraction";
import type { FeedEntry } from "@/lib/reader/annotationFeed";
import HighlightCard from "./HighlightCard";
import NoteThreadCard from "./NoteThreadCard";
import NoteComposer from "./NoteComposer";

/** One highlight's full block in the book-wide feed — a truncated quote
 * (HighlightCard's own universal "See more") that's itself the "show in passage"
 * click target (`onJump`), followed by the exact same interactive thread
 * the standalone note panel renders for this highlight — full
 * reply/edit/delete/react, not a read-only summary, via the same
 * useThreadInteraction hook that panel uses. Which section this excerpt
 * belongs to is the enclosing feed's own label's job (see
 * BookAnnotationFeedPanel), not repeated per card. Every root note's own
 * replies start expanded, the one standard default useThreadInteraction
 * applies everywhere a thread is surfaced. */
export default function FeedHighlightThread({
  materialId,
  entry,
  getPassageText,
  onJump,
  targetThreadId,
}: {
  materialId: string;
  entry: FeedEntry;
  getPassageText: (passageId: string) => string;
  onJump: (entry: FeedEntry) => void;
  targetThreadId?: string;
}) {
  const createNote = useCreateNote(materialId);
  const { annotation } = entry;
  const excerpt = quoteForRanges(annotation.ranges, getPassageText);
  const { ui, actions, expandedIds, toggleExpanded } = useThreadInteraction({
    materialId,
    ranges: annotation.ranges,
    allNotes: annotation.notes,
    // A reply added from here can be added to a highlight the reader isn't
    // actually looking at right now (they're browsing the feed, not
    // necessarily at this passage) — same "always land where the note
    // actually is" reasoning as the bottom composer's own onSave below.
    onNoteAdded: () => onJump(entry),
  });
  const roots = sortNotes(topLevelNotes(annotation.notes), "chronological");

  return (
    <div className="flex flex-col gap-3 border-l-2 border-[var(--reader-border)] pl-4">
      <HighlightCard text={excerpt} onJump={() => onJump(entry)} />

      {roots.length > 0 && (
        <div className="flex flex-col gap-4">
          {roots.map((note) => (
            <NoteThreadCard
              key={note.id}
              note={note}
              replies={repliesFor(annotation.notes, note.id)}
              expanded={expandedIds.has(note.id)}
              initialShowAll={targetThreadId === note.id}
              onToggleExpand={() => toggleExpanded(note.id)}
              ui={ui}
              actions={actions}
            />
          ))}
        </div>
      )}

      {/* Same single-composer-active-at-a-time rule as the standalone note
          panel's own root composer (see NotesSidebar), scoped to this
          highlight's own ui state so a reply/edit open on a sibling
          highlight never hides this one's composer. No composer exists
          anywhere until a reader deliberately asks for one, so checking
          just activeComposerFor/editingId is enough — an expanded thread
          with nothing actively targeted for reply has no composer of its
          own to double up with this one. */}
      {ui.actionError && <p className="m-0 text-[11px] text-[var(--reader-text-muted)]">{ui.actionError}</p>}

      {ui.activeComposerFor === null && ui.editingId === null && (
        <NoteComposer
          initialText=""
          placeholder="Add your thoughts"
          startCollapsed
          // No showMemberPrompt here — unlike a deliberate "Reply" tap
          // (NoteThreadCard's own composer), this one sits under every
          // single highlight in the feed with nothing to trigger it, so a
          // signed-out reader would otherwise see the same "Only members
          // can add notes" box repeated under every item on the page. It
          // simply doesn't render for them instead — the footer composer
          // and the top-of-feed auth banner already say that once, which
          // is enough.
          action="note"
          onSave={(content, visibility) => {
            createNote.mutate(
              { ranges: annotation.ranges, content, visibility },
              { onError: () => ui.reportError("Couldn't save your note — check your connection and try again.") }
            );
            // Same reasoning as useThreadInteraction's own onNoteAdded —
            // this composer adds a fresh top-level note to a highlight the
            // reader may be browsing from afar in the feed, not standing at.
            onJump(entry);
          }}
        />
      )}
    </div>
  );
}
