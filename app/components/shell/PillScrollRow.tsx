"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// How far one arrow click moves the track — a partial page (not the full
// visible width) so the pill that was at the trailing edge stays partly
// visible after the click, the same "keep your place" scroll YouTube
// Music's own genre chips use rather than a jarring full-width jump.
const SCROLL_STEP_RATIO = 0.8;

export type PillItem = {
  key: string;
  label: string;
  active: boolean;
  /** Every pill is a real `<Link>` (ctrl/cmd-click-to-new-tab, hover
   * prefetch, right-click "copy link" for free) — even one that doesn't
   * navigate yet gets a real href (e.g. "#") so it's still built as a link,
   * ready to grow a real URL later without changing shape. */
  href: string;
  /** For a pill that filters in place instead of navigating (e.g. Home's
   * topic filter): call `e.preventDefault()` yourself, then run the filter.
   * Omit for a pill that should just navigate via `href`. */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

/**
 * The horizontally-scrolling pill row shell shared by every pill-filter of
 * this shape — CategoryPills serves both Library's category filter (real
 * navigation) and Home's topic filter (in-place `onClick` that intercepts
 * the click) through the same `PillItem[]`, so this shell only needs one
 * rendering path.
 *
 * The track's native scrollbar is hidden (.no-scrollbar) — it read as
 * clutter riding right under the pills. In its place: a soft edge fade
 * (into the page background) plus a chevron button, both overlaid on top
 * of whichever side of the track still has more pills to reveal, rather
 * than laid out as flex siblings of the track. That's on purpose: the
 * track's own box must never change size. It used to have the buttons as
 * inline siblings (< pills >), which meant the track's own width changed
 * by a button's width the instant a scroll crossed the show/hide
 * threshold — the pills visibly snapped sideways mid-scroll. Each button
 * is *always* mounted, just faded to invisible (opacity + pointer-events,
 * not unmounted) when that direction has nothing left to scroll to, so
 * nothing about the track's box ever moves — only the overlay's opacity
 * does.
 */
export default function PillScrollRow({ items }: { items: PillItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // 1px slop: fractional scroll widths (subpixel layout, browser zoom)
    // can leave scrollLeft/scrollWidth off by less than a pixel even when
    // the track is genuinely at rest against an edge.
    function updateEdges() {
      if (!track) return;
      setCanScrollLeft(track.scrollLeft > 1);
      setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 1);
    }

    updateEdges();
    track.addEventListener("scroll", updateEdges, { passive: true });
    // Catches both a viewport resize and the track's own content changing
    // width (e.g. this list of items loading in) — ResizeObserver covers
    // what a plain window "resize" listener wouldn't.
    const observer = new ResizeObserver(updateEdges);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
  }, [items]);

  // Selecting a pill navigates and remounts the row at scrollLeft 0, which
  // left a far-right selection hidden (reads as "back to All"). Bring the
  // active pill into view — instantly, and by scrolling the track itself
  // (scrollIntoView could also scroll the page vertically).
  const activeKey = items.find((item) => item.active)?.key;
  useEffect(() => {
    const track = trackRef.current;
    const pill = track?.querySelector<HTMLElement>("[data-active-pill]");
    if (!track || !pill) return;
    const target = pill.offsetLeft - (track.clientWidth - pill.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, target), behavior: "instant" });
  }, [activeKey]);

  function scrollBy(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * SCROLL_STEP_RATIO, behavior: "smooth" });
  }

  return (
    <div className="relative min-w-0">
      <div ref={trackRef} className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-1 py-1 no-callout">
        {items.map((item) => {
          const className = `flex-none whitespace-nowrap rounded-sm border px-3 py-2 text-xs font-bold cursor-pointer overflow-hidden transition-colors no-underline ${
            item.active
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)]"
          }`;
          return (
            <Link key={item.key} href={item.href} scroll={false} className={className} onClick={item.onClick} data-active-pill={item.active || undefined}>
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Fade + chevron are one visual unit per edge, both driven by the
         same canScroll* flag and both ignoring pointer events except the
         button itself — the fade never blocks a swipe or a click-through
         to a pill riding near the edge underneath it. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--reader-bg)] to-transparent transition-opacity duration-200 ${
          canScrollLeft ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--reader-bg)] to-transparent transition-opacity duration-200 ${
          canScrollRight ? "opacity-100" : "opacity-0"
        }`}
      />

      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Scroll left"
        tabIndex={canScrollLeft ? 0 : -1}
        className={`absolute left-0.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface-hover)] text-[var(--reader-text)] shadow-sm transition-opacity duration-200 cursor-pointer hover:border-[var(--reader-text-muted)] ${
          canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ChevronLeft size={16} strokeWidth={2.5} />
      </button>

      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Scroll right"
        tabIndex={canScrollRight ? 0 : -1}
        className={`absolute right-0.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface-hover)] text-[var(--reader-text)] shadow-sm transition-opacity duration-200 cursor-pointer hover:border-[var(--reader-text-muted)] ${
          canScrollRight ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ChevronRight size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
