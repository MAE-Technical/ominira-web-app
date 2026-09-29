"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, GalleryVertical, Minus, Plus, RectangleVertical } from "lucide-react";
import type { PdfLayout } from "@/stores/reader-store";

// Same 50%-200% range most PDF viewers (Preview, Acrobat's quick zoom,
// Chrome's built-in viewer) offer, in 10-point steps — wide enough to read
// small print or see a full spread without the granularity most people never
// zoom past. Owned here rather than by the viewer because this is where zoom is
// driven from; the viewer only holds the value.
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

// Content-sized, not `flex-1`: an edge button that stretched to fill its half of
// the bar turned every bit of empty space beside it into a page turn — a stray
// click anywhere near the bottom of the window silently moved the reader. The
// buttons now occupy exactly their own label, and the room around them belongs to
// the bar (which is `cursor-default` and inert) rather than to a control.
const edgeButtonClass =
  "group flex items-center gap-2 rounded-md border-none bg-transparent cursor-pointer px-3 py-2 text-[13px] font-semibold text-[var(--reader-text-muted)] transition-colors hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)] disabled:opacity-40 disabled:pointer-events-none";
const chevronClass = "flex-none transition-transform duration-150";

const iconButtonClass =
  "flex h-9 w-9 flex-none items-center justify-center rounded-md border-none bg-transparent cursor-pointer text-[var(--reader-text-muted)] transition-colors hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)] disabled:opacity-40 disabled:pointer-events-none";

/**
 * Everything a PDF is navigated and sized by, in one bar: zoom, which page of
 * how many (typed, not just read), the paged↔scroll layout switch, and
 * prev/next at the edges.
 *
 * One centred cluster — `[15] / 157 │ ▤ │ − +` — with the page turners pushed to
 * the far edges. Zoom lives here rather than up in the header (where it started)
 * so everything that moves or resizes the document is in one place and within
 * thumb reach, and so the bar keeps to a single row on a phone instead of
 * stacking page controls above zoom controls. Page numbers lead, since that's
 * what a reader looks at; the layout switch and zoom follow, each divided off so
 * three unrelated controls don't read as one undifferentiated row.
 *
 * The page number is an input rather than a label because pages are a PDF's
 * *only* structure — there's no TOC to jump through (see
 * document-readers-spec.md § 3), so "go to page 18" is the whole navigation
 * model, and tapping Next fifteen times was the alternative. It holds free text
 * while focused (so a two-digit number can be typed without the first keystroke
 * jumping anywhere) and commits on Enter or blur, clamped to the document.
 */
