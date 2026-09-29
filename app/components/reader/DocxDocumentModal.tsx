"use client";

import DocumentOverlayShell from "./DocumentOverlayShell";
import DocxDocumentView from "./DocxDocumentView";
import type { DocumentModalProps } from "./documentModalProps";

/** The intercepted-route wrapper for DocxDocumentView — see
 * PdfDocumentModal's doc comment for why this thin client wrapper exists
 * (a Server Component page can't pass DocumentOverlayShell's function
 * children directly). */
export default function DocxDocumentModal({ slug, materialId, title, sourceUrl, urlLocator }: DocumentModalProps) {
  return (
    <DocumentOverlayShell slug={slug}>
      {(onClose) => (
        <DocxDocumentView materialId={materialId} title={title} sourceUrl={sourceUrl} urlLocator={urlLocator} onClose={onClose} />
      )}
    </DocumentOverlayShell>
  );
}
