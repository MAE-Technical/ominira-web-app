"use client";

import { useState } from "react";
import QuoteCard from "./QuoteCard";

// One standard preview length everywhere a quote appears (the standalone
// note panel, the book-wide feed, a home-feed card) — a plain character
// count rather than a measured line-clamp, so truncation behaves exactly
// the same regardless of how wide that particular caller's card happens to
// render, and a very long fresh selection's own quote (which used to never
// truncate at all here) gets the same "See more" every other quote does.
const PREVIEW_CHARS = 240;

/** Cuts `text` to at most `max` characters, backing up to the nearest word
 * boundary rather than slicing mid-word — `isTruncated` is false whenever
 * nothing was actually cut, so callers never show a "See more" that has
 * nothing more to reveal. */
export function truncateQuote(text: string, max: number): { shown: string; isTruncated: boolean } {
  if (text.length <= max) return { shown: text, isTruncated: false };
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const shown = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return { shown: `${shown.trimEnd()}…`, isTruncated: true };
}

/** The book passage being annotated — the quoted context at the top of a
 * fresh thread, shared by every surface that shows one: the standalone
 * note panel (not clickable — the reader's already at that passage), the
 * book-wide feed (`onJump` makes the whole card itself the "show in
 * passage" click target), and a home-feed card (no `onJump` — there's
 * nowhere local for it to jump to). One fixed size and treatment
 * everywhere; only `onJump` is opt in per caller. A caller that also needs
 * the book's own attribution (home feed/profile's book-context section)
 * renders a sibling BookPreview alongside this, not inside it — same
 * "content, then its preview" pattern every attachment type follows. */
export default function HighlightCard({
  text,
  onJump,
  maxChars = PREVIEW_CHARS,
  bare = false,
}: {
  text: string;
  onJump?: () => void;
  /** Overrides the default 240-char preview budget — e.g. the book-context
   * feed section (NoteBookContext) requests a tighter 160 to match
   * Citation's old density. */
  maxChars?: number;
  /** Passed through to QuoteCard — see its own doc comment. */
  bare?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, isTruncated } = truncateQuote(text, maxChars);

  return (
    <QuoteCard onClick={onJump} bare={bare}>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 font-serif text-[15px] leading-[1.6] text-[var(--color-app-text)]">
          {expanded ? text : shown}
        </p>
        {isTruncated && (
          <button
            onClick={(e) => {
              // The card itself may be a click target (`onJump`), or it may
              // sit inside a real <Link> (NoteBookContext's merged section)
              // — expanding the preview is a distinct action, never the
              // trigger for either.
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="w-fit cursor-pointer border-none bg-transparent p-0 text-[12px] font-medium text-[var(--color-app-text-secondary)] hover:text-[var(--color-app-text)]"
          >
            {expanded ? "See less" : "See more"}
          </button>
        )}
      </div>
    </QuoteCard>
  );
}
