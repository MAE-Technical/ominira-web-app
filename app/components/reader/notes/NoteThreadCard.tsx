"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, EllipsisVertical } from "lucide-react";
import type { Note } from "@/lib/api/types";
import { useIsOwnNote } from "@/lib/reader/currentAuthor";
import AuthorAvatar from "./AuthorAvatar";
import AuthorRow from "./AuthorRow";
import NoteContent from "./NoteContent";
import ReactionButton from "./ReactionButton";
import ReplyButton from "./ReplyButton";
import NoteComposer from "./NoteComposer";
import HighlightCard from "./HighlightCard";
import EntryMenu from "./EntryMenu";
import ReplyEntry from "./ReplyEntry";
import type { ThreadActions, ThreadUIState } from "@/lib/reader/threadTypes";

// Reply threads default to their first two entries, with the rest behind a
// "Show N more" expander — matches the redesigned Thread View, and keeps a
// long-running thread from dominating the card the moment it's expanded.
const COLLAPSED_REPLY_COUNT = 5;

/** One top-level note ("comment") on a highlighted passage, plus its own
 * flat reply thread — the single source of truth for this whole unit,
 * reused wherever a note+thread appears: the home feed (`header`/`quote`
 * both supplied, since one feed card is one fully self-contained object),
 * the book-wide annotation panel and the single-note deep view (both
 * hoist one quote once above several of these cards, so they omit
 * `header`/`quote` here and pass their own instead).
 *
 * `ReplyButton` (the "N replies" pill) is the root note's one deliberate
 * "I want to reply" trigger — same role each reply's own inline "Reply"
 * button plays for it (see ReplyEntry). No composer exists until a reader
 * clicks one of those, and it then mounts inline right under whichever
 * entry — root or a specific reply — was clicked (`ui.activeComposerFor`
 * tracks that one target; see threadTypes' own doc comment). Exactly one
 * composer is ever active across the whole thread, so targeting a new
 * entry implicitly closes whichever one was open. */
