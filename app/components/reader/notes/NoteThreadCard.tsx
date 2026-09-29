"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, EllipsisVertical } from "lucide-react";
import type { Note } from "@/lib/api/types";
import { useIsOwnNote } from "@/lib/reader/currentAuthor";
import AuthorAvatar from "./AuthorAvatar";
import AuthorRow from "./AuthorRow";
import NoteContent from "./NoteContent";
import ReactionButton from "./ReactionButton";
import ReplyButton from "./ReplyButton";
import BookmarkButton from "@/app/components/shared/BookmarkButton";
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
  focusReplyId,
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
  /** The one reply a deep link came for (a reply notification names the
   * reply, not the thread): it's scrolled into view and washed once on
   * mount, and the thread opens uncollapsed so it can't be hiding behind
   * "Show N more". */
  focusReplyId?: string;
  onToggleExpand: () => void;
  ui: ThreadUIState;
  actions: ThreadActions;
}) {
  const own = useIsOwnNote(note);
  const isEditing = ui.editingId === note.id;
  const isMenuOpen = ui.activeMenuFor === note.id;
  const isReplyingToRoot = ui.activeComposerFor === note.id && ui.editingId === null;
  const [showAllReplies, setShowAllReplies] = useState(initialShowAll ?? Boolean(focusReplyId));
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // "center", not the default "start": a reply landing flush against the
    // top of the viewport reads as the beginning of the thread rather than
    // as one entry inside it.
    if (focusReplyId) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusReplyId]);
  const visibleReplies = showAllReplies ? replies : replies.slice(0, COLLAPSED_REPLY_COUNT);
  const hiddenReplyCount = Math.max(0, replies.length - visibleReplies.length);

  return (
    <div className="flex flex-col gap-3">
      {/* The avatar sits beside just the name/time row (`items-center` here
          pairs their vertical centers — the row below stretches to the
          height of the taller multi-line content next to it, so aligning
          against that whole block instead would leave the avatar pinned to
          its top edge rather than centered on the name it belongs to).
          Everything else (header/quote, body, reactions) runs the full
          width below, not indented under the avatar. */}
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <AuthorAvatar name={note.author.pseudonym} avatar={note.author.avatar} />
        <div className="min-w-0 flex-1">
          <AuthorRow
            name={note.author.pseudonym}
            savedAt={Date.parse(note.createdAt)}
            city={note.author.city}
            topics={note.topics}
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

      {/* Full width, not indented under the avatar — only the identity row
          above sits beside it. */}
      <div className="flex min-w-0 flex-col gap-3">
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
        <div className="flex min-w-0 flex-col">
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
          {/* No gap on the column above: whatever renders before this row —
              body text, a link preview, a book attachment, or nothing at
              all — never carries its own bottom spacing. This row's own
              mt-3 is the single, unconditional source of the space above
              it, so that space is always the same 12px no matter what's
              above. */}
          <div className="mt-4 flex items-center gap-3.5">
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

            {/* ml-auto, not part of the react/reply cluster: those two are
                what a reader does *to* the conversation, this is what they
                do with it for themselves. Pushed to the row's trailing
                edge so it reads as a separate, private act — and it stays
                countless on purpose (see BookmarkButton), which is also
                what keeps it from looking like a third social metric
                sitting next to two real ones.

                Hidden on your own post, same rule 1 BookListRow applies to
                your own uploads: your posts are already collected on your
                profile, so saving one is an offer to do something that's
                already true. Unlike a book row this stays unconditionally
                visible otherwise (rule 3) — a post has no detail page to
                fall back to, so hover-reveal here would leave it
                unsavable on touch entirely. */}
            {!own && (
              <BookmarkButton
                saved={note.bookmarkedByMe}
                onToggle={() => actions.toggleBookmark(note.id)}
                size="small"
                className="ml-auto"
              />
            )}
          </div>

          {/* Mounts right here, under the root note's own action row — not
              in some shared slot down past every reply — so it's obvious
              this composer targets the root note itself. Same explicit
              mt-3 as the reaction row above, for the same reason: this
              column has no gap, so every bit of vertical spacing in it is
              an explicit margin on the element that needs it, never
              implicit from a neighbor. */}
          {isReplyingToRoot && (
            <div className="mt-3">
              <NoteComposer
                initialText=""
                placeholder={`Reply to ${note.author.pseudonym}…`}
                startCollapsed={false}
                showMemberPrompt
                action="reply"
                onCancel={() => ui.toggleComposer(note.id)}
                onSave={(content, visibility) => actions.reply(note.id, content, visibility)}
              />
            </div>
          )}
        </div>
      </div>

      {expanded && (
        // One continuous rail down the left edge of the whole reply list
        // (YouTube's own comment-thread convention) rather than a
        // full-bleed divider or a line redrawn per reply — it's what reads
        // as "these all belong to the note above", with the list's own
        // indent (pl-2, sm:pl-4 — deliberately tight, mobile width is
        // precious) doing the rest. Replies are separated from each other
        // by plain spacing, no border, same as that convention.
        <div className="relative flex flex-col gap-3 pl-2 sm:pl-4">
          <span className="absolute inset-y-0 left-0 w-px bg-[var(--reader-border)]" aria-hidden="true" />
          {visibleReplies.map((reply) => {
            const replyingToName = reply.replyingToId
              ? replies.find((r) => r.id === reply.replyingToId)?.author.pseudonym
              : undefined;
            const depth = replyingToName ? 2 : 1;
            const isReplyingToThis = ui.activeComposerFor === reply.id && ui.editingId === null;
            // Each depth-1 reply starts a fresh little sub-thread of its own
            // (itself plus whichever depth-2 replies address it) — a
            // border-top demarcates where one of those groups ends and the
            // next begins. Applies from the very first entry too, to
            // separate the reply list as a whole from the root note's own
            // reaction/reply row above it. Sized to the reply's own identity
            // row (avatar through the ellipsis menu), not the full card
            // width like NoteCard's own post-to-post border-b.
            const isNewRootReply = depth === 1;
            return (
              <div
                key={reply.id}
                ref={reply.id === focusReplyId ? focusRef : undefined}
                className={`${isNewRootReply ? "pt-3" : ""} ${
                  reply.id === focusReplyId
                    ? "-mx-2 rounded-sm bg-[color-mix(in_srgb,var(--reader-accent)_8%,transparent)] px-2"
                    : ""
                }`}
              >
                {isNewRootReply && <div className="mb-3 border-t border-[var(--reader-border)]" aria-hidden="true" />}
                <ReplyEntry reply={reply} replyingToName={replyingToName} depth={depth} ui={ui} actions={actions} />
                {/* Same "mounts right under its own target" rule as the
                    root composer above — indented to this reply's own
                    depth so it visually hangs off the entry it addresses,
                    never a fixed slot shared by every other reply. mt-3:
                    this composer is a plain sibling of ReplyEntry inside a
                    non-flex wrapper, so it doesn't get the list's own
                    gap-3 between entries — without its own margin it sits
                    flush against the reaction/reply row above it. */}
                {isReplyingToThis && (
                  <div className={`mt-3 ${depth === 2 ? "pl-4 sm:pl-6" : "pl-2 sm:pl-4"}`}>
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
              className="flex items-center gap-1.5 pl-3 text-xs font-semibold text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
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
