"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export type UploadStage = "idle" | "parsing" | "uploading" | "done" | "error";

export type UploadedBook = { materialId: string; slug: string; title: string; author: string };

function isEpub(file: File): boolean {
  return file.type === "application/epub+zip" || /\.epub$/i.test(file.name);
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isDocx(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name)
  );
}

function fileBaseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "");
}

/**
 * The one parse -> validate -> upload -> create-materials-row pipeline
 * behind both HomeComposer's "Add a book" and the library's "add a book"
 * entry point (reader-uploads-spec.md § 3's DRY note) — implemented once
 * here, called from both places, rather than duplicated per surface.
 *
 * Parsing/validation happens client-side (EPUB via lib/book/epubParser,
 * PDF via lib/book/pdfParser, DOCX via lib/book/docxParser — metadata-only,
 * same as PDF, see that module's own doc comment) so a bad file fails fast,
 * before any upload —
 * `stage` distinguishes "parsing" from "uploading" so a caller can show a
 * different message ("Reading your file…" vs. "Uploading…") for each. The
 * server (`POST /api/materials/upload`) re-validates independently rather
 * than trusting this pass — this is fail-fast for the reader, not the
 * actual security boundary.
 *
 * Both parsers are dynamically imported inside `upload()`, not statically
 * at module scope — pdfjs-dist in particular branches on `typeof window`
 * at import time to pick a build (see pdfParser.ts's own comment), which
 * breaks under Next's SSR of this client component's module graph (neither
 * a real browser nor the Node test harness pdfParser.ts otherwise expects).
 * A dynamic import keeps that code out of the SSR bundle entirely — it only
 * ever loads once a reader actually picks a file, in the browser.
 */
export function useUploadBook() {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (
      file: File,
      opts: {
        visibility?: "personal" | "public";
        onStage?: (stage: UploadStage) => void;
        // Fired only when a cover is actually available to show — right
        // now that's PDF's rasterized first page (produced client-side by
        // parsePdf before upload even starts). EPUB and DOCX never call
        // this: EPUB's cover is only a path inside the parsed document, not
        // a standalone image the caller can preview; DOCX has no cover
        // concept at all. Callers should render no cover at all when this
        // never fires, not a placeholder.
        onThumbnail?: (blobUrl: string) => void;
        // Fired once the parsed (or filename-fallback) title/author guess is
        // known, right before the upload request actually goes out — the
        // reader's own edit affordance in the attachment preview seeds from
        // this rather than showing the raw filename the whole time. Editing
        // after this fires doesn't change what this upload sends (the POST
        // below already captured the guess); a caller applies a later edit
        // via `PATCH /api/materials/[materialId]` once `materialId` is known
        // instead, same as editing any other already-saved field.
        onMetadata?: (guess: { title: string; author: string }) => void;
      } = {}
    ): Promise<UploadedBook> => {
      const report = (next: UploadStage) => {
        setStage(next);
        opts.onStage?.(next);
      };
      setError(null);
      report("parsing");
      try {
        const form = new FormData();
        form.set("visibility", opts.visibility ?? "personal");
        form.set("sourceFile", file, file.name);

        if (isEpub(file)) {
          const { parseEpub } = await import("@/lib/book/epubParser");
          const buffer = await file.arrayBuffer();
          const { book } = await parseEpub(buffer, { slugHint: fileBaseName(file) });
          const title = book.metadata.title;
          const author = book.metadata.author || "";
          form.set("materialType", "book");
          form.set("documentJson", JSON.stringify(book));
          form.set("title", title);
          form.set("author", author);
          opts.onMetadata?.({ title, author });
        } else if (isPdf(file)) {
          const { parsePdf } = await import("@/lib/book/pdfParser");
          const buffer = await file.arrayBuffer();
          const { metadata, thumbnail } = await parsePdf(buffer);
          const title = metadata.title || fileBaseName(file);
          const author = metadata.author || "";
          form.set("materialType", "pdf");
          form.set("title", title);
          form.set("author", author);
          form.set("pageCount", String(metadata.pageCount));
          const thumbnailBlob = new Blob([thumbnail.slice().buffer], { type: "image/png" });
          form.set("thumbnail", thumbnailBlob, "thumbnail.png");
          opts.onThumbnail?.(URL.createObjectURL(thumbnailBlob));
          opts.onMetadata?.({ title, author });
        } else if (isDocx(file)) {
          const { parseDocx } = await import("@/lib/book/docxParser");
          const buffer = await file.arrayBuffer();
          const metadata = await parseDocx(buffer);
          const title = metadata.title || fileBaseName(file);
          const author = metadata.author || "";
          form.set("materialType", "docx");
          form.set("title", title);
          form.set("author", author);
          opts.onMetadata?.({ title, author });
        } else {
          throw new Error("Only EPUB, PDF, and DOCX files can be added to library.");
        }

        report("uploading");
        const result = await apiFetch<UploadedBook>("/materials/upload", { method: "POST", body: form });
        report("done");
        return result;
      } catch (err) {
        report("error");
        setError(err instanceof Error ? err.message : "Could not process this file.");
        throw err;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
  }, []);

  return { upload, stage, error, reset };
}
