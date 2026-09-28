"use client";

import DocumentOverlayShell from "./DocumentOverlayShell";
import DocxDocumentView from "./DocxDocumentView";

/** The intercepted-route wrapper for DocxDocumentView — see
 * PdfDocumentModal's doc comment for why this thin client wrapper exists
 * (a Server Component page can't pass DocumentOverlayShell's function
 * children directly). */
export default function DocxDocumentModal({ slug, title, sourceUrl }: { slug: string; title: string; sourceUrl: string }) {
  return (
    <DocumentOverlayShell slug={slug}>
      {(onClose) => <DocxDocumentView title={title} sourceUrl={sourceUrl} onClose={onClose} />}
    </DocumentOverlayShell>
  );
}
