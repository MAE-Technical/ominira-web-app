import type { Locator } from "@/lib/reader/locator";

/**
 * The props every single-document viewer's intercepted-route wrapper takes
 * (PdfDocumentModal, DocxDocumentModal, ArticleDocumentModal) — identical by
 * definition, since all three exist only to hand DocumentOverlayShell's
 * function `children` to their viewer from inside a client component (see
 * PdfDocumentModal's own doc comment).
 *
 * `slug` is the shell's own (it detects whether the intercepted route is
 * still live); `materialId` and `urlLocator` are the viewer's, for progress
 * tracking and resume.
 */
export type DocumentModalProps = {
  slug: string;
  materialId: string;
  title: string;
  sourceUrl: string;
  urlLocator?: Locator;
};
