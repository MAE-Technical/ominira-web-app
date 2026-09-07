"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedEntry, FeedSectionGroup } from "@/lib/reader/annotationFeed";
import type { AnnotationFeedFilter } from "@/lib/reader/useBookAnnotationFeed";
import { useCreateNote } from "@/lib/community/useNoteMutations";
import type { Note } from "@/lib/api/types";
import UnderlineTabs from "../../UnderlineTabs";
import PanelShell from "./PanelShell";
import FeedHighlightThread from "./FeedHighlightThread";
import GeneralNoteThread from "./GeneralNoteThread";
import NoteComposer from "./NoteComposer";

// Same two-tab split as book details' own Table of contents/Community notes
// switch (UnderlineTabs), just this panel's own two views — every entry is
// exactly one or the other (see AnnotationFeedFilter's own doc comment), so
// there's no third "All" to combine them back into. Labeled just "Notes",
// not "Public notes" — this tab's own data (GET /api/materials/{id}/notes)
// already mixes in the reader's own private notes/replies alongside public
// ones (visibleToFilter: public OR mine), so "Public" was never quite
// accurate here; each private entry marks itself instead (see AuthorRow's
// own "Only you" chip).
const FILTER_OPTIONS: { value: AnnotationFeedFilter; label: string }[] = [
  { value: "notes", label: "Notes" },
  { value: "highlights", label: "Your highlights" },
];

/** A stable DOM id per section group, not a ref — looked up via
 * `document.getElementById` in an effect to position the panel on open,
 * same reasoning as the note panel's own composer-focus effects: this
 * project's stricter ref-access lint rule rejects a ref callback produced
 * inside a `.map()`, unlike a single non-looped element. */
function sectionGroupElementId(sectionId: string): string {
  return `feed-section-${sectionId}`;
}

/** The book-wide annotation feed — every section carrying a mark of any
 * kind, each entry showing its quote plus its full, real interactive
 * thread (see FeedHighlightThread) — a bare highlight renders as just the
 * quote and a collapsed "add a note" composer, same component either way.
 * Opening the panel scrolls once to wherever the reader currently is in
 * the book; browsing the feed itself never re-scrolls on its own. */
