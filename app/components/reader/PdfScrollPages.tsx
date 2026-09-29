"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Page } from "react-pdf";

/** How many pages either side of the visible ones stay rendered.
 *
 * Ten, which is deliberately generous — roughly a dozen screens of slack in each
 * direction. Rasterising is the expensive step, so the only way scrolling feels
 * like a document rather than a queue of loads is for the pages ahead to be
 * *already painted* by the time they arrive; a window of one or two pages meant a
 * quick flick of the wheel outran the rasteriser, and a page dropped as soon as
 * it left that window had to be rasterised all over again the moment the reader
 * scrolled back. At this size ordinary reading, fast scrolling and short
 * back-and-forth all land on live canvases.
 *
 * It is still a window, not "render everything": a 500-page document would mean
 * 500 canvases rasterised at the current zoom — hundreds of megabytes and a long
 * freeze on open — which is the whole reason this layout is virtualised. Every
 * page always has a *wrapper* (which is what makes observing and scrolling to any
 * page possible); only the wrappers within the window hold a real `<Page>`. */
const OVERSCAN_PAGES = 10;

/** Until a real page has rendered and been measured, placeholders need *some*
 * height — otherwise every page stacks at zero and the container has nothing to
 * scroll. Roughly A4 at 100%. */
const FALLBACK_PAGE_HEIGHT_PX = 1000;

/** Hoisted so it's the same element on every render — a fresh `<span />` would be
 * a changed prop on every render of a page row, defeating its memoisation. */
const BLANK = <span />;

/**
 * Continuous-scroll layout for a PDF — every page in one scroll, as opposed to
 * PdfDocumentView's paged layout.
 *
 * Placeholder height is measured from the first page that actually renders and
 * reused for the rest, which assumes uniformly-sized pages. That holds for
 * almost every real PDF, and where it doesn't the only consequence is a
 * scrollbar that drifts slightly as estimates are replaced by real pages — the
 * page the reader is *on* stays correct regardless, because it comes from
 * observing real elements rather than arithmetic over estimates.
 *
 * Nothing here ever shows a spinner. A page that hasn't painted yet is drawn as a
 * blank sheet of the right size (see PdfScrollPage) — the same thing Preview and
 * Acrobat show while rasterising. A spinner per page turned an ordinary scroll
 * into a field of flickering loaders, and said "something is wrong" about what is
 * really a few frames of work.
 */
