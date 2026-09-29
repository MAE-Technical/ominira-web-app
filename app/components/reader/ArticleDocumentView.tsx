"use client";

import { useReaderStore } from "@/stores/reader-store";
import type { Locator } from "@/lib/reader/locator";
import { useArticleProgress } from "@/lib/reader/useArticleProgress";
import { useDocumentKeyboard } from "@/lib/reader/useDocumentKeyboard";
import DocumentEndPanel from "./DocumentEndPanel";
import { useArticleTypographyStyle } from "@/lib/reader/useArticleTypographyStyle";
import ReaderHeader from "./ReaderHeader";

const TOP_BAR_HEIGHT_PX = 60;
const RAIL_INSET_PX = 16;

/**
 * Web-page body renderer — see document-readers-spec.md § 1/§ 3. Renders
 * the *already* Readability-extracted HTML (never re-fetches or re-extracts
 * the live page at read time — that happened once, server-side, at
 * ingestion), fetched server-side by loadReaderMaterial alongside the rest
 * of the material row, so it arrives as a prop exactly like EPUB's
 * BookDocument — no client-side loading gate before the article can render.
 * Renders it the same reflowing-article way as DocxDocumentView, via the
 * shared `.reader-article` typography + useArticleTypographyStyle (see that
 * hook's own doc comment — the same reader-store-derived values EPUB's
 * BookContent uses). The "View original" link (Brave-Speedreader-style)
 * lives in ReaderHeader itself via its `sourceUrl` prop, since the extracted
 * copy is deliberately a stripped derivative, not a replacement for the
 * source.
 *
 * Reading progress is tracked by block index, the same way DocxDocumentView
 * does it (see useArticleProgress) — the two render identically, so they share
 * one implementation rather than each approximating it.
 */
export default function ArticleDocumentView({
  materialId,
  title,
  sourceUrl,
  articleHtml,
  urlLocator,
  onClose,
}: {
  materialId: string;
  title: string;
  sourceUrl: string;
  articleHtml: string;
  /** `?block=` — a resume link's own target, which takes precedence over this
   * device's saved position (see buildResumeHref). */
  urlLocator?: Locator;
  onClose?: () => void;
}) {
  const theme = useReaderStore((s) => s.theme);
  const typography = useArticleTypographyStyle();
  const { scrollRef, contentRef, scrollElement, getPositionNow } = useArticleProgress({ materialId, urlLocator });
  // Arrows/PageUp/PageDown/Space/Home/End scroll the document on desktop — see
  // the hook; with no pages to turn, ←/→ move by a screenful.
  useDocumentKeyboard({ scrollElement });

  return (
    <div
      data-reader-theme={theme}
      className="w-full h-dvh box-border flex flex-col overflow-hidden relative font-sans"
      style={{ background: "var(--reader-bg)" }}
    >
      <ReaderHeader
        topBarHeightPx={TOP_BAR_HEIGHT_PX}
        railInsetPx={RAIL_INSET_PX}
        onClose={onClose}
        title={title}
        sourceUrl={sourceUrl}
      />
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto" style={{ paddingTop: TOP_BAR_HEIGHT_PX }}>
        <div className="mx-auto px-6 py-10" style={{ maxWidth: typography.maxWidth }}>
          <div
            ref={contentRef}
            className="reader-article select-text"
            style={{ fontFamily: typography.fontFamily, fontSize: typography.fontSize, lineHeight: typography.lineHeight }}
            dangerouslySetInnerHTML={{ __html: articleHtml }}
          />
          {/* The bottom of the scroll *is* the end of the document here — no
              "have they reached it" test needed, unlike a paginated viewer. */}
          <DocumentEndPanel materialId={materialId} title={title} getCurrentPosition={getPositionNow} />
        </div>
      </div>
    </div>
  );
}
