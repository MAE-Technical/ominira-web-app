"use client";

import DocumentOverlayShell from "./DocumentOverlayShell";
import ArticleDocumentView from "./ArticleDocumentView";
import type { DocumentModalProps } from "./documentModalProps";

/** The intercepted-route wrapper for ArticleDocumentView — see
 * PdfDocumentModal's doc comment for why this thin client wrapper exists
 * (a Server Component page can't pass DocumentOverlayShell's function
 * children directly). */
export default function ArticleDocumentModal({
  slug,
  materialId,
  title,
  sourceUrl,
  urlLocator,
  articleHtml,
}: DocumentModalProps & { articleHtml: string }) {
  return (
    <DocumentOverlayShell slug={slug}>
      {(onClose) => (
        <ArticleDocumentView
          materialId={materialId}
          title={title}
          sourceUrl={sourceUrl}
          articleHtml={articleHtml}
          urlLocator={urlLocator}
          onClose={onClose}
        />
      )}
    </DocumentOverlayShell>
  );
}
