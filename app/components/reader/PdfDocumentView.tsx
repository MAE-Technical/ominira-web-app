"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { PdfErrorCode, type PdfEngine } from "@embedpdf/models";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import {
  GlobalPointerProvider,
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { Scroller, ScrollPluginPackage, useScroll, useScrollCapability } from "@embedpdf/plugin-scroll/react";
import type { PageLayout } from "@embedpdf/plugin-scroll";
import { SelectionLayer, SelectionPluginPackage, useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { TilingLayer, TilingPluginPackage } from "@embedpdf/plugin-tiling/react";
import { useViewportElement, Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomGestureWrapper, ZoomMode, ZoomPluginPackage, useZoom } from "@embedpdf/plugin-zoom/react";
import { usePdfEngine } from "@/lib/pdf/pdfiumEngine";
import { PdfFetchError, usePdfBytes } from "@/lib/pdf/usePdfBytes";
import { useReaderStore, type PdfLayout } from "@/stores/reader-store";
import type { Locator } from "@/lib/reader/locator";
import { useDocumentProgress } from "@/lib/reader/useDocumentProgress";
import { useDocumentKeyboard, type DocumentPager } from "@/lib/reader/useDocumentKeyboard";
import DocumentEndPanel from "./DocumentEndPanel";
import PdfPagerFooter from "./PdfPagerFooter";
import ReaderHeader from "./ReaderHeader";

const TOP_BAR_HEIGHT_PX = 60;
const RAIL_INSET_PX = 16;
const BOTTOM_BAR_HEIGHT_PX = 64;

/** One document per viewer, so one fixed id — EmbedPDF is multi-document and
 * addresses everything by id. */
const DOCUMENT_ID = "pdf";

const VIEWPORT_GAP_PX = 12;
const PAGE_GAP_PX = 16;

/** Zoom bounds, relative to the page's own size (1 = 100%). Wider than the old
 * 50–200% because tiling makes deep zoom cheap: only the visible part of a page
 * is ever rendered at full resolution, however far in the reader goes. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** Each layout's "fits the screen" zoom. Paged fits the whole page — one page,
 * one screen, which is what the page-by-page layout promises. Continuous scroll
 * fits the width but never enlarges past 100%: on a phone that's a page exactly
 * as wide as the screen (the old viewer rendered it at its full 612px and let it
 * overflow), on a desktop it's the page at its real size. */
function fitZoomFor(layout: PdfLayout) {
  return layout === "paged" ? ZoomMode.FitPage : ZoomMode.Automatic;
}

/** How each page is painted: a low-resolution image of the whole page, instantly
 * available as the page scrolls in, under full-resolution tiles covering only the
 * part of it on screen. Rendering whole pages at screen resolution is what broke
 * the old viewer on phones — at a 3x pixel ratio one page is ~17MB of bitmap, and
 * two dozen of them blew straight through iOS Safari's canvas memory limit, after
 * which pages came up blank. Tiles keep full-resolution memory at roughly one
 * screenful however many pages are loaded and however far the reader zooms. */
const BASE_LAYER_SCALE = 0.5;

/** `overscroll-behavior: contain` so reaching either end of the document doesn't
 * chain into scrolling (or pull-to-refresh on) the page behind the reader.
 * Horizontal centring is EmbedPDF's own (the zoom wrapper sets its margin). */
const viewportStyle = { background: "var(--reader-bg)", overscrollBehavior: "contain" } as const;

/** Honours a reader's reduced-motion setting for every page jump. */
function jumpBehavior() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
}

