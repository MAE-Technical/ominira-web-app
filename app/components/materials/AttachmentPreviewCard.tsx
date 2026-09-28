"use client";

import { X, Check, AlertCircle } from "lucide-react";
import { formatBytes } from "@/lib/materials/uploadLimits";

export type AttachmentStatus = "parsing" | "uploading" | "done" | "error";

/**
 * One attachment row in HomeComposer's and AddBookButton's "Add a
 * book"/"Add files" preview list — extracted out of both once title/author
 * editing needed the same inline-input treatment in two places (they were
 * near-duplicate JSX before this; see document-readers-spec.md's followup
 * on editable title/author). `title`/`author` are controlled by the caller
 * (seeded from lib/materials/useUploadBook.ts's `onMetadata` guess) — this
 * component only renders the inputs and reports `onCommitTitle`/
 * `onCommitAuthor` on blur, via lib/materials/useAttachmentMetadataEditor's
 * queue-until-materialId-exists save path.
 *
 * Editable the instant a guess exists (even mid-parse/upload), not gated on
 * `status === "done"` — a reader fixing a bad auto-detected title shouldn't
 * have to wait for the upload to finish first, and the queued edit still
 * lands once it does (see the editor hook).
 */
export default function AttachmentPreviewCard({
  file,
  status,
  error,
  title,
  author,
  coverUrl,
  doneLabel,
  onRemove,
  onTitleChange,
  onAuthorChange,
  onCommitTitle,
  onCommitAuthor,
}: {
  file: File;
  status: AttachmentStatus;
  error?: string;
  title: string;
  author: string;
  coverUrl?: string;
  doneLabel: string;
  onRemove: () => void;
  onTitleChange: (title: string) => void;
  onAuthorChange: (author: string) => void;
  onCommitTitle: (title: string) => void;
  onCommitAuthor: (author: string) => void;
}) {
  const metadataKnown = status !== "parsing";

  return (
    <div className="relative flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--reader-border)] px-3 py-2.5">
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          className="h-[46px] w-[34px] flex-none rounded-sm border border-[var(--reader-border)] object-cover"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          value={metadataKnown ? title : ""}
          placeholder={file.name}
          disabled={!metadataKnown}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={(e) => {
            const trimmed = e.target.value.trim();
            const next = trimmed || file.name.replace(/\.[^.]+$/, "");
            if (next !== title) onTitleChange(next);
            onCommitTitle(next);
          }}
          aria-label="Title"
          className="w-full min-w-0 truncate border-none bg-transparent p-0 text-[13px] font-bold text-[var(--reader-text)] outline-none placeholder:text-[var(--reader-text)] disabled:cursor-default"
        />
        <input
          value={metadataKnown ? author : ""}
          placeholder={metadataKnown ? "Add an author (optional)" : ""}
          disabled={!metadataKnown}
          onChange={(e) => onAuthorChange(e.target.value)}
          onBlur={(e) => onCommitAuthor(e.target.value.trim())}
          aria-label="Author"
          className="w-full min-w-0 truncate border-none bg-transparent p-0 text-xs font-medium text-[var(--reader-text-muted)] outline-none placeholder:text-[var(--reader-text-subtle)] disabled:cursor-default"
        />
        <span className="text-xs font-medium text-[var(--reader-text-subtle)]">{formatBytes(file.size)}</span>
        {status === "parsing" && (
          <span className="mt-0.5 text-xs font-semibold text-[var(--reader-text-muted)]">Reading your file…</span>
        )}
        {status === "uploading" && (
          <span className="mt-0.5 text-xs font-semibold text-[var(--reader-text-muted)]">Uploading…</span>
        )}
        {status === "done" && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-forest-500)]">
            <Check size={12} />
            {doneLabel}
          </span>
        )}
        {status === "error" && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-red-600">
            <AlertCircle size={12} />
            {error ?? "Could not process this file."}
          </span>
        )}
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove attachment"
        className="absolute right-2 top-2 flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text-subtle)]"
      >
        <X size={12} />
      </button>
    </div>
  );
}
