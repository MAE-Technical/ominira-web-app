"use client";

import { useCallback, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useReaderStore } from "@/stores/reader-store";
import ReaderHeader from "./ReaderHeader";
import Loader from "../Loader";

// Same bundler-portable worker resolution as lib/book/pdfParser.ts's browser
// branch — Turbopack/webpack resolve the `new URL(...)` against the actual
// copy pdfjs-dist ships, rather than this app trying to host its own.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const TOP_BAR_HEIGHT_PX = 60;
const RAIL_INSET_PX = 16;
const BOTTOM_BAR_HEIGHT_PX = 64;

const navButtonClass =
  "group min-h-16 flex-1 min-w-0 flex items-center gap-2 border-none bg-transparent cursor-pointer px-5 py-3 text-[13px] font-semibold text-[var(--reader-text-muted)] transition-colors hover:text-[var(--reader-text)] disabled:opacity-40 disabled:pointer-events-none";
const navChevronClass = "flex-none transition-transform duration-150";

const zoomButtonClass =
  "w-9 h-9 rounded-md border-none bg-transparent cursor-pointer flex items-center justify-center flex-none text-[var(--reader-text)] transition-colors hover:bg-[var(--reader-surface-hover)] disabled:opacity-40 disabled:pointer-events-none";

// Same 50%-200% range most PDF viewers (Preview, Acrobat's quick zoom,
// Chrome's built-in viewer) offer, in 10-point steps — wide enough to read
// small print or see a full spread without the granularity most people
// never zoom past.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1;

/**
 * PDF body renderer — see document-readers-spec.md § 1/§ 3. Whole-document
 * only, no highlighting: page navigation (prev/next) is the only
 * "structure" here, no TOC. Fetches straight from `sourceUrl` (a public
 * Storage URL) — no server round trip beyond the material row already
 * loaded by `loadReaderMaterial`.
 *
 * Standalone (app/read, app/reader) and overlay (app/@modal/(.)read, via
 * DocumentOverlayShell) mount this the same way Reader/ReaderModal already
 * split: `onClose` present picks the close-X, absent picks the back-arrow —
 * same convention as ReaderHeader.
 */
export default function PdfDocumentView({
  title,
  sourceUrl,
  onClose,
}: {
  title: string;
  sourceUrl: string;
  onClose?: () => void;
}) {
  const theme = useReaderStore((s) => s.theme);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(ZOOM_DEFAULT);

  const onLoadSuccess = useCallback(({ numPages }: { numPages: number }) => setNumPages(numPages), []);

  return (
    <div
      data-reader-theme={theme}
      className="w-full h-dvh box-border flex flex-col overflow-hidden relative font-sans"
      style={{ background: "var(--reader-bg)" }}
    >
      <ReaderHeader topBarHeightPx={TOP_BAR_HEIGHT_PX} railInsetPx={RAIL_INSET_PX} onClose={onClose} title={title}>
        <div className="flex items-center gap-0.5 flex-none">
          <button
            onClick={() => setScale((s) => Math.max(ZOOM_MIN, Math.round((s - ZOOM_STEP) * 100) / 100))}
            disabled={scale <= ZOOM_MIN}
            aria-label="Zoom out"
            className={zoomButtonClass}
          >
            <Minus size={16} />
          </button>
          <span className="min-w-10 text-center tabular-nums text-[13px] font-semibold text-[var(--reader-text-muted)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(ZOOM_MAX, Math.round((s + ZOOM_STEP) * 100) / 100))}
            disabled={scale >= ZOOM_MAX}
            aria-label="Zoom in"
            className={zoomButtonClass}
          >
            <Plus size={16} />
          </button>
        </div>
      </ReaderHeader>
      <div
        className="flex-1 min-h-0 overflow-auto flex justify-center"
        style={{ paddingTop: TOP_BAR_HEIGHT_PX, paddingBottom: numPages !== null ? BOTTOM_BAR_HEIGHT_PX : 0 }}
      >
        <Document file={sourceUrl} onLoadSuccess={onLoadSuccess} loading={<Loader confined />} className="py-6">
          <Page pageNumber={pageNumber} scale={scale} renderTextLayer renderAnnotationLayer className="shadow-sm" />
        </Document>
      </div>
      {/* Same prev/next footer treatment as EPUB's ChapterNavFooter, for the
          same UX-consistency reason — a page number stands in for a section
          title since that's the only "structure" a PDF has (see
          document-readers-spec.md § 3). Always visible here (no
          scroll-driven show/hide) since a PDF page has no equivalent to
          EPUB's own end-of-section signal to hide the footer against. */}
      {numPages !== null && (
        <div
          className="absolute left-0 right-0 bottom-0 z-10 flex border-t border-[var(--reader-border)] bg-[var(--reader-surface)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className={`${navButtonClass} justify-start border-r border-r-[var(--reader-border)]`}
          >
            <ChevronLeft size={18} className={`${navChevronClass} group-hover:-translate-x-0.5`} />
            Previous
          </button>
          <span className="flex-none flex items-center justify-center px-3 text-[13px] font-semibold tabular-nums text-[var(--reader-text-muted)]">
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className={`${navButtonClass} justify-end border-l border-l-[var(--reader-border)]`}
          >
            Next
            <ChevronRight size={18} className={`${navChevronClass} group-hover:translate-x-0.5`} />
          </button>
        </div>
      )}
    </div>
  );
}