/**
 * PDF body renderer — see document-readers-spec.md § 1/§ 3. Whole-document
 * only: page navigation is the only "structure" here, no TOC. Fetches straight
 * from `sourceUrl` (a public Storage URL) — no server round trip beyond the
 * material row already loaded by `loadReaderMaterial`.
 *
 * Rendered by EmbedPDF on PDFium (Chrome's own PDF engine, compiled to
 * WebAssembly and run in a worker) rather than pdf.js. Pages arrive as images
 * rather than live canvases, so there is no canvas memory to exhaust, and PDFium
 * never falls back to the device's installed fonts, so a document looks the same
 * on every phone. See lib/pdf/pdfiumEngine.ts for the engine's lifecycle.
 *
 * Standalone (app/read, app/reader) and overlay (app/@modal/(.)read, via
 * DocumentOverlayShell) mount this the same way Reader/ReaderModal already
 * split: `onClose` present picks the close-X, absent picks the back-arrow —
 * same convention as ReaderHeader.
 *
 * Two layouts, switchable in the footer and remembered as a reader preference
 * (reader-store's `pdfLayout`): page by page, or one continuous scroll. Both are
 * the same vertical stack of pages — paged fits a whole page to the screen and
 * snaps to one page at a time — so they report the same thing, a page number,
 * and progress, resume and the end panel are layout-agnostic.
 *
 * Reading progress is tracked at page granularity (the `page` locator kind).
 * Zoom and intra-page scroll are deliberately not part of the position: a page
 * is what this viewer can restore exactly.
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
  // These preferences skip automatic persist hydration so the server and the
  // client's first paint agree (see reader-store) — this viewer is a route of
  // its own, so it has to pull them in itself, the way Reader.tsx does.
  useEffect(() => {
    useReaderStore.persist.rehydrate();
  }, []);

  // Bumped by Retry: refetches the document and, if the engine was what failed,
  // starts a fresh one.
  const [generation, setGeneration] = useState(0);
  const { engine, error: engineError, discard: discardEngine } = usePdfEngine(generation);
  const { buffer, error: fetchError } = usePdfBytes(sourceUrl, generation);

  const retry = useCallback(
    (engineFailed: boolean) => {
      if (engineFailed) discardEngine();
      setGeneration((n) => n + 1);
    },
    [discardEngine]
  );

  let body: ReactNode;
  if (fetchError) {
    const isNotPdf = fetchError instanceof PdfFetchError && fetchError.kind === "not-pdf";
    body = (
      <PdfOpenError
        message={fetchError.message}
        onRetry={isNotPdf ? undefined : () => retry(false)}
        cause={fetchError}
      />
    );
  } else if (engineError) {
    body = (
      <PdfOpenError
        message="The PDF viewer couldn't start. Check your connection and try again."
        onRetry={() => retry(true)}
        cause={engineError}
      />
    );
  } else if (engine && buffer) {
    body = (
      <PdfReader
        // A new engine or new bytes is a new reader: EmbedPDF's plugins are bound
        // to both for their whole lifetime.
        key={generation}
        engine={engine}
        buffer={buffer}
        materialId={materialId}
        title={title}
        urlLocator={urlLocator}
        onRetry={retry}
      />
    );
  } else {
    body = <LoadingSheet />;
  }

  return (
    <div
      data-reader-theme={theme}
      className="w-full h-dvh box-border overflow-hidden relative font-sans"
      style={{ background: "var(--reader-bg)" }}
    >
      <ReaderHeader topBarHeightPx={TOP_BAR_HEIGHT_PX} railInsetPx={RAIL_INSET_PX} onClose={onClose} title={title} />
      <div className="absolute inset-x-0 bottom-0" style={{ top: TOP_BAR_HEIGHT_PX }}>
        {body}
      </div>
    </div>
  );
}

/**
 * The viewer proper, once the engine and the document's bytes are both in hand.
 * Owns the EmbedPDF plugin registry, which is built once per mount: the plugins
 * are bound to one engine and one document for their whole lifetime.
 */
