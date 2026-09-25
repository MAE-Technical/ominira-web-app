"use client";

import { Quote as QuoteIcon } from "lucide-react";

// A self-contained pull-quote card — modeled on Substack's restack card: an
// isolated "someone pulled this exact passage out of the page" object, not
// just styled body text. Same tinted surface as the home feed's Citation
// block (--color-app-surface-muted, theme-reactive), so a passage quote
// reads as the same kind of object everywhere it appears — the notes
// panel's own standalone quote card and the home feed's cover+quote
// Citation, not two different treatments for the same idea.
// Shared shell for both the book-passage quote (top of a fresh thread) and
// a drilled-in note's own quote (top of its reply thread) — same object,
// different source of "the thing being replied to." See Quote and NoteQuote.
// One fixed treatment everywhere it appears — no "compact" variant, since
// every caller ended up wanting the same size anyway.
export default function QuoteCard({
  children,
  icon = true,
  onClick,
  bare = false,
}: {
  children: React.ReactNode;
  /** The standalone quote-mark glyph above `children` — on by default
   * (every existing caller wants it), but a caller building its own
   * internal layout (e.g. a quote mark placed inline next to the passage
   * text itself, rather than floating alone at the top) can turn it off
   * instead of this shell forcing one look on every consumer. */
  icon?: boolean;
  /** Makes the whole card the click target (e.g. "show in passage") rather
   * than a separate icon competing for space in a footer — a card with
   * somewhere to go should just go there when tapped, the way the rest of
   * this reader's cards already work. Adds the pointer cursor and minimal
   * keyboard/role support itself, so callers don't each reimplement it. */
  onClick?: () => void;
  /** Drops this card's own border/radius, keeping just the tinted
   * background + padding — for a caller (NoteBookContext) that fuses this
   * quote block with a BookPreview meta strip underneath into one bordered
   * card, the way VideoPreview's thumbnail+meta strip reads as one object
   * rather than two stacked ones. */
  bare?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      className={`bg-[var(--color-app-surface-muted)] flex flex-col px-4 pt-4 pb-1 gap-1 ${
        bare ? "" : "rounded-sm border border-[var(--reader-border)]"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {icon && (
        <QuoteIcon
          aria-hidden="true"
          size={12}
          fill="currentColor"
          strokeWidth={0}
          className="mb-1 select-none text-[var(--color-app-text-muted)]"
        />
      )}
      {children}
    </div>
  );
}
