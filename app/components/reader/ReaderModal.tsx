"use client";

import BookReader from "./BookReader";
import DocumentOverlayShell from "./DocumentOverlayShell";
import type { BookMetadata } from "@/lib/book/schema";

/** EPUB's intercepted-route viewer — all overlay chrome (scrim/panel/
 * animation/close/z-layering) lives in DocumentOverlayShell now; this just
 * wires BookReader up as the shell's body. See DocumentOverlayShell's own doc
 * comment for the shell's behavior. */
export default function ReaderModal({
  slug,
  metadata,
  contentBase,
  materialId,
  targetSectionId,
  targetPassageId,
  targetNoteId,
  targetGeneralNoteId,
  targetThreadId,
}: {
  slug: string;
  metadata: BookMetadata;
  contentBase: string;
  materialId: string;
  targetSectionId?: string;
  targetPassageId?: string;
  targetNoteId?: string;
  targetGeneralNoteId?: string;
  targetThreadId?: string;
}) {
  return (
    <DocumentOverlayShell slug={slug}>
      {(onClose) => (
        <BookReader
          metadata={metadata}
          contentBase={contentBase}
          materialId={materialId}
          targetSectionId={targetSectionId}
          targetPassageId={targetPassageId}
          targetNoteId={targetNoteId}
          targetGeneralNoteId={targetGeneralNoteId}
          targetThreadId={targetThreadId}
          onClose={onClose}
        />
      )}
    </DocumentOverlayShell>
  );
}
