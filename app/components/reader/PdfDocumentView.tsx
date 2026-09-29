"use client";

// First: polyfills + shared pdf.js worker (see lib/pdf/setup.ts).
import "@/lib/pdf/setup";
import { useCallback, useEffect, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useReaderStore, type PdfLayout } from "@/stores/reader-store";
import type { Locator } from "@/lib/reader/locator";
import { useDocumentProgress } from "@/lib/reader/useDocumentProgress";
import { useDocumentKeyboard } from "@/lib/reader/useDocumentKeyboard";
import DocumentEndPanel from "./DocumentEndPanel";
import PdfPagerFooter, { ZOOM_DEFAULT } from "./PdfPagerFooter";
import PdfScrollPages from "./PdfScrollPages";
import ReaderHeader from "./ReaderHeader";

/**
 * Where pdf.js finds the resources it doesn't bundle into its own code. Without
 * these it silently degrades and says so in the console on every open:
 *
 *   Cannot load system font: TimesNewRomanPS-BoldMT, installing it could help…
 *   Dependent image isn't ready yet
 *
 * A PDF is allowed to reference the 14 standard fonts without embedding them.
 * With no `standardFontDataUrl` pdf.js has to hunt for a local system font by
 * name, which is why that warning names the reader's *own* machine — and when it
 * doesn't find one the text is rendered in whatever it falls back to, so the same
 * document looks different on different computers. `standard_fonts/` is pdf.js's
 * own metrically-compatible set, so the document renders as authored everywhere.
 * `cmaps/` is the equivalent for CJK character encodings, and `wasm/` holds the
 * JBIG2/JPEG 2000 image decoders — the ones scanned PDFs use, and the ones the
 * "dependent image" warning is waiting on.
 *
 * Served from `public/pdfjs/` (copied out of the installed pdfjs-dist, version
 * pinned in package.json) rather than a CDN: these load on every document open,
 * so they belong on the same origin as the app, and the reader is meant to work
 * offline as a PWA. Frozen at module scope because react-pdf treats a new
 * `options` object as a reason to reload the document — a fresh literal per render
 * would put the viewer in a load loop.
 */
const PDF_OPTIONS = Object.freeze({
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  wasmUrl: "/pdfjs/wasm/",
});