export default function PdfScrollPages({
  numPages,
  scale,
  scrollElement,
  currentPage,
  jumpSeq,
  onVisiblePageChange,
}: {
  numPages: number;
  scale: number;
  /** The scroll container — the IntersectionObserver root, since it's the thing
   * that actually scrolls, and what gets scrolled on a jump. */
  scrollElement: HTMLElement | null;
  /** The page to scroll to when `jumpSeq` changes. */
  currentPage: number;
  /** Incremented by the parent on every *deliberate* move to a page (the footer's
   * input or pager, a resume landing, a layout switch) — the trigger to scroll.
   * A plain `currentPage` dependency couldn't work: this component is also what
   * *reports* the current page as the reader scrolls, so scrolling would feed
   * back into scrolling. The same explicit-jump-counter shape the reader's own
   * narration jumps use. */
  jumpSeq: number;
  onVisiblePageChange: (page: number) => void;
}) {
  const pageElsRef = useRef(new Map<number, HTMLDivElement>());
  // A measurement of a real page, tagged with the zoom it was taken at, so a
  // zoom change invalidates it without needing an effect to reset it: a
  // placeholder sized at 100% would leave visible gaps at 200%.
  const [measuredPage, setMeasuredPage] = useState<{ scale: number; height: number } | null>(null);
  const placeholderHeight = measuredPage?.scale === scale ? measuredPage.height : FALLBACK_PAGE_HEIGHT_PX * scale;
  // Which pages the observer currently considers near the viewport. Starts at the
  // top of the document; `currentPage` widens it independently (see isRendered).
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: Math.min(numPages, 1 + OVERSCAN_PAGES) });
  // page -> the zoom level at which its canvas painted. Keyed by scale for the
  // same reason as measuredPage: a page rendered at 100% is not a page rendered
  // at 200%. Held in a ref, not state: the only thing that needs it is the jump
  // effect below (nothing renders from it — each page tracks its own paint
  // locally, see PdfScrollPage), and a Map mutation can't be an effect
  // dependency, which is what `paintSeq` is for.
  const paintedAtScaleRef = useRef(new Map<number, number>());
  const [paintSeq, setPaintSeq] = useState(0);

  // Scrolling the container is a mutation, so it goes through a ref rather than
  // the prop itself (same reason useArticleProgress holds its elements in refs);
  // the prop is still what the observer takes as its root below.
  const scrollElRef = useRef<HTMLElement | null>(scrollElement);
  useEffect(() => {
    scrollElRef.current = scrollElement;
  }, [scrollElement]);

  // A stable ref callback that reads the page number back off the element's own
  // `data-page` (React sets attributes before refs) rather than a fresh closure
  // per page per render, which would detach and reattach every ref on every
  // render. Wrappers live as long as this component, so the null call has
  // nothing to clean up.
  const registerPage = useCallback((el: HTMLDivElement | null) => {
    if (el) pageElsRef.current.set(Number(el.dataset.page), el);
  }, []);

  // Stable, so a painted page doesn't become a changed prop for every other
  // page's memoised row (see PdfScrollPage) — that churn is what had pdf.js
  // logging "Dependent image isn't ready yet": renders being restarted and
  // cancelled underneath it.
  const onPainted = useCallback((page: number, paintedScale: number, height: number) => {
    paintedAtScaleRef.current.set(page, paintedScale);
    setMeasuredPage((current) => (current?.scale === paintedScale ? current : { scale: paintedScale, height }));
    setPaintSeq((n) => n + 1);
  }, []);

  // A jump in flight. While one is pending the observer's reports are ignored —
  // the pages flying past on the way are not where the reader asked to be.
  const pendingJumpRef = useRef<number | null>(null);
  useEffect(() => {
    pendingJumpRef.current = currentPage;
    // Keyed on jumpSeq alone — see its own prop comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpSeq]);

  // Lands the jump, and keeps re-landing it until the target page has really
  // painted. The first attempt is usually measured against an *estimated*
  // placeholder, so it's only approximate; once the real page renders
  // (paintSeq) its true offset is known and this corrects onto it — which is
  // what makes "go to page 140" of a 157-page document land on 140 rather than
  // near it.
  useEffect(() => {
    const target = pendingJumpRef.current;
    const scrollEl = scrollElRef.current;
    if (target === null || !scrollEl) return;
    const el = pageElsRef.current.get(target);
    if (!el) return;
    scrollEl.scrollTop += el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
    if (paintedAtScaleRef.current.get(target) === scale) pendingJumpRef.current = null;
  }, [jumpSeq, paintSeq, visibleRange, scrollElement, scale]);

  // One observer over every wrapper, placeholders included — that's what lets a
  // page be noticed *before* it has been rendered.
  const intersectingRef = useRef(new Set<number>());
  useEffect(() => {
    if (!scrollElement) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (!page) continue;
          if (entry.isIntersecting) intersectingRef.current.add(page);
          else intersectingRef.current.delete(page);
        }
        if (pendingJumpRef.current !== null) return;
        const visible = [...intersectingRef.current];
        if (visible.length === 0) return;
        const first = Math.min(...visible);
        const last = Math.max(...visible);
        // The topmost visible page is "the page you're on" — the same
        // first-thing-still-showing rule the EPUB and article trackers use, so
        // progress means the same thing in every format.
        onVisiblePageChange(first);
        setVisibleRange((current) => {
          const start = Math.max(1, first - OVERSCAN_PAGES);
          const end = Math.min(numPages, last + OVERSCAN_PAGES);
          return current.start === start && current.end === end ? current : { start, end };
        });
      },
      { root: scrollElement }
    );
    // Every page has a wrapper for this component's whole life (only the
    // contents are virtualised), so observing once here covers all of them —
    // there's nothing to re-observe as the rendered range moves.
    for (const el of pageElsRef.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [scrollElement, numPages, onVisiblePageChange]);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
        <PdfScrollPage
          key={page}
          page={page}
          scale={scale}
          placeholderHeight={placeholderHeight}
          // Near the viewport, *or* near wherever the reader has just asked to be
          // — the second half is what has a jump's destination already painting
          // as the scroll arrives, rather than waiting for the observer to notice
          // it afterwards. Derived from props/state rather than pushed into state
          // by the jump effect, so there's one source of truth for what's
          // rendered.
          isRendered={
            (page >= visibleRange.start && page <= visibleRange.end) || Math.abs(page - currentPage) <= OVERSCAN_PAGES
          }
          registerPage={registerPage}
          onPainted={onPainted}
        />
      ))}
    </div>
  );
}