function PdfReader({
  engine,
  buffer,
  materialId,
  title,
  urlLocator,
  onRetry,
}: {
  engine: PdfEngine;
  buffer: ArrayBuffer;
  materialId: string;
  title: string;
  urlLocator?: Locator;
  onRetry: (engineFailed: boolean) => void;
}) {
  // Read once, at registration: the initial zoom is the layout's own fit, set
  // from the start rather than corrected after a first render at the wrong one.
  // Later layout changes go through PdfReaderBody's effect instead — rebuilding
  // the plugins would reopen the document.
  const [layoutAtMount] = useState(() => useReaderStore.getState().pdfLayout);

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        maxDocuments: 1,
        initialDocuments: [{ buffer, name: title, documentId: DOCUMENT_ID }],
      }),
      createPluginRegistration(ViewportPluginPackage, { viewportGap: VIEWPORT_GAP_PX }),
      createPluginRegistration(ScrollPluginPackage, { defaultPageGap: PAGE_GAP_PX, defaultBufferSize: 2 }),
      // Annotations and form fields drawn into the page image, as they appear in
      // any other PDF viewer — without these, a document's existing highlights,
      // stamps and filled-in fields would simply be missing.
      createPluginRegistration(RenderPluginPackage, { withAnnotations: true, withForms: true }),
      createPluginRegistration(TilingPluginPackage, { tileSize: 768, overlapPx: 2.5, extraRings: 0 }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: fitZoomFor(layoutAtMount),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      // On touch devices a drag scrolls (natively, with momentum) rather than
      // selecting text — the default pointer mode claims every touch on a page
      // for selection, which leaves a phone unable to scroll at all.
      createPluginRegistration(PanPluginPackage, { defaultMode: "mobile" }),
      createPluginRegistration(SelectionPluginPackage, { marquee: { enabled: false } }),
    ],
    [buffer, title, layoutAtMount]
  );

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      {({ pluginsReady, documents }) => {
        const doc = documents[DOCUMENT_ID];
        if (!pluginsReady || !doc || doc.status === "loading") return <LoadingSheet />;
        if (doc.status === "error") {
          const code = doc.errorCode;
          if (code === PdfErrorCode.Password) {
            return <PdfOpenError message="This PDF is password-protected, so it can't be opened here." />;
          }
          const engineFailed = code === PdfErrorCode.Initialization;
          return (
            <PdfOpenError
              message={
                engineFailed
                  ? "The PDF viewer couldn't start. Check your connection and try again."
                  : "This PDF couldn't be opened. The file may be damaged."
              }
              onRetry={() => onRetry(engineFailed)}
              cause={{ code, error: doc.error, details: doc.errorDetails }}
            />
          );
        }
        if (!doc.document?.pageCount) {
          return <PdfOpenError message="This PDF has no pages to show." />;
        }
        return (
          <PdfReaderBody materialId={materialId} title={title} urlLocator={urlLocator} initialFitLayout={layoutAtMount} />
        );
      }}
    </EmbedPDF>
  );
}

/** One page: the low-resolution base image, the full-resolution tiles over the
 * visible part of it, and the text-selection layer on top. */
function renderPdfPage({ pageIndex }: PageLayout) {
  return (
    <PagePointerProvider documentId={DOCUMENT_ID} pageIndex={pageIndex} className="bg-white shadow-sm">
      <RenderLayer documentId={DOCUMENT_ID} pageIndex={pageIndex} scale={BASE_LAYER_SCALE} className="pointer-events-none block" />
      <TilingLayer documentId={DOCUMENT_ID} pageIndex={pageIndex} className="pointer-events-none" />
      <SelectionLayer documentId={DOCUMENT_ID} pageIndex={pageIndex} textStyle={{ background: "var(--reader-highlight)" }} />
    </PagePointerProvider>
  );
}

/**
 * One invisible snap point per page, for the paged layout.
 *
 * The pages themselves can't be the snap points: EmbedPDF only mounts the pages
 * near the viewport, and a browser can only snap to elements that exist — so on
 * open (and on any jump to a page not yet mounted) the nearest snap point was
 * the end panel, and the reader was flung to the end of the document. These
 * markers exist for every page from the start, placed from the scroll plugin's
 * own layout (the same numbers it positions the pages with), and re-placed
 * whenever that layout changes — a zoom, a resize.
 */