export default function PdfPagerFooter({
  pageNumber,
  numPages,
  layout,
  scale,
  onGoToPage,
  onLayoutChange,
  onScaleChange,
}: {
  pageNumber: number;
  numPages: number;
  layout: PdfLayout;
  scale: number;
  onGoToPage: (page: number) => void;
  onLayoutChange: (layout: PdfLayout) => void;
  onScaleChange: (scale: number) => void;
}) {
  // What's being typed, tagged with the page it was typed against. The tag is
  // how the readout follows `pageNumber` (which changes continuously as the
  // reader scrolls in the scroll layout) without an effect clearing the draft:
  // a draft for a page the reader has since moved off is simply stale, and the
  // live page number shows instead.
  const [typed, setTyped] = useState<{ basePage: number; text: string } | null>(null);
  const draft = typed?.basePage === pageNumber ? typed.text : null;
  const setDraft = (text: string | null) => setTyped(text === null ? null : { basePage: pageNumber, text });

  const commitDraft = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    // Focused-but-untouched, or cleared and abandoned — the field reverts to
    // the live page rather than treating an empty box as page 0 (which would
    // clamp to 1 and teleport the reader to the front of the document).
    if (text === "") return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(1, Math.round(parsed)), numPages);
    if (clamped !== pageNumber) onGoToPage(clamped);
  };

  const isScroll = layout === "scroll";
  const zoomPercent = Math.round(scale * 100);
  // Rounded through hundredths so repeated steps can't accumulate float drift
  // into a 139.99999% zoom.
  const zoomBy = (delta: number) =>
    onScaleChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((scale + delta) * 100) / 100)));

  return (
    <div
      // min-h-16 matches PdfDocumentView's BOTTOM_BAR_HEIGHT_PX, which is what
      // the scroll container reserves for this bar — the controls inside are all
      // shorter than that, so without it the reserved space would exceed the bar
      // and leave a gap under it.
      //
      // A three-column grid rather than a flex row with stretching edge buttons:
      // the centre cluster stays centred in the bar whether or not the page
      // turners are showing, while each turner keeps to its own width so the
      // space around it isn't clickable. `cursor-default` says as much — without
      // it the bar inherits the text cursor from the document and reads as if
      // something there could be selected or pressed.
      className="absolute left-0 right-0 bottom-0 z-10 grid min-h-16 cursor-default grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-[var(--reader-border)] bg-[var(--reader-surface)] px-2"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Prev/next are a paged-layout affordance only — in continuous scroll the
          scroll itself is the page turn, and buttons that merely jump the scroll
          position would compete with it. Their labels drop away on a phone,
          where the chevrons alone are unambiguous and the room is better spent
          on the centre cluster. */}
      <div className="flex min-w-0 justify-start">
        {!isScroll && (
          <button
            onClick={() => onGoToPage(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            aria-label="Previous page"
            className={edgeButtonClass}
          >
            <ChevronLeft size={18} className={`${chevronClass} group-hover:-translate-x-0.5`} />
            <span className="hidden sm:inline">Previous</span>
          </button>
        )}
      </div>

      {/* Page numbers first — the thing a reader looks at — then the layout
          switch, then zoom, each its own group behind a hairline so three
          unrelated controls don't read as one row of buttons. */}
      <div className="flex flex-none items-center gap-2 sm:gap-3">
        <div className="flex flex-none items-center gap-1.5 text-[13px] font-semibold tabular-nums text-[var(--reader-text-muted)]">
          <input
            type="text"
            inputMode="numeric"
            // A form control needs a label even though the "/ 157" beside it
            // reads as one visually.
            aria-label={`Page number, of ${numPages}`}
            // Focusing empties the field and shows the current page as a
            // placeholder, so the caret blinks *in front of* the number the
            // reader is on: it says "this can be changed" and the first
            // keystroke starts a new number, rather than appending to the old
            // one or relying on a select-all the reader can't see.
            value={draft ?? String(pageNumber)}
            placeholder={String(pageNumber)}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={() => setDraft("")}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur(); // blur commits, so there's one commit path
              } else if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
            // No focus border: the caret already says the field is live, and a
            // recolouring border reads as a state change that hasn't happened.
            // The selection override is not cosmetic — the reader's global
            // ::selection is the annotation-highlight colour (globals.css),
            // which on a page-number field looks like a highlighted passage.
            className="w-14 cursor-text rounded-sm border border-[var(--reader-border)] bg-transparent px-2 py-1 text-center text-[13px] font-semibold tabular-nums text-[var(--reader-text)] outline-none selection:bg-[var(--reader-surface-hover)] selection:text-[var(--reader-text)] placeholder:text-[var(--reader-text-muted)]"
          />
          <span>/ {numPages}</span>
        </div>

        <span aria-hidden="true" className="h-5 w-px flex-none bg-[var(--reader-border)]" />

        {/* One button that toggles rather than a two-option segmented control:
            there are only two layouts, so the icon can simply show the one the
            tap leads to — a single page, or a stack of them — the same way the
            header's sun/moon theme toggle already works. */}
        <button
          type="button"
          onClick={() => onLayoutChange(isScroll ? "paged" : "scroll")}
          aria-label={isScroll ? "Switch to page by page" : "Switch to continuous scroll"}
          title={isScroll ? "Page by page" : "Continuous scroll"}
          className={iconButtonClass}
        >
          {isScroll ? <RectangleVertical size={17} /> : <GalleryVertical size={17} />}
        </button>

        <span aria-hidden="true" className="h-5 w-px flex-none bg-[var(--reader-border)]" />

        <div className="flex flex-none items-center gap-0.5">
          <button
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={scale <= ZOOM_MIN}
            aria-label={`Zoom out, currently ${zoomPercent}%`}
            className={iconButtonClass}
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={scale >= ZOOM_MAX}
            aria-label={`Zoom in, currently ${zoomPercent}%`}
            className={iconButtonClass}
          >
            <Plus size={16} />
          </button>
          {/* Shown only while zoom is off its default — feedback when it
              matters, no permanent "100%" taking up room on a phone. */}
          {zoomPercent !== 100 && (
            <span className="hidden flex-none pl-1 text-[12px] font-semibold tabular-nums text-[var(--reader-text-subtle)] sm:inline">
              {zoomPercent}%
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 justify-end">
        {!isScroll && (
          <button
            onClick={() => onGoToPage(Math.min(numPages, pageNumber + 1))}
            disabled={pageNumber >= numPages}
            aria-label="Next page"
            className={edgeButtonClass}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={18} className={`${chevronClass} group-hover:translate-x-0.5`} />
          </button>
        )}
      </div>
    </div>
  );
}
