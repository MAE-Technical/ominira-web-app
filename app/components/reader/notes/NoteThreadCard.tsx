"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, EllipsisVertical } from "lucide-react";
import type { Note } from "@/lib/api/types";
import { useIsOwnNote } from "@/lib/reader/currentAuthor";
import AuthorRow from "./AuthorRow";
import Citation from "./Citation";
import NoteContent from "./NoteContent";
import ReactionButton from "./ReactionButton";
import ReplyButton from "./ReplyButton";
import NoteComposer from "./NoteComposer";
import Quote from "./Quote";
import EntryMenu from "./EntryMenu";
import ReplyEntry from "./ReplyEntry";
import type { ThreadActions, ThreadUIState } from "@/lib/reader/threadTypes";

// Reply threads default to their first two entries, with the rest behind a
// "Show N more" expander — matches the redesigned Thread View, and keeps a
// long-running thread from dominating the card the moment it's expanded.
const COLLAPSED_REPLY_COUNT = 2;

/** One top-level note ("comment") on a highlighted passage, plus its own
 * flat reply thread — the single source of truth for this whole unit,
 * reused wherever a note+thread appears: the home feed (`header`/`quote`
 * both supplied, since one feed card is one fully self-contained object),
 * the book-wide annotation panel and the single-note deep view (both
 * hoist one quote once above several of these cards, so they omit
 * `header`/`quote` here and pass their own instead).
 *
 * The reply control (`ReplyButton`) is the one thing that toggles
 * `expanded`, mirroring how the reaction pill is a single icon+count
 * control rather than two. Once expanded, there is exactly one composer
 * for the whole thread (not one per reply) — replying to a specific reply
 * just retargets that same composer (`ui.activeComposerFor`) rather than
 * mounting a second instance; see the composer block below. */
export default function NoteThreadCard({
  header,
  citation,
  quote,
  note,
  replies,
  expanded,
  onToggleExpand,
  ui,
  actions,
}: {
  /** Book-context header (cover/title/author/section + deep link), with no
   * quote of its own — home feed only, and only for a general note (no
   * highlighted range): just the book metadata, deliberately with no
   * citation/quote card at all. Mutually exclusive with `citation` below;
   * a caller passes at most one of the two. */
  header?: ReactNode;
  /** Book-context citation (cover + title/author + the quoted passage, one
   * flat tinted unit with a deep link) — home feed only, for a note that
   * *is* anchored to a highlighted range. Omitted wherever the caller
   * already shows book context once above several of these cards, and for
   * a general note (see `header`). */
  citation?: { href: string; coverSrc: string | null; title: string; author: string; quote: string };
  /** The highlighted excerpt this note is attached to, with no book cover
   * — the book-wide annotation panel and single-note view, both already on
   * that book's own page. Same reasoning as `citation` but without the
   * per-card cover/title/author that would just repeat the page it's on. */
  quote?: string;
  note: Note;
  /** This note's own replies, already chronological. */
  replies: Note[];
  expanded: boolean;
  onToggleExpand: () => void;
  ui: ThreadUIState;
  actions: ThreadActions;
}) {
  const own = useIsOwnNote(note);
  const isEditing = ui.editingId === note.id;
  const isMenuOpen = ui.activeMenuFor === note.id;
  // A thread can be expanded by surrounding UI without the reader asking to
  // compose. Track the root Reply control itself so a signed-out prompt is
  // only shown after that deliberate action.
  const [hasRequestedRootReply, setHasRequestedRootReply] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const visibleReplies = showAllReplies ? replies : replies.slice(0, COLLAPSED_REPLY_COUNT);
  const hiddenReplyCount = Math.max(0, replies.length - visibleReplies.length);

  return (
    <div className="flex flex-col gap-3">
      <AuthorRow
        name={note.author.pseudonym}
        savedAt={Date.parse(note.updatedAt)}
        city={note.author.city}
        topicName={note.topicName}
        isPrivate={own && note.visibility === "private"}
        menu={
          own ? (
            <div className="relative ml-auto flex-none">
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
      {header}
      {citation && <Citation {...citation} />}

      {/* No onJump here — the home feed's own header/citation above already
          carries book/section context, and there's nowhere local for
          "show in passage" to jump to from this card. Still gets the same
          universal preview/"See more" every other Quote does. */}
      {quote && <Quote text={quote} />}

      {/* min-w-0: this is a flex item of the outer `flex flex-col` above —
          without it, a long unbroken run inside NoteContent (a URL) sets
          this column's own automatic minimum width to that run's full
          length, overflowing the panel instead of letting NoteContent's own
          wrap utilities actually engage. */}
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
          <ReplyButton
            count={replies.length}
            expanded={expanded}
            onToggle={() => {
              if (!expanded) setHasRequestedRootReply(true);
              onToggleExpand();
            }}
          />
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col">
          {visibleReplies.map((reply) => {
            const replyingToName = reply.replyingToId
              ? replies.find((r) => r.id === reply.replyingToId)?.author.pseudonym
              : undefined;
            return (
              <ReplyEntry
                key={reply.id}
                reply={reply}
                replyingToName={replyingToName}
                depth={replyingToName ? 2 : 1}
                ui={ui}
                actions={actions}
              />
            );
          })}

          {hiddenReplyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllReplies(true)}
              className="flex items-center gap-1.5 py-2 pl-8 text-xs font-semibold text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
            >
              <ChevronRight size={14} />
              Show {hiddenReplyCount} more {hiddenReplyCount === 1 ? "reply" : "replies"}
            </button>
          )}

          {/* One composer for the whole thread, not one per reply — a
              reply's own "Reply" trigger just retargets it
              (ui.activeComposerFor), it never mounts a second instance.
              `null` means "targeting the root note itself", which is also
              where an outside click sends it back to (see onCancel below)
              rather than dismissing it outright. Hidden entirely once some
              *other* top-level note's thread has claimed the target (this
              `ui` is shared across every top-level note under the same
              highlight) — the always-shown root pill only appears in
              whichever thread the target actually belongs to. */}
          {ui.editingId === null &&
            (ui.activeComposerFor === null ||
              ui.activeComposerFor === note.id ||
              replies.some((r) => r.id === ui.activeComposerFor)) && (
              <NoteComposer
                key={ui.activeComposerFor ?? note.id}
                initialText=""
                placeholder={
                  ui.activeComposerFor
                    ? `Reply to ${replies.find((r) => r.id === ui.activeComposerFor)?.author.pseudonym}…`
                    : "Add a reply"
                }
                startCollapsed
                showMemberPrompt={hasRequestedRootReply || ui.activeComposerFor !== null}
                action="reply"
                onCancel={ui.activeComposerFor ? () => ui.toggleComposer(ui.activeComposerFor!) : undefined}
                onSave={(content, visibility) => actions.reply(ui.activeComposerFor ?? note.id, content, visibility)}
              />
            )}
        </div>
      )}
    </div>
  );
}