export default function NoteThreadCard({
  header,
  quote,
  note,
  replies,
  expanded,
  initialShowAll,
  onToggleExpand,
  ui,
  actions,
}: {
  /** Book context — home feed only. Either `NoteBookContext` (cover/title/
   * author, plus the excerpt stacked beneath it when this note is anchored
   * to a highlighted range) or, for the book-details tab and every in-
   * reader panel, omitted entirely since those are already scoped to one
   * book. Mutually exclusive with `quote` below. */
  header?: ReactNode;
  /** The highlighted excerpt this note is attached to, with no book cover
   * — the book-wide annotation panel and single-note view, both already on
   * that book's own page. Same reasoning as `citation` but without the
   * per-card cover/title/author that would just repeat the page it's on. */
  quote?: string;
  note: Note;
  /** This note's own replies, already chronological. */
  replies: Note[];
  expanded: boolean;
  /** When deep-linked from a notification, show all replies immediately
   * instead of collapsed to 2. */
  initialShowAll?: boolean;
  onToggleExpand: () => void;
  ui: ThreadUIState;
  actions: ThreadActions;
}) {
  const own = useIsOwnNote(note);
  const isEditing = ui.editingId === note.id;
  const isMenuOpen = ui.activeMenuFor === note.id;
  const isReplyingToRoot = ui.activeComposerFor === note.id && ui.editingId === null;
  const [showAllReplies, setShowAllReplies] = useState(initialShowAll ?? false);
  const visibleReplies = showAllReplies ? replies : replies.slice(0, COLLAPSED_REPLY_COUNT);
  const hiddenReplyCount = Math.max(0, replies.length - visibleReplies.length);

  return (
    <div className="flex flex-col gap-3">
      {/* Substack-style layout: the avatar sits beside just the name/time
          row (`items-center` here pairs their vertical centers — the row
          below stretches to the height of the taller multi-line content
          next to it, so aligning against that whole block instead would
          leave the avatar pinned to its top edge rather than centered on
          the name it belongs to). Everything else (header/quote, body,
          reactions) is indented to start under the name text, not the
          avatar, in its own block below. Replies further down stay full-
          width — they already carry their own hierarchy cue (the vertical
          thread line + indent in ReplyEntry), rather than nesting under
          this note's own avatar indent too. */}
      <div className="flex min-w-0 items-center gap-2.5">
        <AuthorAvatar name={note.author.pseudonym} />
        <div className="min-w-0 flex-1">
          <AuthorRow
            name={note.author.pseudonym}
            savedAt={Date.parse(note.updatedAt)}
            city={note.author.city}
            topicName={note.topicName}
            isPrivate={own && note.visibility === "private"}
            menu={
              own ? (
                // self-center: this row (AuthorRow) aligns its own children
                // by text baseline, which a plain icon button never
                // establishes cleanly — left to `items-baseline`, the
                // button could inflate the row taller than the avatar
                // beside it, throwing off AuthorAvatar's own centering
                // against this row. self-center opts this one non-text
                // child out of that baseline calculation.
                <div className="relative ml-auto flex-none self-center">
                  <button
                    onClick={() => ui.toggleMenu(isMenuOpen ? null : note.id)}
                    className="flex items-center bg-transparent border-none cursor-pointer text-[var(--reader-text-muted)] p-0.5"
                  >
                    <EllipsisVertical size={15} />
                  </button>
                  {isMenuOpen && (
                    <EntryMenu
                      isOwn={own}
                      isTextEntry={note.content.kind === "text"}
                      onEdit={() => {
                        ui.startEdit(note.id);
                        ui.toggleMenu(null);
                      }}
                      onDelete={() => {
                        actions.delete(note.id);
                        ui.toggleMenu(null);
                      }}
                      onClose={() => ui.toggleMenu(null)}
                    />
                  )}
                </div>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* pl-[30px]: avatar width (20px, h-5/w-5) + the row's own gap-2.5
          (10px) above — lines this column up under the name text rather
          than the avatar. */}
      <div className="flex min-w-0 flex-col gap-3 pl-[30px]">
        {header}

        {/* No onJump here — the home feed's own header above already
            carries book/section context, and there's nowhere local for
            "show in passage" to jump to from this card. Still gets the
            same universal preview/"See more" every other HighlightCard
            does. */}
        {quote && <HighlightCard text={quote} />}

        {/* min-w-0: this is a flex item of the outer `flex flex-col`
            above — without it, a long unbroken run inside NoteContent (a
            URL) sets this column's own automatic minimum width to that
            run's full length, overflowing the panel instead of letting
            NoteContent's own wrap utilities actually engage. */}
        <div className="flex min-w-0 flex-col gap-2">
          {isEditing ? (
            <NoteComposer
              initialText={note.content.kind === "text" ? note.content.text : ""}
              initialVisibility={note.visibility}
              startCollapsed={false}
              onCancel={() => ui.startEdit(null)}
              onSave={(content, visibility) => {
                actions.saveEdit(note.id, content, visibility);
                ui.startEdit(null);
              }}
            />
          ) : (
            <NoteContent content={note.content} />
          )}
          <div className="flex items-center gap-3.5">
            <ReactionButton count={note.reactionCount} reacted={note.reactedByMe} onToggle={() => actions.toggleReaction(note.id)} />
            {/* One control, not two: existing replies are already shown by
                default wherever this card appears (useThreadInteraction
                seeds every root expanded), so there's nothing left for a
                separate disclosure click to do in practice — this pill is
                the deliberate "I want to reply" trigger for the root note
                itself, same role each reply's own inline "Reply" button
                plays for it (see ReplyEntry). `onToggleExpand` is a no-op
                in the now-common case (already expanded); it only matters
                if some future caller ever seeds a thread collapsed. */}
            <ReplyButton
              count={replies.length}
              expanded={expanded || isReplyingToRoot}
              onToggle={() => {
                if (!expanded) onToggleExpand();
                ui.toggleComposer(note.id);
              }}
            />
          </div>

          {/* Mounts right here, under the root note's own action row — not
              in some shared slot down past every reply — so it's obvious
              this composer targets the root note itself. */}
          {isReplyingToRoot && (
            <NoteComposer
              initialText=""
              placeholder={`Reply to ${note.author.pseudonym}…`}
              startCollapsed={false}
              showMemberPrompt
              action="reply"
              onCancel={() => ui.toggleComposer(note.id)}
              onSave={(content, visibility) => actions.reply(note.id, content, visibility)}
            />
          )}
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col">
          {visibleReplies.map((reply) => {
            const replyingToName = reply.replyingToId
              ? replies.find((r) => r.id === reply.replyingToId)?.author.pseudonym
              : undefined;
            const depth = replyingToName ? 2 : 1;
            const isReplyingToThis = ui.activeComposerFor === reply.id && ui.editingId === null;
            return (
              <div key={reply.id}>
                {/* A divider before every depth-1 reply (including the
                    first, separating the whole reply list from the root's
                    own reaction/reply row above it) — each top-level reply
                    starts its own sub-thread, so it gets its own divider. A
                    depth-2 reply (nested under the one right before it)
                    doesn't: it's part of that same sub-thread, already read
                    as such via its "replying to" tag and the connecting
                    thread-line in ReplyEntry, not a new one of its own. Its
                    own element (not just a border-top on this wrapper) with
                    py-2 rather than a bottom margin, so there's breathing
                    room on both sides of the line — above it, off whatever
                    came before, and below it, off the reply that follows. */}
                {depth === 1 && <div className="border-t border-[var(--reader-border)] my-2" />}
                <ReplyEntry reply={reply} replyingToName={replyingToName} depth={depth} ui={ui} actions={actions} />
                {/* Same "mounts right under its own target" rule as the
                    root composer above — indented to this reply's own
                    depth so it visually hangs off the entry it addresses,
                    never a fixed slot shared by every other reply. */}
                {isReplyingToThis && (
                  <div className={depth === 2 ? "pl-10" : "pl-8"}>
                    <NoteComposer
                      initialText=""
                      placeholder={`Reply to ${reply.author.pseudonym}…`}
                      startCollapsed={false}
                      showMemberPrompt
                      action="reply"
                      onCancel={() => ui.toggleComposer(reply.id)}
                      onSave={(content, visibility) => actions.reply(reply.id, content, visibility)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {hiddenReplyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllReplies(true)}
              className="flex items-center gap-1.5 py-2 pl-5 text-xs font-semibold text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
            >
              <ChevronRight size={14} />
              Show {hiddenReplyCount} more {hiddenReplyCount === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
