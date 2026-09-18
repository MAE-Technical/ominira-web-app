"use client";

import { useState, type ReactNode } from "react";
import { EllipsisVertical } from "lucide-react";
import type { Note } from "@/lib/api/types";
import { useIsOwnNote } from "@/lib/reader/currentAuthor";
import AuthorRow from "./AuthorRow";
import NoteContent from "./NoteContent";
import ReactionButton from "./ReactionButton";
import ReplyButton from "./ReplyButton";
import NoteComposer from "./NoteComposer";
import Quote from "./Quote";
import EntryMenu from "./EntryMenu";
import ReplyEntry from "./ReplyEntry";
import type { ThreadActions, ThreadUIState } from "@/lib/reader/threadTypes";

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
  quote,
  note,
  replies,
  expanded,
  onToggleExpand,
  ui,
  actions,
}: {
  /** Book-context header (cover/title/author/section + deep link) — home
   * feed only. Omitted wherever the caller already shows book context once
   * above several of these cards. */
  header?: ReactNode;
  /** The highlighted excerpt this note is attached to — home feed only,
   * same reasoning as `header`. */
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

  return (
    <div className="flex flex-col gap-3">
      {header}

      {/* No onJump here — the home feed's own NoteBookHeader above already
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
        <AuthorRow
          name={note.author.pseudonym}
          savedAt={Date.parse(note.updatedAt)}
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
        <div className="ml-1 flex flex-col gap-4 border-l-2 border-[var(--reader-border)] pl-2.5 sm:pl-4">
          {replies.map((reply) => {
            const replyingToName = reply.replyingToId
              ? replies.find((r) => r.id === reply.replyingToId)?.author.pseudonym
              : undefined;
            return <ReplyEntry key={reply.id} reply={reply} replyingToName={replyingToName} ui={ui} actions={actions} />;
          })}

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
