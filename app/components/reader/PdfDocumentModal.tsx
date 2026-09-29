"use client";

import DocumentOverlayShell from "./DocumentOverlayShell";
import PdfDocumentLoader from "./PdfDocumentLoader";
import type { DocumentModalProps } from "./documentModalProps";

/**
 * The intercepted-route wrapper for PdfDocumentView — mirrors ReaderModal's
 * own split (see that component's doc comment) for the same reason: the
 * @modal/(.)read/[slug] page is a Server Component, and DocumentOverlayShell's
 * `children` render-prop is a function — functions can't cross the server/
 * client boundary in a props payload. Wrapping the render-prop call inside
 * this "use client" component keeps it entirely client-to-client, which is
 * fine; the Server Component page only ever passes this plain, serializable
 * props (no function values).
 */
export default function PdfDocumentModal({ slug, materialId, title, sourceUrl, urlLocator }: DocumentModalProps) {
  return (
    <DocumentOverlayShell slug={slug}>
      {(onClose) => (
        <PdfDocumentLoader materialId={materialId} title={title} sourceUrl={sourceUrl} urlLocator={urlLocator} onClose={onClose} />
      )}
    </DocumentOverlayShell>
  );
}
