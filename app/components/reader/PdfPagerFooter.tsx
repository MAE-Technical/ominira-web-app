"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

const iconButtonClass =
  "flex h-9 w-9 flex-none items-center justify-center rounded-md border-none bg-transparent cursor-pointer text-[var(--reader-text-muted)] transition-colors hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)] disabled:opacity-40 disabled:pointer-events-none";

/**
 * Everything a PDF is navigated and sized by, in one bar: zoom, which page of
 * how many (typed, not just read).
 *
 * One centred cluster — `[15] / 157 │ − +`. Zoom lives here rather than up in the
 * header (where it started) so everything that moves or resizes the document is
 * in one place and within thumb reach, and so the bar keeps to a single row on a
 * phone. Page numbers lead, since that's what a reader looks at; zoom follows,
 * divided off so two unrelated controls don't read as one undifferentiated row.
 *
 * The page number is an input rather than a label because pages are a PDF's
 * *only* structure — there's no TOC to jump through (see
 * document-readers-spec.md § 3), so "go to page 18" is the whole navigation
 * model, and tapping Next fifteen times was the alternative. It holds free text
 * while focused, starting from the current page (so a digit can be added or
 * changed without the first keystroke jumping anywhere) and commits on Enter or blur, clamped to the document.
 */
export default function PdfPagerFooter({
  pageNumber,
  numPages,
  zoom,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  pageNumber: number;
  numPages: number;
  /** `isCustom` is whether the reader has zoomed away from the page's own
   * fit (by these buttons or a pinch) — the only time the percentage is worth
   * the room it takes, and the only time there's anything to reset. */
  zoom: { percent: number; isCustom: boolean; canZoomIn: boolean; canZoomOut: boolean };
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  // What's being typed, tagged with the page it was typed against. The tag is
  // how the readout follows `pageNumber` (which changes continuously as the
  // reader scrolls) without an effect clearing the draft:
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

  return (
    <div
      // min-h-16 matches PdfDocumentView's BOTTOM_BAR_HEIGHT_PX, which is what
      // the scroll container reserves for this bar — the controls inside are all
      // shorter than that, so without it the reserved space would exceed the bar
      // and leave a gap under it. `cursor-default` because without it the bar
      // inherits the text cursor from the document and reads as if something
      // there could be selected or pressed.
      className="absolute left-0 right-0 bottom-0 z-10 flex min-h-16 cursor-default items-center justify-center gap-2 border-t border-[var(--reader-border)] bg-[var(--reader-surface)] px-2 sm:gap-3"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex flex-none items-center gap-1.5 text-[13px] font-semibold tabular-nums text-[var(--reader-text-muted)]">
        <input
          type="text"
          inputMode="numeric"
          // A form control needs a label even though the "/ 157" beside it
          // reads as one visually.
          aria-label={`Page number, of ${numPages}`}
          // Focusing keeps the current page in the field, so the reader can
          // nudge it (add a digit, fix one) rather than retype from scratch.
          value={draft ?? String(pageNumber)}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={() => setDraft(String(pageNumber))}
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
          className="w-14 cursor-text rounded-sm border border-[var(--reader-border)] bg-transparent px-2 py-1 text-center text-[13px] font-semibold tabular-nums text-[var(--reader-text)] outline-none selection:bg-[var(--reader-surface-hover)] selection:text-[var(--reader-text)]"
        />
        <span>/ {numPages}</span>
      </div>

      <span aria-hidden="true" className="h-5 w-px flex-none bg-[var(--reader-border)]" />

      <div className="flex flex-none items-center gap-0.5">
        <button
          onClick={onZoomOut}
          disabled={!zoom.canZoomOut}
          aria-label={`Zoom out, currently ${zoom.percent}%`}
          className={iconButtonClass}
        >
          <Minus size={16} />
        </button>
        <button
          onClick={onZoomIn}
          disabled={!zoom.canZoomIn}
          aria-label={`Zoom in, currently ${zoom.percent}%`}
          className={iconButtonClass}
        >
          <Plus size={16} />
        </button>
        {/* Shown only while zoomed off the page's own fit — feedback when it
            matters, no permanent "100%" taking up room on a phone — and a
            button, since after a pinch there's otherwise no one-tap way back
            to a page that fits. */}
        {zoom.isCustom && (
          <button
            type="button"
            onClick={onZoomReset}
            aria-label={`Reset zoom, currently ${zoom.percent}%`}
            title="Reset zoom"
            className="hidden flex-none cursor-pointer rounded-md border-none bg-transparent px-1.5 py-1 text-[12px] font-semibold tabular-nums text-[var(--reader-text-subtle)] transition-colors hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)] sm:inline"
          >
            {zoom.percent}%
          </button>
        )}
      </div>
    </div>
  );
}
