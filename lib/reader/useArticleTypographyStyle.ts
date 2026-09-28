"use client";

import { useReaderStore, FONT_FAMILY_VARS, fontSizePxFromScale, lineHeightFromScale, contentWidthPxFromScale } from "@/stores/reader-store";

/**
 * The single source of reflowing-article typography — DocxDocumentView and
 * ArticleDocumentView both read this, rather than each hardcoding its own
 * font-size/line-height/width guess. Computes the exact same values
 * Reader.tsx derives for EPUB's own BookContent (same *FromScale functions,
 * same reader-store state), so a reader's font size/line spacing/width/
 * family preference — set once, in one place — applies identically no
 * matter which of the four formats they're reading. `.reader-article`
 * (globals.css) supplies the per-element rules (heading sizes, margins, in
 * `em` so they already scale off this hook's `fontSize`); this hook
 * supplies the base values those rules build on.
 */
export function useArticleTypographyStyle(): { fontFamily: string; fontSize: number; lineHeight: number; maxWidth: number } {
  const fontSizeScale = useReaderStore((s) => s.fontSizeScale);
  const lineSpacingScale = useReaderStore((s) => s.lineSpacingScale);
  const contentWidthScale = useReaderStore((s) => s.contentWidthScale);
  const fontFamily = useReaderStore((s) => s.fontFamily);

  return {
    fontFamily: FONT_FAMILY_VARS[fontFamily],
    fontSize: fontSizePxFromScale(fontSizeScale),
    lineHeight: lineHeightFromScale(lineSpacingScale),
    maxWidth: contentWidthPxFromScale(contentWidthScale),
  };
}