function PageSnapPoints() {
  const { provides: scroll } = useScroll(DOCUMENT_ID);
  const { state: zoomState } = useZoom(DOCUMENT_ID);
  const [items, setItems] = useState(() => scroll?.getLayout().virtualItems ?? []);
  // Replays the current layout on subscribe, so this also covers mounting after
  // the layout was first computed.
  useEffect(() => scroll?.onLayoutChange((layout) => setItems(layout.virtualItems)), [scroll]);

  const scale = zoomState.currentZoomLevel;
  return (
    <>
      {items.map((item) => (
        <div
          key={item.id}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 w-px"
          style={{
            top: item.y * scale,
            height: item.height * scale,
            scrollSnapAlign: "center",
            // A fast flick still stops at the next page instead of sailing past
            // several.
            scrollSnapStop: "always",
          }}
        />
      ))}
    </>
  );
}

/** Hands the Viewport's scrolling element up to the reader — the Viewport keeps
 * its own ref and doesn't forward one, but exposes it to its children. */
function ViewportElementReporter({ onElement }: { onElement: (el: HTMLDivElement | null) => void }) {
  const ref = useViewportElement();
  useEffect(() => {
    onElement(ref?.current ?? null);
    return () => onElement(null);
  }, [ref, onElement]);
  return null;
}

