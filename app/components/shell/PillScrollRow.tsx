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
 * clutter riding right under the pills — in favor of one chevron flanking
 * either side of the row itself (< pills >), not floating above or over
 * the pills. Each only renders while there's actually more to scroll to in
 * that direction (tracked via the scroll/resize listener below), so the
 * track alone still fills the space at either end once there's nothing
 * further that way. A finger swipe still scrolls the track directly either
 * way — these are a discoverability aid on top of that, not a replacement
 * for it.
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

  function scrollBy(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * SCROLL_STEP_RATIO, behavior: "smooth" });
  }

  return (
    <div className="flex items-center gap-2">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text)] cursor-pointer"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      <div ref={trackRef} className="no-scrollbar min-w-0 flex-1 flex gap-2 overflow-x-auto pb-1 no-callout">
        {items.map((item) => {
          const className = `flex-none whitespace-nowrap rounded-sm border px-3 py-2 text-xs font-bold cursor-pointer overflow-hidden transition-colors no-underline ${
            item.active
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)]"
          }`;
          return (
            <Link key={item.key} href={item.href} scroll={false} className={className} onClick={item.onClick}>
              {item.label}
            </Link>
          );
        })}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text)] cursor-pointer"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
