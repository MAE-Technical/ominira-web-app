"use client";

import { MessageCircle } from "lucide-react";

/** The reply count + reply trigger, labelled "reply/replies" — a reply is
 * still stored as a note under the hood, but the count and the composer
 * that adds one should read as what a reader actually did: replied to the
 * note, not authored a second independent one. Same bordered-pill shape as
 * ReactionButton (icon + text inside one control), but deliberately
 * neutral: no brand color, no filled icon background when expanded, even
 * on click — reply is a plain control, not a "reacted" state, so it only
 * ever shifts to a neutral surface tint. Unlike the reaction pill, a zero
 * count reads as "0 replies" nowhere here — with nothing to count yet,
 * this is just an invitation to reply, so it collapses to the bare word
 * "Reply" instead.
 *
 * One control, two effects on click (see NoteThreadCard): it guarantees
 * the existing thread is visible (a no-op in the standard case, since
 * every thread starts expanded — see useThreadInteraction) and it's the
 * note's own deliberate "reply to this" trigger, opening the inline
 * composer right underneath it. No separate "Reply" link sits beside it. */
export default function ReplyButton({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      // Marks this as a composer trigger, not an "outside click" —
      // NoteComposer's own outside-click dismissal explicitly exempts any
      // `[data-note-reply-trigger]` element (same marker ReplyEntry's own
      // reply button carries) so a second click on this same pill, while
      // its composer is open, goes through `onToggle`'s own close instead
      // of racing the composer's dismissal (which would close it on
      // mousedown, then this button's own click handler reopens it a beat
      // later — always ending up open no matter how many times it's
      // clicked).
      data-note-reply-trigger
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
        expanded
          ? "border-[var(--reader-border)] bg-[var(--reader-surface-hover)] text-[var(--reader-text)]"
          : "border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)]"
      }`}
    >
      <MessageCircle size={13} />
      {count === 0 ? "Reply" : `${count} ${count === 1 ? "reply" : "replies"}`}
    </button>
  );
}
