"use client";

import { useState } from "react";
import { EllipsisVertical, Share, Trash2 } from "lucide-react";
import type { AnnotationRange } from "@/lib/api/types";
import { sameRanges } from "@/stores/library-store";
import { useSessionStore } from "@/stores/session-store";
import { useAnnotations } from "@/lib/reader/useAnnotations";
import { useDeleteHighlight } from "@/lib/materials/useHighlightMutations";
import { useCreateNote, useDeleteNote } from "@/lib/community/useNoteMutations";
import { quoteForRanges } from "@/lib/reader/annotationSelection";
import { topLevelNotes, repliesFor, sortNotes, type NoteSortMode } from "@/lib/reader/noteThread";
import { useThreadInteraction } from "@/lib/reader/useThreadInteraction";
import NoteThreadCard from "./notes/NoteThreadCard";
import NoteComposer from "./notes/NoteComposer";
import PanelShell from "./notes/PanelShell";
import Quote from "./notes/Quote";
// import SortToggle from "./notes/SortToggle";
import OverflowMenu from "./notes/OverflowMenu";

type Props = {
  materialId: string;
  /** The passage this panel was opened from — one of possibly several the
   * annotation's ranges touch. */
  passageId: string;
  /** Resolves any passage's full plain text by id, so a cross-passage
   * annotation's quote can be assembled from more than one passage. */
  getPassageText: (passageId: string) => string;
  /** An existing annotation (thread) being viewed/added to. */
  annotationId?: string;
  /** A brand-new thread with no annotation yet — one range per passage the
   * just-made selection touched. */
  pendingRanges?: AnnotationRange[];
  /** Deep-links straight into editing one specific existing entry — absent,
   * the panel opens to the thread as normal. */
  editingNoteId?: string;
  /** Every top-level note's replies start expanded rather than collapsed —
   * see useTextAnnotations' onNoteMarkerClick for when this is set. */
  expandAll?: boolean;
  panelType?: "side" | "sheet";
  onClose: () => void;
  /** Opens the share-image modal for this thread's quoted passage — Reader
   * owns the modal itself (it also has to know the book title/author, which
   * this panel never receives), so this just hands back the assembled
   * quote text. */
  onShare: (quote: string) => void;
};

const DANGER_COLOR = "#f26b6b";

