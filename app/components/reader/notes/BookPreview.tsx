"use client";

import { ArrowUpRight, FileText } from "lucide-react";

// materialType -> the short label shown under title/section, mirroring
// EXTENSION_BY_MATERIAL_TYPE in app/api/materials/upload/route.ts (server-
// only, so not imported directly here).
const FORMAT_LABEL_BY_MATERIAL_TYPE: Record<string, string> = { book: "EPUB", pdf: "PDF", docx: "DOCX", webpage: "WEB" };

/** A note's book source — cover art on the left (a generic document icon in
 * its place when there's no cover, same "icon in place of missing media"
 * treatment LinkPreviewCard uses for a coverless link) and title/author/
 * section/format on the right, plus an arrow that only shows on hover (this
 * row carries its own `group`, so hover works whether it's wrapped in an
 * ancestor `<Link>` or clickable via its own `onClick`) as a hint that the
 * whole row opens this book. Same plain-white surface as LinkPreviewCard, so
 * an attachment reads as the same kind of object as a link preview. */
export default function BookPreview({
  title,
  author,
  section,
  coverUrl,
  materialType,
  onClick,
  bare = false,
}: {
  title: string;
  author?: string | null;
  section?: string;
  coverUrl?: string | null;
  materialType?: string;
  onClick?: () => void;
  /** Drops this row's own border/radius, keeping just the surface tint +
   * padding — for NoteBookContext fusing this in as the meta strip under a
   * quote block, one bordered card instead of two stacked ones (mirrors
   * VideoPreview's thumbnail+title/duration strip). */
  bare?: boolean;
}) {
  const formatLabel = materialType ? FORMAT_LABEL_BY_MATERIAL_TYPE[materialType] : undefined;
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      className={`group flex min-w-0 items-center gap-2.5 px-3 py-2.5 ${
        // Standalone (no excerpt above it), this is its own plain-white
        // card, same surface as a link preview. Fused under a QuoteCard
        // (NoteBookContext's excerpt case) it takes on that card's own
        // muted tint instead, so the two stacked "bare" halves read as one
        // continuous surface rather than a visible seam between a tinted
        // quote and a white meta strip.
        bare
          ? "bg-[var(--color-app-surface-muted)]"
          : "rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)]"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="h-[52px] w-[38px] flex-none rounded-[4px] object-cover" />
      ) : (
        <div className="flex h-[52px] w-[38px] flex-none items-center justify-center rounded-[4px] bg-[var(--color-app-surface-muted)] text-[var(--color-app-text-muted)]">
          <FileText size={16} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12px] font-semibold text-[var(--color-app-text)]">{title}</span>
        {author && <span className="truncate text-[11px] text-[var(--color-app-text-secondary)]">{author}</span>}
        {section && <span className="truncate text-[12px] font-medium text-[var(--color-app-text-secondary)]">{section}</span>}
        {formatLabel && (
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-app-text-muted)]">
            {formatLabel}
          </span>
        )}
      </div>
      <ArrowUpRight
        aria-hidden="true"
        size={16}
        className="flex-none text-[var(--color-app-text-muted)] opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      />
    </div>
  );
}