const TOP_BAR_HEIGHT_PX = 60;
const RAIL_INSET_PX = 16;
const BOTTOM_BAR_HEIGHT_PX = 64;

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
 *
 * Two layouts, switchable in the footer and remembered as a reader preference
 * (reader-store's `pdfLayout`): one page at a time, or every page in one
 * continuous scroll (PdfScrollPages, virtualised). Both report the same thing —
 * a page number — so progress, resume and the end panel are layout-agnostic.
 *
 * Reading progress is tracked at page granularity (the `page` locator kind) —
 * the only structure a PDF has here, and all either layout can move by. Zoom
 * and intra-page scroll are deliberately not part of the position: a page is
 * what this viewer can restore exactly.
 */
export default function PdfDocumentView({
  materialId,
  title,
  sourceUrl,
  urlLocator,
  onClose,
}: {
  materialId: string;
  title: string;
  sourceUrl: string;
  /** `?page=` — a resume link's own target (see lib/reader/locator.ts's
   * buildResumeHref), which takes precedence over this device's saved
   * position. */
  urlLocator?: Locator;
  onClose?: () => void;
}) {
  const theme = useReaderStore((s) => s.theme);
  const layout = useReaderStore((s) => s.pdfLayout);
  const setLayout = useReaderStore((s) => s.setPdfLayout);
  // These preferences skip automatic persist hydration so the server and the
  // client's first paint agree (see reader-store) — this viewer is a route of
  // its own, so it has to pull them in itself, the way Reader.tsx does.
  useEffect(() => {
    useReaderStore.persist.rehydrate();
  }, []);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(ZOOM_DEFAULT);
  // The scroll container, as state rather than a ref: PdfScrollPages needs it as
  // an IntersectionObserver root, which is an effect dependency, and a plain ref
  // couldn't wake that effect when the element attaches.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  // Bumped on every *deliberate* move to a page (the footer's input and pager,
  // a resume landing) as opposed to one the reader scrolled to. That difference
  // is what continuous scroll needs: only a deliberate move should scroll the
  // container, or reporting the scrolled-to page would scroll again. See
  // PdfScrollPages' own `jumpSeq` comment.
  const [jumpSeq, setJumpSeq] = useState(0);

  const onLoadSuccess = useCallback(({ numPages }: { numPages: number }) => setNumPages(numPages), []);

  /** The one way the page changes other than by scrolling. */
  const goToPage = useCallback((page: number) => {
    setPageNumber(page);
    setJumpSeq((n) => n + 1);
  }, []);

  /** Switching layout keeps the reader on their page: the scroll layout mounts at
   * the top of the document and only moves for a jump, so the switch has to be
   * one. (The other direction needs nothing — the pager renders whatever
   * `pageNumber` already is.) */
  const changeLayout = useCallback(
    (next: PdfLayout) => {
      setLayout(next);
      setJumpSeq((n) => n + 1);
    },
    [setLayout]
  );

  // The page number is the tracked signal in *both* layouts — the pager sets it
  // directly, continuous scroll reports it from its own observer — so there's no
  // scroll listener to wire up here either way. Still the debounced `commit`
  // rather than an immediate write: paging or scrolling quickly through a run of
  // pages should record where the reader stopped, not every page they passed.
  // `commit` stays closed until resume has landed (see useDocumentProgress),
  // which is what stops the initial page-1 render from overwriting the saved
  // page.
  const { commit, getPositionNow } = useDocumentProgress({
    materialId,
    kind: "page",
    urlLocator,
    scale: numPages !== null ? { kind: "page", pageCount: numPages } : undefined,
    contentReady: numPages !== null,
    // Clamped: a saved page can outlive the document it pointed into (a
    // re-uploaded, shorter PDF), and react-pdf renders nothing at all for an
    // out-of-range page rather than failing visibly.
    apply: useCallback(
      (locator: { page: number }) => goToPage(Math.min(Math.max(1, locator.page), numPages ?? locator.page)),
      [numPages, goToPage]
    ),
    read: useCallback(() => ({ kind: "page" as const, page: pageNumber }), [pageNumber]),
  });
  useEffect(() => {
    commit({ kind: "page", page: pageNumber });
  }, [pageNumber, commit]);

  const isScroll = layout === "scroll";

  // Desktop keys: ↑/↓, PageUp/PageDown, Space and Home/End scroll; ←/→ turn
  // pages in the paged layout (the same thing the footer's chevrons do) and,
  // in continuous scroll — where the scroll *is* the page turn, which is why
  // the footer hides its chevrons there — move by a screenful instead, which
  // is what the hook does when it's handed no pager.
  const goPrev = useCallback(() => goToPage(Math.max(1, pageNumber - 1)), [goToPage, pageNumber]);
  const goNext = useCallback(
    () => goToPage(Math.min(numPages ?? pageNumber, pageNumber + 1)),
    [goToPage, pageNumber, numPages]
  );
  useDocumentKeyboard({
    scrollElement: scrollEl,
    onPrev: isScroll ? undefined : goPrev,
    onNext: isScroll ? undefined : goNext,
  });

  return (
    <div
      data-reader-theme={theme}
      className="w-full h-dvh box-border flex flex-col overflow-hidden relative font-sans"
      style={{ background: "var(--reader-bg)" }}
    >
      <ReaderHeader topBarHeightPx={TOP_BAR_HEIGHT_PX} railInsetPx={RAIL_INSET_PX} onClose={onClose} title={title} />
      <div
        ref={setScrollEl}
        className={`flex-1 min-h-0 overflow-auto ${isScroll ? "" : "flex justify-center"}`}
        style={{ paddingTop: TOP_BAR_HEIGHT_PX, paddingBottom: numPages !== null ? BOTTOM_BAR_HEIGHT_PX : 0 }}
      >
        <Document
          file={sourceUrl}
          onLoadSuccess={onLoadSuccess}
          options={PDF_OPTIONS}
          // A blank sheet, not a spinner — the same thing PdfScrollPages shows
          // for a page that hasn't painted, so opening a document and scrolling
          // through it speak one visual language instead of a spinner giving way
          // to sheets. See PdfScrollPages' own note on why no part of this viewer
          // spins.
          loading={
            <div className="flex justify-center py-6">
              <div
                className="h-[80vh] w-full max-w-[min(90vw,800px)] animate-pulse rounded-sm bg-[var(--reader-surface)] shadow-sm ring-1 ring-[var(--reader-border)]"
                aria-label="Loading document"
              />
            </div>
          }
          className={isScroll ? undefined : "py-6"}
        >
          {isScroll && numPages !== null ? (
            <PdfScrollPages
              numPages={numPages}
              scale={scale}
              scrollElement={scrollEl}
              currentPage={pageNumber}
              jumpSeq={jumpSeq}
              onVisiblePageChange={setPageNumber}
            />
          ) : (
            // `loading` overridden for the same reason PdfScrollPages overrides
            // it: react-pdf's default is a "Loading page…" message, and a page
            // turn that flashes one reads as a failed render rather than the few
            // frames of rasterising it actually is. The previous page simply
            // stays up until the next one paints.
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer
              loading={<span />}
              className="shadow-sm"
            />
          )}

          {/* In continuous scroll the bottom of the document is a real place, so
              the end screen simply sits there. The paged layout has no physical
              bottom, so it follows the final page instead — the only page from
              which the reader has actually seen the whole document. Either way
              it's a screen of its own; its own bottom padding clears the footer
              floating above it. */}
          {numPages !== null && (isScroll || pageNumber === numPages) && (
            <div className="mx-auto max-w-[640px] px-6">
              <DocumentEndPanel materialId={materialId} title={title} getCurrentPosition={getPositionNow} />
            </div>
          )}
        </Document>
      </div>
      {/* A page number stands in for a section title, since pages are the only
          "structure" a PDF has (see document-readers-spec.md § 3) — and, unlike
          EPUB's ChapterNavFooter, this is always visible rather than
          scroll-revealed: it carries the page input, which has to be reachable
          at any moment, not just at a section boundary. */}
      {numPages !== null && (
        <PdfPagerFooter
          pageNumber={pageNumber}
          numPages={numPages}
          layout={layout}
          scale={scale}
          onGoToPage={goToPage}
          onLayoutChange={changeLayout}
          onScaleChange={setScale}
        />
      )}
    </div>
  );
}
