"use client";

import { useEffect, useState } from "react";
import { useReaderStore } from "@/stores/reader-store";
import { useArticleTypographyStyle } from "@/lib/reader/useArticleTypographyStyle";
import ReaderHeader from "./ReaderHeader";
import Loader from "../Loader";

const TOP_BAR_HEIGHT_PX = 60;
const RAIL_INSET_PX = 16;

/**
 * DOCX body renderer — see document-readers-spec.md § 1/§ 3. Whole-document
 * only, no highlighting, no TOC: fetches `sourceUrl` client-side, runs it
 * through `mammoth.convertToHtml` (→ semantic HTML: headings/lists/bold/
 * italic), and renders it as a reflowing article via the shared
 * `.reader-article` typography (globals.css) + useArticleTypographyStyle
 * (the exact same reader-store-derived font-size/line-height/width/family
 * EPUB's own BookContent uses, not a separate approximation of it — see
 * that hook's own doc comment). Converts on every open rather than caching
 * the HTML — revisit only if real-world files prove slow.
 *
 * Mounts the same dual way Reader/PdfDocumentView already do: standalone
 * (app/read, app/reader) vs. wrapped in DocumentOverlayShell for the
 * intercepted route — `onClose` present picks the close-X, absent the
 * back-arrow.
 */
export default function DocxDocumentView({
  title,
  sourceUrl,
  onClose,
}: {
  title: string;
  sourceUrl: string;
  onClose?: () => void;
}) {
  const theme = useReaderStore((s) => s.theme);
  const typography = useArticleTypographyStyle();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ default: mammoth }, res] = await Promise.all([import("mammoth"), fetch(sourceUrl)]);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const { value } = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(value);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // sourceUrl never changes for a mounted viewer (a new material is a new
    // route, so a new component instance) — this effect is deliberately
    // run-once, not a resync-on-prop-change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-reader-theme={theme}
      className="w-full h-dvh box-border flex flex-col overflow-hidden relative font-sans"
      style={{ background: "var(--reader-bg)" }}
    >
      <ReaderHeader topBarHeightPx={TOP_BAR_HEIGHT_PX} railInsetPx={RAIL_INSET_PX} onClose={onClose} title={title} />
      <div className="flex-1 min-h-0 overflow-auto" style={{ paddingTop: TOP_BAR_HEIGHT_PX }}>
        <div className="mx-auto px-6 py-10" style={{ maxWidth: typography.maxWidth }}>
          {error ? (
            <p className="text-sm text-[var(--reader-text-muted)]">This document couldn&apos;t be opened.</p>
          ) : html === null ? (
            <Loader confined />
          ) : (
            <div
              className="reader-article select-text"
              style={{ fontFamily: typography.fontFamily, fontSize: typography.fontSize, lineHeight: typography.lineHeight }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
