"use client";

import type { Note } from "@/lib/api/types";
import { useThreadInteraction } from "@/lib/reader/useThreadInteraction";
import NoteThreadCard from "./NoteThreadCard";
import NoteBookContext from "./NoteBookContext";

/** One note + its own flat reply thread, wherever a self-contained card is
 * needed outside the in-reader panels (which render `NoteThreadCard`
 * directly, several sharing one hoisted quote — see that component's own
 * doc comment): the home feed, the profile page's public-notes list, and
 * the book-details page's community-notes tab. Replaces the old separate
 * CommunityNoteCard/BookNoteCard files, which differed only in whether book
 * context was shown — here that's just the presence of `bookContext`.
 *
 * One flat row everywhere, mobile and desktop alike — no boxed/masonry
 * treatment at any breakpoint. That used to differ by caller (a plain
 * `border-b` row here, a bordered card in a 2-column CSS-columns masonry
 * there), but any card whose height can change after mount — this card's
 * own inline reply composer opening, a note's "See more" toggling — forced
 * CSS multi-column to rebalance and visibly reflow every other card on the
 * page. A single column, same shape at every width, has no balancing step
 * left to do that in. */
export default function NoteCard({
  materialId,
  note,
  replies,
  excerpt,
  bookContext,
}: {
  materialId: string;
  note: Note;
  replies: Note[];
  excerpt?: string;
  /** Book metadata (+ the excerpt stacked beneath it, via NoteBookContext)
   * — home feed and profile page only. Omitted for the book-details tab,
   * which is already scoped to this one book. */
  bookContext?: { href: string; title: string; section?: string; coverUrl?: string | null };
}) {
  const { ui, actions, expandedIds, toggleExpanded } = useThreadInteraction({
    materialId,
    ranges: note.ranges,
    allNotes: [note, ...replies],
  });
  const expanded = expandedIds.has(note.id);

  return (
    <div className="border-b border-[var(--reader-border)] py-4">
      <NoteThreadCard
        {...(bookContext ? { header: <NoteBookContext {...bookContext} excerpt={excerpt} /> } : { quote: excerpt })}
        note={note}
        replies={replies}
        expanded={expanded}
        onToggleExpand={() => toggleExpanded(note.id)}
        ui={ui}
        actions={actions}
      />
    </div>
  );
}
