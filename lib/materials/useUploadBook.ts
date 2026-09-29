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

// Cheap sniff over the cover asset's own path extension — good enough to
// pick a Blob `type` for a same-origin object URL preview, not a claim
// about the file's real content (nothing here re-validates the bytes; the
// browser just renders whatever `<img>` can decode, same tolerance normal
// EPUB readers give this).
function guessImageMime(path: string): string {
  if (/\.(jpe?g)$/i.test(path)) return "image/jpeg";
  if (/\.gif$/i.test(path)) return "image/gif";
  if (/\.svg$/i.test(path)) return "image/svg+xml";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/png";
}

/**
 * PUTs one blob to a Storage signed upload URL. XHR rather than fetch() for
 * upload progress — fetch still can't report it, and a 200 MB admin upload
 * needs more than a spinner.
 */
function putToSignedUrl(url: string, body: Blob, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", body.type || "application/octet-stream");
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "This file is too large to upload." : "Upload failed. Please try again."));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(body);
  });
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
        // Fired only when a cover is actually available to show: PDF's
        // rasterized first page (produced client-side by parsePdf before
        // upload even starts), or an EPUB's own declared cover image
        // (pulled back out of the same archive `parseEpub` already read,
        // via its `coverPath`). DOCX has no cover concept at all, and not
        // every EPUB declares one either — callers should render no cover
        // at all when this never fires, not a placeholder.
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
        // Fraction (0–1) of the source file sent so far, while uploading.
        onProgress?: (fraction: number) => void;
      } = {}
    ): Promise<UploadedBook> => {
      const report = (next: UploadStage) => {
        setStage(next);
        opts.onStage?.(next);
      };
      setError(null);
      report("parsing");
      try {
        let materialType: "book" | "pdf" | "docx";
        let title: string;
        let author: string;
        let pageCount: number | undefined;
        let documentJson: Blob | undefined;
        let thumbnailBlob: Blob | undefined;

        if (isEpub(file)) {
          const { parseEpub, ZipReader } = await import("@/lib/book/epubParser");
          const buffer = await file.arrayBuffer();
          const { book, coverPath } = await parseEpub(buffer, { slugHint: fileBaseName(file) });
          materialType = "book";
          title = book.metadata.title;
          author = book.metadata.author || "";
          documentJson = new Blob([JSON.stringify(book)], { type: "application/json" });
          opts.onMetadata?.({ title, author });
          // The EPUB's own declared cover, pulled straight out of the same
          // archive `parseEpub` already read — a second, cheap zip-entry
          // read (no re-parsing) rather than plumbing the image out through
          // `book` itself, which only ever carries `coverPath` as a string.
          // Best-effort: a cover-less EPUB, or one whose declared path turns
          // out missing/undecodable, just never fires `onThumbnail`. Uploaded
          // as the material's cover_url, same as a PDF's first page below.
          if (coverPath) {
            try {
              const zip = await ZipReader.open(buffer);
              const coverBytes = await zip.readArrayBuffer(coverPath);
              if (coverBytes) {
                thumbnailBlob = new Blob([coverBytes], { type: guessImageMime(coverPath) });
                opts.onThumbnail?.(URL.createObjectURL(thumbnailBlob));
              }
            } catch {
              // Best-effort — a missing/corrupt cover asset shouldn't block
              // the upload itself, which never needed this image anyway.
            }
          }
        } else if (isPdf(file)) {
          const { parsePdf } = await import("@/lib/book/pdfParser");
          const buffer = await file.arrayBuffer();
          const { metadata, thumbnail } = await parsePdf(buffer);
          materialType = "pdf";
          title = metadata.title || fileBaseName(file);
          author = metadata.author || "";
          pageCount = metadata.pageCount;
          thumbnailBlob = new Blob([thumbnail.slice().buffer], { type: "image/png" });
          opts.onThumbnail?.(URL.createObjectURL(thumbnailBlob));
          opts.onMetadata?.({ title, author });
        } else if (isDocx(file)) {
          const { parseDocx } = await import("@/lib/book/docxParser");
          const buffer = await file.arrayBuffer();
          const metadata = await parseDocx(buffer);
          materialType = "docx";
          title = metadata.title || fileBaseName(file);
          author = metadata.author || "";
          opts.onMetadata?.({ title, author });
        } else {
          throw new Error("Only EPUB, PDF, and DOCX files can be added to library.");
        }

        report("uploading");
        // Sign -> PUT straight to Storage -> finalize. The bytes never pass
        // through our own API (see POST /api/materials/upload/sign).
        const { uploadId, urls } = await apiFetch<{
          uploadId: string;
          urls: { source: string; json: string | null; thumbnail: string | null };
        }>("/materials/upload/sign", {
          json: { materialType, fileSize: file.size, thumbnailType: thumbnailBlob?.type ?? null },
        });
        await Promise.all([
          putToSignedUrl(urls.source, file, opts.onProgress),
          urls.json && documentJson ? putToSignedUrl(urls.json, documentJson) : null,
          urls.thumbnail && thumbnailBlob ? putToSignedUrl(urls.thumbnail, thumbnailBlob) : null,
        ]);
        const result = await apiFetch<UploadedBook>("/materials/upload", {
          json: {
            uploadId,
            materialType,
            title,
            author,
            visibility: opts.visibility ?? "personal",
            pageCount,
            thumbnailType: urls.thumbnail ? thumbnailBlob?.type : null,
            fileName: file.name,
            mimeType: file.type,
          },
        });
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
