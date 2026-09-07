"use client";

import { MessageCircle } from "lucide-react";

type Props = {
  count: number;
  onClick: () => void;
  /** Same lifecycle as ChapterNavFooter (footerVisible && !selection) — a
   * persistent, always-on FAB turned out to undercut the distraction-free
   * reading experience per reader feedback, so this now shows/hides on
   * scroll-up/tap/reaching-the-bottom exactly like the rest of the bottom
   * chrome instead of staying on screen through it. */
  visible: boolean;
  /** Stacks above whichever bottom-docked bars are currently showing (the
   * "now playing" bar, ChapterNavFooter) — same bottomOffsetPx convention
   * every other floating reader control already follows. */
  bottomOffsetPx: number;
};

/**
 * Floating trigger for the book-wide notes/highlights feed — moved out of
 * the header (previously a header icon button) to cut header clutter. The
 * feed panel this opens now also carries a pinned "share a thought about
 * this book" composer docked at the bottom of the panel itself, reachable
 * regardless of which tab is selected (see BookAnnotationFeedPanel's own
 * `footer`) — a reader who taps this FAB to say something general, with no
 * highlight or reply involved, lands one tap away from writing it, not
 * just from browsing.
 *
 * One style for every screen size (Tailwind handles the one place sizing
 * actually needs to flex — see `sm:` below — rather than a hand-maintained
 * `isMobile` branch): bottom-right, the same corner every other floating
 * reader control already treats as the thumb-reachable "utility" spot.
 *
 * The count sits *inside* the button rather than as a badge sticker
 * overlapping the icon's corner — icon and number side by side in one
 * small pill, tight together (2px gap) so it reads as one compact figure
 * rather than two things sharing a shape. Hairline `--reader-border` ring,
 * no shadow. Collapses to a plain circle when there's nothing to count yet
 * (no dangling empty pill). `env(safe-area-inset-bottom)` keeps it clear of
 * the home indicator on notched phones — a no-op everywhere else.
 */
export default function NotesFeedFab({ count, onClick, visible, bottomOffsetPx }: Props) {
  const shownCount = count > 99 ? "99+" : count;
  const hasCount = count > 0;

  return (
    <div
      style={{ bottom: bottomOffsetPx + 16, right: 16, paddingBottom: "env(safe-area-inset-bottom)" }}
      className={`fixed z-40 transition-[transform,opacity] duration-200 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 pointer-events-none"
      }`}
    >
      <button
        onClick={onClick}
        aria-label="All notes in this book"
        className={`h-10 sm:h-11 ${hasCount ? "px-3 gap-0.5" : "w-10 sm:w-11 justify-center"} rounded-full bg-[var(--reader-surface)] text-[var(--reader-text-muted)] flex items-center cursor-pointer border border-[var(--reader-border)] transition-colors hover:text-[var(--reader-text)]`}
      >
        <MessageCircle size={18} />
        {hasCount && (
          <span className="text-[12px] font-semibold leading-none tabular-nums">{shownCount}</span>
        )}
      </button>
    </div>
  );
}
