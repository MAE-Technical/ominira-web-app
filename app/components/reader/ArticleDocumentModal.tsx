"use client";

import DocumentOverlayShell from "./DocumentOverlayShell";
import ArticleDocumentView from "./ArticleDocumentView";

/** The intercepted-route wrapper for ArticleDocumentView — see
 * PdfDocumentModal's doc comment for why this thin client wrapper exists
 * (a Server Component page can't pass DocumentOverlayShell's function
 * children directly). */
export default function ArticleDocumentModal({
  slug,
  title,
  sourceUrl,
  articleHtml,
}: {
  slug: string;
  title: string;
  sourceUrl: string;
  articleHtml: string;
}) {
  return (
    <DocumentOverlayShell slug={slug}>
      {(onClose) => <ArticleDocumentView title={title} sourceUrl={sourceUrl} articleHtml={articleHtml} onClose={onClose} />}
    </DocumentOverlayShell>
  );
}