export default function BookAnnotationFeedPanel({
  materialId,
  groups,
  generalNotes,
  notes,
  filter,
  onFilterChange,
  totalNoteCount,
  passageCount,
  activeSectionId,
  onJump,
  getPassageText,
  panelType,
  onClose,
}: {
  materialId: string;
  groups: FeedSectionGroup[];
  /** Book-level notes — no ranges, so they sit outside the section-grouped
   * `groups` entirely (see useBookAnnotationFeed's own doc comment).
   * Already empty whenever `filter` isn't "notes". */
  generalNotes: Note[];
  /** The material's whole flat note list — GeneralNoteThread's own source
   * for each general note's replies (see its doc comment); nothing else
   * here needs it. */
  notes: Note[];
  filter: AnnotationFeedFilter;
  onFilterChange: (filter: AnnotationFeedFilter) => void;
  totalNoteCount: number;
  passageCount: number;
  activeSectionId: string;
  onJump: (entry: FeedEntry) => void;
  getPassageText: (passageId: string) => string;
  panelType?: "side" | "sheet";
  onClose: () => void;
}) {
  const createNote = useCreateNote(materialId);
  const [generalComposerError, setGeneralComposerError] = useState<string | null>(null);
  // Fires once per "the panel just opened" — this component only mounts
  // while open (see Reader.tsx's `{noteFeed.open && <BookAnnotationFeedPanel/>}`),
  // so a plain mount-effect is exactly "once per open," no extra ref guard needed.
  const hasPositionedRef = useRef(false);
  useEffect(() => {
    if (hasPositionedRef.current) return;
    hasPositionedRef.current = true;
    requestAnimationFrame(() => {
      document.getElementById(sectionGroupElementId(activeSectionId))?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once-on-mount, not on every activeSectionId change (see doc comment above).
  }, []);

  return (
    <PanelShell
      panelType={panelType}
      onClose={onClose}
      footer={
        // Bottom-docked and independent of `filter` — a general, book-level
        // thought isn't specific to a passage or a selection, so it stays
        // reachable the same way regardless of which tab the reader's
        // browsing (highlights included), the same way a chat app's own
        // message input never disappears depending on which channel view
        // you're scrolled through. Distinct from `generalNotes` below,
        // which — like the rest of this panel's own content — is still
        // "notes"-tab only.
        <div className="flex flex-col gap-2">
          <NoteComposer
            initialText=""
            placeholder="Add a note"
            startCollapsed
            showMemberPrompt
            action="note"
            onSave={(content, visibility) => {
              setGeneralComposerError(null);
              createNote.mutate(
                { ranges: [], content, visibility },
                { onError: () => setGeneralComposerError("Couldn't save your note — check your connection and try again.") }
              );
            }}
          />
          {generalComposerError && (
            <p className="m-0 text-[11px] text-[var(--reader-text-muted)]">{generalComposerError}</p>
          )}
        </div>
      }
      title={
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* <span className="truncate font-serif font-semibold text-base text-[var(--reader-text)]">
            Notes & highlights
          </span> */}
          <span className="text-xs font-medium text-[var(--reader-text-muted)]">
            {totalNoteCount} {totalNoteCount === 1 ? "note" : "notes"}
            {passageCount > 0 && ` · ${passageCount} ${passageCount === 1 ? "highlight" : "highlights"}`}
          </span>
        </div>
      }
      subheader={
        // No bottom padding here — UnderlineTabs' own buttons already carry
        // their usual pb-3 before their (inactive: transparent, active:
        // colored) border-b, `-mb-px` pulling that border up to sit right
        // on top of PanelShell's own subheader divider directly below, the
        // same "shared baseline, active tab's own border overlays it" trick
        // book details' identical tab bar uses via its own container border
        // instead (PanelShell already supplies one here).
        <div className="px-5">
          <UnderlineTabs options={FILTER_OPTIONS} selected={filter} onSelect={onFilterChange} />
        </div>
      }
    >
      {generalNotes.length > 0 && (
        <div className="mb-6">
          {/* Same sticky section-header treatment as a section group below
              (see the group header inside the groups.map further down) —
              visually its own distinct bucket, not a passage, so a reader
              scrolling past can immediately tell these aren't anchored to
              anything they'd need to "jump to." */}
          <div className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 border-b border-[var(--reader-border)] bg-[var(--reader-surface)] px-5 py-2.5">
            <span className="truncate text-[11px] font-bold uppercase tracking-wide text-[var(--reader-text-muted)]">
              General
            </span>
            <span className="flex-none text-[11px] font-bold text-[var(--reader-text-subtle)]">
              {generalNotes.length}
            </span>
          </div>
          <div className="flex flex-col gap-4 pt-5">
            {generalNotes.map((note) => (
              <GeneralNoteThread key={note.id} materialId={materialId} note={note} allNotes={notes} />
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        generalNotes.length === 0 && (
          <p className="mt-4 py-1 font-serif text-sm text-[var(--reader-text-muted)]">
            {filter === "notes"
              ? "No notes in this book yet — be the first to say something."
              : "You have no private highlights in this book"}
          </p>
        )
      ) : (
        <div className="flex flex-col">
          {groups.map((group, i) => (
            <div key={group.sectionId} id={sectionGroupElementId(group.sectionId)} className={i === 0 ? undefined : "mt-6"}>
              {/* Sticky, feed-style group header (Contacts/Mail-style A-Z
                  dividers, Discourse's own date rail) rather than the old
                  symmetric hairline-flanked label, which read as a document
                  outline divider, not a feed. Pinned to the top of the
                  panel's own scroll container while its entries scroll past
                  underneath — the -mx-5/px-5 pair cancels that container's
                  own side padding so the sticky bar's background still
                  bleeds edge to edge instead of leaving the padding gutter
                  see-through. */}
              <div className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 border-b border-[var(--reader-border)] bg-[var(--reader-surface)] px-5 py-2.5">
                <span className="truncate text-[11px] font-bold uppercase tracking-wide text-[var(--reader-text-muted)]">
                  {group.label}
                </span>
                <span className="flex-none text-[11px] font-bold text-[var(--reader-text-subtle)]">
                  {group.entries.length}
                </span>
              </div>
              <div className="flex flex-col gap-5 pt-5">
                {group.entries.map((entry) => (
                  <FeedHighlightThread
                    key={entry.annotation.id}
                    materialId={materialId}
                    entry={entry}
                    getPassageText={getPassageText}
                    onJump={onJump}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
