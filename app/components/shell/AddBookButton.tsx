"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useUploadBook } from "@/lib/materials/useUploadBook";
import type { UploadedBook } from "@/lib/materials/useUploadBook";
import { useAttachmentMetadataEditor } from "@/lib/materials/useAttachmentMetadataEditor";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILES, formatBytes } from "@/lib/materials/uploadLimits";
import { apiFetch } from "@/lib/api/client";
import AttachmentPreviewCard from "@/app/components/materials/AttachmentPreviewCard";

type FileAttachment = {
  file: File;
  status: "parsing" | "uploading" | "done" | "error";
  error?: string;
  materialId?: string;
  title: string;
  author: string;
};

/**
 * Library's own "add a book" entry point (reader-uploads-spec.md § 3) — same
 * shared parse -> validate -> upload pipeline HomeComposer's "Add files"
 * uses (lib/materials/useUploadBook), same accepted formats/caps
 * (lib/materials/uploadLimits.ts, shared so the two entry points can't
 * drift apart), just triggered from the library view instead of the
 * composer. Multi-file for the same reason HomeComposer is: a reader
 * picking from Files on mobile very often multi-selects.
 *
 * A web page has no picker counterpart here — same reasoning as
 * HomeComposer's own doc comment: a reader adds one by pasting the URL
 * wherever they'd post a link, and LinkPreviewCard is what turns it into a
 * readable material, on first click, not this component.
 */
export default function AddBookButton({ onUploaded }: { onUploaded: (book: UploadedBook) => void }) {
  const { upload } = useUploadBook();
  const metadataEditor = useAttachmentMetadataEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  // Same cancel-on-remove bookkeeping as HomeComposer's own — see that
  // component's cancelledRef doc comment.
  const cancelledRef = useRef<Set<File>>(new Set());

  function handleFileChange(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const availableSlots = Math.max(0, MAX_FILES - files.length);
    const incoming = Array.from(picked).slice(0, availableSlots);
    // Cleared immediately (not just in a .then/.finally) so iOS Safari
    // fires `change` again if the reader picks the exact same file right
    // after this one finishes — browsers don't fire `change` on a re-pick
    // of an unchanged `value`.
    if (inputRef.current) inputRef.current.value = "";

    const accepted: File[] = [];
    const attachments: FileAttachment[] = incoming.map((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return { file, status: "error", error: `Files must be under ${formatBytes(MAX_FILE_SIZE_BYTES)}.`, title: "", author: "" };
      }
      accepted.push(file);
      return { file, status: "parsing", title: "", author: "" };
    });
    setFiles((existing) => [...existing, ...attachments]);

    for (const file of accepted) {
      upload(file, {
        visibility: "personal",
        onStage: (stage) => {
          if (stage !== "parsing" && stage !== "uploading") return;
          setFiles((existing) => existing.map((a) => (a.file === file ? { ...a, status: stage } : a)));
        },
        onMetadata: ({ title, author }) => {
          setFiles((existing) => existing.map((a) => (a.file === file ? { ...a, title, author } : a)));
        },
      })
        .then((result) => {
          if (cancelledRef.current.delete(file)) {
            apiFetch(`/materials/${result.materialId}`, { method: "DELETE" }).catch(() => {});
            return;
          }
          metadataEditor.flushPending(file, result.materialId);
          setFiles((existing) =>
            existing.map((a) => (a.file === file ? { ...a, status: "done", materialId: result.materialId } : a))
          );
          onUploaded(result);
        })
        .catch((err) => {
          cancelledRef.current.delete(file);
          metadataEditor.forget(file);
          const message = err instanceof Error ? err.message : "Could not process this file.";
          setFiles((existing) => existing.map((a) => (a.file === file ? { ...a, status: "error", error: message } : a)));
        });
    }
  }

  function removeFile(index: number) {
    const attachment = files[index];
    if (attachment.status === "done" && attachment.materialId) {
      apiFetch(`/materials/${attachment.materialId}`, { method: "DELETE" }).catch(() => {});
    } else if (attachment.status === "parsing" || attachment.status === "uploading") {
      cancelledRef.current.add(attachment.file);
    }
    metadataEditor.forget(attachment.file);
    setFiles((existing) => existing.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files)}
      />
      <button
        type="button"
        // Directly synchronous with the tap, no `await` beforehand — iOS
        // Safari/WKWebView (including installed PWAs) only honors a
        // programmatic `input.click()` when it's still inside the original
        // user-gesture call stack; deferring it even to a microtask makes
        // iOS silently drop the picker.
        onClick={() => inputRef.current?.click()}
        disabled={files.length >= MAX_FILES}
        className="flex h-8 flex-none cursor-pointer items-center gap-1.5 self-start rounded-full border border-[var(--reader-border)] px-2.5 text-[12px] font-medium text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload size={15} />
        Add a book
        {files.length > 0 && <span className="text-[var(--reader-text-subtle)]">{files.length}/{MAX_FILES}</span>}
      </button>

      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((attachment, i) => (
            <AttachmentPreviewCard
              key={`${attachment.file.name}-${i}`}
              file={attachment.file}
              status={attachment.status}
              error={attachment.error}
              title={attachment.title}
              author={attachment.author}
              doneLabel="Added to your library"
              onRemove={() => removeFile(i)}
              onTitleChange={(title) =>
                setFiles((existing) => existing.map((a) => (a.file === attachment.file ? { ...a, title } : a)))
              }
              onAuthorChange={(author) =>
                setFiles((existing) => existing.map((a) => (a.file === attachment.file ? { ...a, author } : a)))
              }
              onCommitTitle={(title) => {
                setFiles((existing) => existing.map((a) => (a.file === attachment.file ? { ...a, title } : a)));
                metadataEditor.commit(attachment.file, attachment.materialId, { title });
              }}
              onCommitAuthor={(author) => metadataEditor.commit(attachment.file, attachment.materialId, { author })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
