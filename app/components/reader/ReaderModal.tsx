"use client";

import Reader from "./Reader";
import DocumentOverlayShell from "./DocumentOverlayShell";
import type { BookDocument } from "@/lib/book/schema";

/** EPUB's intercepted-route viewer — all overlay chrome (scrim/panel/
 * animation/close/z-layering) lives in DocumentOverlayShell now; this just
 * wires Reader up as the shell's body. See DocumentOverlayShell's own doc
 * comment for the shell's behavior. */
export default function ReaderModal({
  book,
  materialId,
  eagerSectionIds,
  targetSectionId,
  targetPassageId,
  targetNoteId,
  targetGeneralNoteId,
  targetThreadId,
}: {
  book: BookDocument;
  materialId: string;
  /** Which section(s) of `book` already carry real prose text, server-side
   * — see toBookDocument.ts's own doc comment. Threaded straight through to
   * Reader/useProgressiveText, unchanged. */
  eagerSectionIds: string[];
  targetSectionId?: string;
  targetPassageId?: string;
  targetNoteId?: string;
  targetGeneralNoteId?: string;
  targetThreadId?: string;
}) {
  return (
    <DocumentOverlayShell slug={book.slug}>
      {(onClose) => (
        <Reader
          book={book}
          materialId={materialId}
          eagerSectionIds={eagerSectionIds}
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