function PdfReaderBody({
  materialId,
  title,
  urlLocator,
  initialFitLayout,
}: {
  materialId: string;
  title: string;
  urlLocator?: Locator;
  /** The layout the zoom plugin was registered to fit. */
  initialFitLayout: PdfLayout;
}) {
  const layout = useReaderStore((s) => s.pdfLayout);
  const setLayout = useReaderStore((s) => s.setPdfLayout);
  const isPaged = layout === "paged";

  const { provides: scroll, state: scrollState } = useScroll(DOCUMENT_ID);
  const { provides: scrollCapability } = useScrollCapability();
  const { provides: zoom, state: zoomState } = useZoom(DOCUMENT_ID);
  const { provides: selection } = useSelectionCapability();

  const numPages = scrollState.totalPages;
  // Scrolled past the last page into the end panel, the scroll plugin sees no
  // page on screen and falls back to reporting page 1 — which would both show
  // "1 / 141" there and save page 1 as where the reader stopped. The reader has
  // seen the whole document at that point, so it's the last page.
  const [pastLastPage, setPastLastPage] = useState(false);
  useEffect(() => {
    if (!scroll) return;
    return scroll.onScroll((metrics) => setPastLastPage(metrics.visiblePages.length === 0 && metrics.scrollOffset.y > 0));
  }, [scroll]);
  const pageNumber = pastLastPage && numPages > 0 ? numPages : Math.max(1, scrollState.currentPage);

  // The Viewport's scrolling element, for the keyboard hook; state rather than a
  // ref because that hook binds to it in an effect.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  // Pages have been laid out and can be scrolled to. The event replays to late
  // subscribers, so it can't be missed by subscribing after the Scroller mounts.
  const [layoutReady, setLayoutReady] = useState(false);
  useEffect(() => {
    if (!scrollCapability) return;
    return scrollCapability.onLayoutReady((event) => {
      if (event.documentId === DOCUMENT_ID) setLayoutReady(true);
    });
  }, [scrollCapability]);

  /** Paged layout centres the page it lands on (that's where its snap point is);
   * continuous scroll puts the page's top at the top of the screen. */
  const scrollToPage = useCallback(
    (page: number, behavior: "instant" | "smooth") => {
      if (!scroll) return;
      const clamped = Math.min(Math.max(1, page), numPages || 1);
      scroll.scrollToPage({ pageNumber: clamped, behavior, ...(isPaged ? { alignY: 50 } : {}) });
    },
    [scroll, numPages, isPaged]
  );

  const goToPage = useCallback((page: number) => scrollToPage(page, jumpBehavior()), [scrollToPage]);

  /** Next/previous page. Counted from the page a jump still in flight is heading
   * to, not the one currently reported — otherwise two quick presses would both
   * aim for the same page, since the current page only changes once the scroll
   * arrives. */
  const stepPage = useCallback(
    (delta: -1 | 1) => {
      if (!scroll) return;
      const change = scroll.getPageChangeState();
      goToPage((change.isChanging ? change.targetPage : scroll.getCurrentPage()) + delta);
    },
    [scroll, goToPage]
  );

  // A layout switch re-fits the zoom to the new layout and keeps the reader on
  // their page. Compared against the layout the zoom was last fitted for rather
  // than run on every change of `layout`, which also covers the stored
  // preference arriving after the viewer opened.
  const fittedLayoutRef = useRef(initialFitLayout);
  const pageRef = useRef(pageNumber);
  useEffect(() => {
    pageRef.current = pageNumber;
  }, [pageNumber]);
  useEffect(() => {
    if (!zoom || !layoutReady || fittedLayoutRef.current === layout) return;
    fittedLayoutRef.current = layout;
    const page = pageRef.current;
    zoom.requestZoom(fitZoomFor(layout));
    // After the zoom's own re-layout has landed.
    const frame = requestAnimationFrame(() => scrollToPage(page, "instant"));
    return () => cancelAnimationFrame(frame);
  }, [layout, layoutReady, zoom, scrollToPage]);

  // The page number is the tracked signal in both layouts, reported by the
  // scroll plugin as the reader moves. Still the debounced `commit` rather than
  // an immediate write: scrolling quickly through a run of pages should record
  // where the reader stopped, not every page they passed. `commit` stays closed
  // until resume has landed (see useDocumentProgress), which is what stops the
  // initial page-1 report from overwriting the saved page.
  const { commit, getPositionNow } = useDocumentProgress({
    materialId,
    kind: "page",
    urlLocator,
    scale: numPages > 0 ? { kind: "page", pageCount: numPages } : undefined,
    contentReady: layoutReady && numPages > 0,
    // Clamped (in scrollToPage): a saved page can outlive the document it
    // pointed into — a re-uploaded, shorter PDF.
    apply: useCallback((locator: { page: number }) => scrollToPage(locator.page, "instant"), [scrollToPage]),
    read: useCallback(() => ({ kind: "page" as const, page: pageNumber }), [pageNumber]),
  });
  useEffect(() => {
    if (layoutReady) commit({ kind: "page", page: pageNumber });
  }, [pageNumber, layoutReady, commit]);

  const pager = useMemo<DocumentPager | undefined>(
    () =>
      isPaged
        ? {
            prev: () => stepPage(-1),
            next: () => stepPage(1),
            first: () => goToPage(1),
            last: () => goToPage(numPages),
          }
        : undefined,
    [isPaged, stepPage, goToPage, numPages]
  );
  useDocumentKeyboard({ scrollElement: scrollEl, pager });

  // ⌘/Ctrl+C copies the PDF text selection. Only while there is one: copying an
  // empty selection would wipe whatever the reader last put on the clipboard.
  useEffect(() => {
    if (!selection) return;
    const scope = selection.forDocument(DOCUMENT_ID);
    let hasSelection = false;
    const unsubscribe = scope.onSelectionChange((range) => {
      hasSelection = !!range;
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "c" || !hasSelection) return;
      // A native selection (the page-number field, say) takes precedence.
      if (window.getSelection()?.toString()) return;
      scope.copyToClipboard();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selection]);

  const zoomLevel = zoomState.currentZoomLevel;
  const zoomInfo = {
    percent: Math.round(zoomLevel * 100),
    isCustom: typeof zoomState.zoomLevel === "number",
    canZoomIn: zoomLevel < MAX_ZOOM - 0.001,
    canZoomOut: zoomLevel > MIN_ZOOM + 0.001,
  };
  // Paged snaps to one page per screen only at the layout's own fit. Zoomed in
  // past it, a page no longer fits a screen and the reader needs to pan around
  // it freely — and a mandatory snap live while a zoom resizes every page
  // re-snaps mid-resize to whatever is nearest, which flung the reader to the
  // end of the document. Resetting the zoom brings the snapping back.
  const snapping = isPaged && !zoomInfo.isCustom;

  return (
    <>
      <div className="absolute inset-x-0 top-0" style={{ bottom: `calc(${BOTTOM_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom))` }}>
        <GlobalPointerProvider documentId={DOCUMENT_ID}>
          <Viewport
            documentId={DOCUMENT_ID}
            style={snapping ? { ...viewportStyle, scrollSnapType: "y mandatory" } : viewportStyle}
          >
            <ViewportElementReporter onElement={setScrollEl} />
            {/* Pinch and ⌘/Ctrl-scroll zoom are the viewer's own: it re-renders sharp
                at the new zoom, instead of the browser magnifying a bitmap — the
                "blurry text" half of the old viewer's problem. */}
            <ZoomGestureWrapper documentId={DOCUMENT_ID} style={{ position: "relative" }}>
              <Scroller documentId={DOCUMENT_ID} renderPage={renderPdfPage} />
              {snapping && <PageSnapPoints />}
            </ZoomGestureWrapper>
            {/* The bottom of the document is a real place in both layouts, so the
                end screen simply sits after the last page (a snap point of its own
                when paged). Sticky to the left edge so it stays in view when a
                zoomed-in document is scrolled sideways. */}
            <div
              className="sticky left-0 w-full text-left"
              style={snapping ? { scrollSnapAlign: "end" } : undefined}
            >
              <div className="mx-auto max-w-[640px] px-6">
                <DocumentEndPanel materialId={materialId} title={title} getCurrentPosition={getPositionNow} />
              </div>
            </div>
          </Viewport>
        </GlobalPointerProvider>
      </div>
      {/* A page number stands in for a section title, since pages are the only
          "structure" a PDF has (see document-readers-spec.md § 3) — and, unlike
          EPUB's ChapterNavFooter, this is always visible rather than
          scroll-revealed: it carries the page input, which has to be reachable
          at any moment, not just at a section boundary. */}
      {numPages > 0 && (
        <PdfPagerFooter
          pageNumber={pageNumber}
          numPages={numPages}
          layout={layout}
          zoom={zoomInfo}
          onGoToPage={goToPage}
          onStepPage={stepPage}
          onLayoutChange={setLayout}
          onZoomIn={() => zoom?.zoomIn()}
          onZoomOut={() => zoom?.zoomOut()}
          onZoomReset={() => zoom?.requestZoom(fitZoomFor(layout))}
        />
      )}
    </>
  );
}

/** A blank sheet, not a spinner — the same thing an unpainted page is, so opening
 * a document and paging through it speak one visual language. */
function LoadingSheet() {
  return (
    <div className="flex h-full justify-center px-4 py-6">
      <div
        className="h-[80vh] w-full max-w-[min(90vw,800px)] animate-pulse rounded-sm bg-[var(--reader-surface)] shadow-sm ring-1 ring-[var(--reader-border)]"
        aria-label="Loading document"
      />
    </div>
  );
}

function PdfOpenError({ message, onRetry, cause }: { message: string; onRetry?: () => void; cause?: unknown }) {
  // The reader sees a plain sentence; the console gets what actually went wrong.
  useEffect(() => {
    if (cause !== undefined) console.error("[pdf reader]", message, cause);
  }, [message, cause]);
  return (
    <div className="flex h-full items-center justify-center p-6" role="alert">
      <div className="max-w-sm text-center">
        <p className="text-[15px] font-semibold text-[var(--reader-text)]">Couldn&apos;t open this PDF</p>
        <p className="mt-2 text-[13px] text-[var(--reader-text-muted)]">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 cursor-pointer rounded-md border border-[var(--reader-border)] bg-transparent px-4 py-2 text-[13px] font-semibold text-[var(--reader-text)] transition-colors hover:bg-[var(--reader-surface-hover)]"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
