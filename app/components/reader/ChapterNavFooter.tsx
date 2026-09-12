"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Section } from "@/lib/book/schema";

type Props = {
  prevSection: Section | undefined;
  nextSection: Section | undefined;
  onPrev: () => void;
  onNext: () => void;
  /** Same "chrome only when the reader signals for it" idea as the header:
   * true once the reader scrolls up, clicks inside the page, or actually
   * reaches the bottom of the current section (Reader.tsx's footerVisible).
   * A floating overlay (not a flex sibling), so hiding it doesn't reflow
   * the reading column underneath — mirrors how the header floats above
   * content rather than pushing it down. */
  visible: boolean;
  /** Pushed up above the fixed "now playing" bar when one is active. */
  bottomOffsetPx: number;
  /** Reports this footer's real rendered height (the same measure-and-store
   * trick NowPlayingBar/AppBottomNav already use for their own height, just
   * kept local to Reader.tsx instead of a global store — nothing outside
   * the reader needs it) — Reader.tsx uses this to keep NotesFeedFab's own
   * floating position pinned just above whichever bottom bar is actually
   * on screen (this footer or the player) instead of a guessed constant
   * that drifted out of sync with either one. Reported unconditionally,
   * including while `visible` is false: the box still occupies its real
   * height then (hidden via opacity/translate, not display:none), and the
   * caller is the one that decides whether that height should count. */
  onHeightChange?: (px: number) => void;
};

const buttonClass =
  "group min-h-16 flex-1 min-w-0 flex items-center gap-2 border-none bg-transparent cursor-pointer px-5 py-3 text-[13px] font-semibold text-[var(--reader-text-muted)] transition-colors hover:text-[var(--reader-text)]";
const chevronClass = "flex-none transition-transform duration-150";

/**
 * Always-visible-when-relevant chapter navigation — replaces the old
 * invisible full-height edge-hover buttons (removed entirely; swipe on
 * mobile and this footer/keyboard on desktop are now the only page-turn
 * affordances).
 *
 * Deliberately just "Previous"/"Next", not the target section's title:
 * real chapter titles ran long enough on some books to wrap, truncate
 * mid-word, or otherwise read as noise in a control whose whole job is a
 * one-glance affordance — the destination is already one tap away in the
 * chapters outline for anyone who wants to know it first. Nudging chevrons
 * (translate on hover) point where each side leads instead.
 *
 * The two sides are two independent flex-1 buttons rather than a fixed
 * split, so a section with only one neighbor (the very first or last in
 * the book) hands its full width to that one button instead of leaving a
 * dead, borderless placeholder half — and the hairline divider between
 * them is rendered only when both buttons exist, so there's never a
 * dividing line with nothing on one side of it.
 */
export default function ChapterNavFooter({
  prevSection,
  nextSection,
  onPrev,
  onNext,
  visible,
  bottomOffsetPx,
  onHeightChange,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const hasContent = Boolean(prevSection || nextSection);

  // One effect, unconditional (hooks can't live inside the early-return
  // branch below) — prevSection/nextSection are in the dep list so this
  // also re-fires the render right after either goes away, at which point
  // React has already nulled elRef.current (refs detach during the same
  // commit that removes the element, before effects run), landing in the
  // `!el` branch below and reporting 0 rather than leaving the caller with
  // a stale last-known height for a footer that no longer exists.
  useEffect(() => {
    const el = elRef.current;
    if (!el || !onHeightChange) {
      onHeightChange?.(0);
      return;
    }
    const ro = new ResizeObserver((entries) => onHeightChange(entries[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange, hasContent]);

  if (!hasContent) return null;

  return (
    <div
      ref={elRef}
      // Reserves the home-indicator safe area on notched iPhones instead of
      // running the tap targets flush to the very edge of the screen —
      // AppBottomNav (the app shell's own bottom bar) already does the same
      // via env(safe-area-inset-bottom); this footer just never had it.
      style={{ bottom: bottomOffsetPx, paddingBottom: "env(safe-area-inset-bottom)" }}
      className={`absolute left-0 right-0 z-10 flex border-t border-[var(--reader-border)] bg-[var(--reader-surface)] transition-[transform,opacity] duration-200 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      {prevSection && (
        <button
          onClick={onPrev}
          className={`${buttonClass} justify-start ${
            nextSection ? "border-r border-r-[var(--reader-border)]" : ""
          }`}
        >
          <ChevronLeft size={18} className={`${chevronClass} group-hover:-translate-x-0.5`} />
          Previous
        </button>
      )}

      {nextSection && (
        <button onClick={onNext} className={`${buttonClass} justify-end`}>
          Next
          <ChevronRight size={18} className={`${chevronClass} group-hover:translate-x-0.5`} />
        </button>
      )}
    </div>
  );
}
