"use client";

import type { CommunityFeedItem } from "@/lib/community/useCommunityFeed";
import { useThreadInteraction } from "@/lib/reader/useThreadInteraction";
import NoteThreadCard from "@/app/components/reader/notes/NoteThreadCard";
import NoteBookHeader from "./NoteBookHeader";

/** One card on the home feed — a thin wrapper around NoteThreadCard, the
 * same shared component the reader's own book-wide panel and single-note
 * view use. The home feed is the one context where a card is fully
 * self-contained (own book header, own quote) rather than several cards
 * sharing one hoisted quote/header above them — see NoteThreadCard's own
 * doc comment.
 *
 * `GET /api/community/notes` (the feed itself) ships every visible reply
 * inline per item (lib/community/feed.ts), not just a count — so a card's
 * reaction/note counts and full thread are accurate the moment the feed
 * loads, with no separate per-note fetch and no click-to-reveal step.
 * Threads start expanded (`initialExpandAll`): there's no threshold here,
 * everything the feed returned is shown by default; the reply toggle still
 * lets a reader collapse a long thread back down if they want to. */
export default function CommunityNoteCard({ item }: { item: CommunityFeedItem }) {
  const { ui, actions, expandedIds, toggleExpanded } = useThreadInteraction({
    materialId: item.material.id,
    ranges: item.note.ranges,
    allNotes: [item.note, ...item.replies],
    initialExpandAll: true,
  });
  const expanded = expandedIds.has(item.note.id);

  return (
    <div className="rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] px-3 py-4 sm:p-5">
      <NoteThreadCard
        header={<NoteBookHeader item={item} />}
        quote={item.excerpt}
        note={item.note}
        replies={item.replies}
        expanded={expanded}
        onToggleExpand={() => toggleExpanded(item.note.id)}
        ui={ui}
        actions={actions}
      />
    </div>
  );
}