/**
 * One page of the continuous scroll: its wrapper (which always exists, so the
 * observer and jumps can address every page) and, within the rendered window, the
 * real `<Page>`.
 *
 * Memoised, and every prop it takes is either a primitive or a stable callback.
 * With ~21 pages live at a time, an unmemoised row meant each page re-rendering
 * every time any *other* page finished painting — react-pdf restarting and
 * cancelling render tasks under itself, which is what pdf.js reports as
 * "Dependent image isn't ready yet". Whether *this* page has painted is
 * deliberately local state for the same reason: it changes on every paint, and
 * nothing outside this row renders from it.
 */
const PdfScrollPage = memo(function PdfScrollPage({
  page,
  scale,
  placeholderHeight,
  isRendered,
  registerPage,
  onPainted,
}: {
  page: number;
  scale: number;
  placeholderHeight: number;
  isRendered: boolean;
  registerPage: (el: HTMLDivElement | null) => void;
  onPainted: (page: number, scale: number, height: number) => void;
}) {
  const [paintedScale, setPaintedScale] = useState<number | null>(null);
  const isPainted = paintedScale === scale;
  // This row's own wrapper, kept alongside the shared registration so the paint
  // callback below can measure the real page without going through the document.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const setWrapper = useCallback(
    (el: HTMLDivElement | null) => {
      wrapperRef.current = el;
      registerPage(el);
    },
    [registerPage]
  );

  return (
    <div
      data-page={page}
      ref={setWrapper}
      // Every wrapper holds a page's worth of space — placeholders so the
      // scrollbar is honest and a page scrolled to doesn't jump once it paints,
      // and rendered-but-unpainted ones as a *minimum* (`minHeight`) so the
      // moment between mounting a page and its canvas appearing doesn't collapse
      // the stack and yank the scroll position with it. That collapse-and-settle
      // was most of what read as janky loading. Once the canvas is up it's the
      // page's real height that counts, so the reservation drops away entirely —
      // otherwise a document whose pages are shorter than the estimate would
      // carry a strip of empty sheet under every one of them.
      style={isPainted ? undefined : isRendered ? { minHeight: placeholderHeight } : { height: placeholderHeight }}
      // The unpainted state is a *sheet of paper*, not a loading box: page-sized,
      // page-coloured (--reader-surface, the same token the painted page's own
      // background comes to), with the same shadow a real page carries, so a page
      // arriving reads as ink appearing on a sheet already there rather than as a
      // box being replaced. The faint pulse is the only motion — enough to say
      // "coming", far less than a spinner insists.
      className={`flex justify-center rounded-sm ${
        isPainted
          ? ""
          : "w-full max-w-[min(90vw,800px)] animate-pulse bg-[var(--reader-surface)] shadow-sm ring-1 ring-[var(--reader-border)]"
      }`}
    >
      {isRendered && (
        <Page
          pageNumber={page}
          scale={scale}
          renderTextLayer
          renderAnnotationLayer
          // Nothing at all while the page resolves — the sheet above *is* the
          // loading state. react-pdf's own default here is a "Loading page…"
          // message, which is exactly the flicker this layout must not have.
          loading={BLANK}
          noData={BLANK}
          error={BLANK}
          className="shadow-sm"
          onRenderSuccess={() => {
            setPaintedScale(scale);
            // Measured from the rendered page itself, not the wrapper: the
            // wrapper is still carrying the estimated `minHeight` at this moment,
            // so measuring it would just re-measure the estimate and every
            // placeholder in the document would inherit it.
            const el = wrapperRef.current?.querySelector<HTMLElement>(".react-pdf__Page");
            onPainted(page, scale, el?.offsetHeight ?? placeholderHeight);
          }}
        />
      )}
    </div>
  );
});
