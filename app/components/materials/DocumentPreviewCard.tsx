"use client";

import { Check, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { formatBytes } from "@/lib/materials/uploadLimits";
import TopicPickerTrigger, { TopicChips, type PickableItem } from "@/app/components/home/TopicPicker";
import TextField from "@/app/components/auth/TextField";
import BookCover from "@/app/components/shared/BookCover";
import type { CoverSource } from "@/lib/materials/image";

export type AttachmentStatus = "parsing" | "uploading" | "done" | "error";
export type AttachmentVisibility = "personal" | "public";

/**
 * One attachment row — shared by HomeComposer's single-post attachment and
 * the library's multi-book composer (AddBookModal), rather than two
 * near-duplicate cards (library-contribution-ux-spec.md Step 4 went through
 * a denser D2-styled fork of this before landing back here per direct
 * feedback: one card, one set of conventions). `title`/`author` are
 * controlled by the caller (seeded from lib/materials/useUploadBook.ts's
 * `onMetadata` guess) — this component only renders the inputs and reports
 * `onCommitTitle`/`onCommitAuthor` on blur, via lib/materials/
 * useAttachmentMetadataEditor's queue-until-materialId-exists save path.
 *
 * Editable the instant a guess exists (even mid-parse/upload), not gated on
 * `status === "done"` — a reader fixing a bad auto-detected title shouldn't
 * have to wait for the upload to finish first, and the queued edit still
 * lands once it does (see the editor hook).
 *
 * `onRetry`/`visibility`/`categories` are optional — HomeComposer's single
 * attachment doesn't need per-item retry, privacy, or category tagging (a
 * failed attachment there is just removed and re-picked, and there's no
 * privacy/category concept on a post's one attached book), so it renders
 * none of that; AddBookModal passes all three. `categories` reuses
 * TopicPicker's chips/popover UI (originally built for community topics) —
 * a category is its own id here (`{ id: category, name: category }`), a
 * different underlying concept from a community topic but the same picker
 * interaction, so there's no second "tag input" UI to maintain.
 *
 * `coverSources`/`onSetCoverSource` are optional too — only AddBookModal's
 * edit-mode card (a material that's already gone through Google Books/
 * OpenLibrary enrichment, see lib/materials/enrichMaterial.ts) ever has real
 * alternates to offer; a book mid-upload here never does yet, so it renders
 * nothing for these. Same "one card, whatever the caller has to offer"
 * shape as visibility/categories above — this is the single place a reader
 * ever sees or edits any of these fields, whether adding a book or editing
 * one already in their library, so a change here is a change everywhere.
 */
export default function DocumentPreviewCard({
  file,
  status,
  progress,
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
  onRetry,
  visibility,
  onSetVisibility,
  categories,
  availableCategories,
  onSetCategories,
  coverSources,
  coverSource,
  onSetCoverSource,
}: {
  file: File;
  status: AttachmentStatus;
  /** 0–1 upload progress, shown while `status === "uploading"`. */
  progress?: number;
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
  onRetry?: () => void;
  visibility?: AttachmentVisibility;
  onSetVisibility?: (visibility: AttachmentVisibility) => void;
  categories?: string[];
  availableCategories?: string[];
  onSetCategories?: (categories: string[]) => void;
  coverSources?: { id: CoverSource; label: string; thumbnailUrl: string }[];
  coverSource?: CoverSource;
  onSetCoverSource?: (source: CoverSource) => void;
}) {
  const metadataKnown = status !== "parsing";
  const isPrivate = visibility === "personal";
  const categoryItems: PickableItem[] = (availableCategories ?? []).map((c) => ({ id: c, name: c }));

  return (
    <div className="relative flex gap-2.5 rounded-[var(--radius-sm)] border border-[var(--reader-border)] px-3 py-2.5">
      {/* Always rendered, even with no real cover yet (or ever, for EPUB/
         DOCX) — BookCover's own placeholder (a plain book icon) keeps this
         row's leading slot consistent with every other book thumbnail in
         the app (BookListRow etc.) instead of leaving a blank gap where a
         cover would be. */}
      <div className="relative h-[46px] w-[34px] flex-none">
        <BookCover
          src={coverUrl}
          alt=""
          className="h-full w-full rounded-sm border border-[var(--reader-border)]"
          iconSize={16}
        />
        <div
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--reader-surface)]"
          style={{
            backgroundColor:
              status === "done"
                ? "var(--color-forest-500)"
                : status === "error"
                  ? "var(--color-brand-500)"
                  : "var(--reader-text-subtle)",
          }}
        >
          {(status === "parsing" || status === "uploading") && <Loader2 size={9} className="animate-spin text-white" />}
          {status === "done" && <Check size={9} className="text-white" />}
          {status === "error" && <AlertCircle size={9} className="text-white" />}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <TextField
          label="Title"
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
        />
        <TextField
          label="Author"
          value={metadataKnown ? author : ""}
          placeholder={metadataKnown ? "Optional" : ""}
          disabled={!metadataKnown}
          onChange={(e) => onAuthorChange(e.target.value)}
          onBlur={(e) => onCommitAuthor(e.target.value.trim())}
        />
        {/* file.size is 0 for AddBookModal's edit-mode synthetic attachment
           (a material with no real File behind it) — nothing to show. */}
        {file.size > 0 && <span className="text-xs font-medium text-[var(--reader-text-subtle)]">{formatBytes(file.size)}</span>}
        {status === "parsing" && (
          <span className="mt-0.5 text-xs font-semibold text-[var(--reader-text-muted)]">Reading your file…</span>
        )}
        {status === "uploading" && (
          <span className="mt-0.5 text-xs font-semibold text-[var(--reader-text-muted)]">
            Uploading…{progress !== undefined && progress > 0 ? ` ${Math.round(progress * 100)}%` : ""}
          </span>
        )}
        {/* doneLabel="" (edit mode) skips this line entirely — the corner
           badge's green check already says "saved", a second "Uploaded"
           line under an already-existing book reads as a lie. */}
        {status === "done" && doneLabel && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-forest-500)]">
            <Check size={12} />
            {doneLabel}
          </span>
        )}
        {status === "error" && (
          <span className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-red-600">
            <AlertCircle size={12} />
            {error ?? "Could not process this file."}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-brand-500)] underline"
              >
                Retry
              </button>
            )}
          </span>
        )}

        {coverSources && coverSources.length > 0 && onSetCoverSource && (
          <div className="mt-1">
            <span className="mb-1.5 block text-[11px] font-bold text-[var(--reader-text)]">Cover</span>
            <div className="flex flex-wrap gap-2">
              {coverSources.map((source) => {
                const active = source.id === coverSource;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onSetCoverSource(source.id)}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-sm border p-1 transition-colors ${
                      active ? "border-brand-500" : "border-sand-300 hover:border-brand-300"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- external provider thumbnail, not an app asset */}
                    <img src={source.thumbnailUrl} alt="" className="h-16 w-11 rounded-xs bg-[var(--reader-surface-hover)] object-cover" />
                    <span className={`text-[9px] font-semibold ${active ? "text-brand-500" : "text-[var(--reader-text-muted)]"}`}>
                      {source.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {availableCategories && onSetCategories && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TopicChips topics={categoryItems} selectedIds={categories ?? []} onChange={onSetCategories} />
            <TopicPickerTrigger topics={categoryItems} selectedIds={categories ?? []} onChange={onSetCategories} />
          </div>
        )}

        {visibility && onSetVisibility && (
          <label className="mt-1 inline-flex select-none items-center gap-1.5 self-start text-[12px] font-semibold text-[var(--reader-text-muted)]">
            <input
              type="checkbox"
              checked={!isPrivate}
              onChange={(e) => onSetVisibility(e.target.checked ? "public" : "personal")}
              className="h-3.5 w-3.5 accent-[var(--reader-text)]"
            />
            Share with everyone
          </label>
        )}
      </div>
      <button
        onClick={onRemove}
        aria-label="Delete this book"
        title="Delete this book"
        className="absolute right-2 top-2 flex cursor-pointer items-center gap-1 rounded-full border-none bg-transparent px-1.5 py-1 text-[11px] font-bold text-[var(--reader-text-subtle)] hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={13} />
        Delete
      </button>
    </div>
  );
}