function EditPanel({
  materialId,
  passageId,
  getPassageText,
  annotationId,
  pendingRanges,
  editingNoteId,
  expandAll,
  panelType,
  onClose,
  onShare,
}: Props) {
  const { annotationsByPassage } = useAnnotations(materialId);
  const annotations = annotationsByPassage[passageId] ?? [];
  const createNote = useCreateNote(materialId);
  const deleteNote = useDeleteNote(materialId);
  const deleteHighlight = useDeleteHighlight(materialId);
  const readerId = useSessionStore((s) => s.readerId);

  // A brand-new thread has no annotationId yet — after its first note is
  // saved, the server creates one, but this component only has the ranges
  // it asked for, so it re-finds "the annotation it just made" by those
  // same ranges rather than an id it was never given.
  const existing = annotationId
    ? annotations.find((a) => a.id === annotationId)
    : pendingRanges
    ? annotations.find((a) => sameRanges(a.ranges, pendingRanges))
    : undefined;
  const ranges = existing?.ranges ?? pendingRanges ?? [];
  const quoteText = quoteForRanges(ranges, getPassageText);

  // The whole thread, flat — every top-level note and every reply, two
  // tiers only (see Note.parentId). Which top-level notes show their
  // replies expanded is local UI state below, not part of this data.
  const allNotes = existing?.notes ?? [];
  const roots = topLevelNotes(allNotes);

  const [sortMode, setSortMode] = useState<NoteSortMode>("chronological");
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);

  // The header overflow menu's own "Delete highlight" confirmation step —
  // destructive and irreversible, so it never fires straight from the menu
  // item; it just reveals this warning in place of the thread/composer,
  // requiring an explicit second tap to actually go through.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { ui, actions, expandedIds, toggleExpanded } = useThreadInteraction({
    materialId,
    ranges,
    allNotes,
    initialEditingId: editingNoteId,
    initialExpandAll: expandAll,
  });

  const handleDeleteAnnotation = () => {
    if (!existing) return;
    if (existing.highlightId) deleteHighlight.mutate(existing.highlightId);
    // Own root notes only — same reasoning as useTextAnnotations'
    // deleteSelection: a co-located note from another reader is never
    // this action's to remove. Deleting every own top-level note already
    // cascades to its replies server-side (parent_id on delete cascade) —
    // no need to also walk the rest of allNotes here.
    for (const note of roots) {
      if (note.author.readerId === readerId) deleteNote.mutate(note.id);
    }
    onClose();
  };

  const sortedRoots = sortNotes(roots, sortMode);

  return (
    <PanelShell
      panelType={panelType}
      title=""
      onClose={onClose}
      headerMenu={
        existing && !confirmingDelete ? (
          <div className="relative flex-none">
            <button
              onClick={() => setPanelMenuOpen((v) => !v)}
              className="flex items-center justify-center bg-transparent border-none cursor-pointer text-[var(--reader-text-muted)]"
            >
              <EllipsisVertical size={16} />
            </button>
            {panelMenuOpen && (
              <OverflowMenu
                onClose={() => setPanelMenuOpen(false)}
                items={[
                  {
                    label: "Share passage",
                    onClick: () => {
                      setPanelMenuOpen(false);
                      onShare(quoteText);
                    },
                    icon: <Share size={13} />,
                  },
                  {
                    label: "Delete highlight",
                    danger: true,
                    icon: <Trash2 size={13} />,
                    onClick: () => {
                      setPanelMenuOpen(false);
                      setConfirmingDelete(true);
                    },
                  },
                ]}
              />
            )}
          </div>
        ) : undefined
      }
    >
      <Quote text={quoteText} />
      {confirmingDelete ? (
        <div className="flex flex-col gap-3 pb-1">
          <p className="text-sm font-literata leading-relaxed text-[var(--reader-text)] m-0">
            {roots.length > 0
              ? "Delete this highlight and its notes? This can't be undone."
              : "Delete this highlight? This can't be undone."}
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDeleteAnnotation}
              style={{ color: DANGER_COLOR }}
              className="bg-transparent border-none cursor-pointer text-xs font-semibold p-0"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="bg-transparent border-none cursor-pointer text-xs font-semibold text-[var(--reader-text-muted)] p-0"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* {roots.length > 0 && <SortToggle mode={sortMode} onChange={setSortMode} />} */}

          {sortedRoots.length > 0 ? (
            <div className="flex flex-col gap-5">
              {sortedRoots.map((note) => (
                <NoteThreadCard
                  key={note.id}
                  note={note}
                  replies={repliesFor(allNotes, note.id)}
                  expanded={expandedIds.has(note.id)}
                  onToggleExpand={() => toggleExpanded(note.id)}
                  ui={ui}
                  actions={actions}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--reader-text-muted)] text-center py-1 m-0">
              {/* No notes yet */}
            </p>
          )}

          {/* Only one composer is ever on screen at a time — this is the
              same rule already governing which single note/reply gets its
              own inline composer (activeComposerFor) or edit view
              (editingId), just extended to the root composer too. Without
              this, clicking Reply on a note left its own inline composer
              AND this always-present one both visible, with no clear
              signal which one a reader's next tap was actually for.
              Also hidden whenever any thread is expanded — an expanded
              thread already carries its own composer, defaulting to a
              reply on that thread's own root note (see NoteThreadCard),
              so this "start a fresh top-level note" composer would
              otherwise sit right alongside it, two empty compose surfaces
              deep for no reason a reader could tell apart. Collapsing
              every thread is what brings this one back. */}
          {ui.actionError && (
            <p className="m-0 text-[11px] text-[var(--reader-text-muted)]">{ui.actionError}</p>
          )}

          {expandedIds.size === 0 && ui.activeComposerFor === null && ui.editingId === null && (
            <NoteComposer
              initialText=""
              placeholder="Add your thoughts"
              startCollapsed
              showMemberPrompt
              action="note"
              onSave={(content, visibility) =>
                createNote.mutate(
                  { ranges, content, visibility },
                  { onError: () => ui.reportError("Couldn't save your note — check your connection and try again.") }
                )
              }
            />
          )}
        </>
      )}
    </PanelShell>
  );
}

/** Private highlights/notes UI for one annotation — opened from clicking an
 * existing mark's "Add note"/"View thread" action, or from a fresh
 * selection's Note action. */
export default function NotesSidebar(props: Props) {
  return <EditPanel {...props} />;
}
