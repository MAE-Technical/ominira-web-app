"use client";

import { Link as LinkIcon } from "lucide-react";

export type LinkPreviewData = {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A bare-URL note's own link preview (NoteContent) — no fetched metadata
 * today (`data` is just the raw URL), so this renders with the generic
 * link-icon fallback and the URL as its own title; `title`/`imageUrl`/
 * `description` are here so a future server-side unfurl can fill this in
 * (including the link's own preview image) with no further plumbing.
 * Self-contained — no shared preview scaffolding with BookPreview/
 * VideoPreview, each of which has its own shape (a book's portrait cover,
 * a video's text-only row) not worth forcing through one abstraction. */
export function LinkPreview({ data }: { data: LinkPreviewData }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2.5">
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="" className="h-10 w-10 flex-none rounded-sm object-cover" />
      ) : (
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-sm bg-[var(--color-app-surface-muted)] text-[var(--color-app-text-muted)]">
          <LinkIcon size={18} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-app-text-muted)]">
          {hostname(data.url)}
        </span>
        <span className="truncate text-[12px] font-semibold text-[var(--color-app-text)]">{data.title ?? data.url}</span>
        {data.description && (
          <span className="truncate text-[11px] text-[var(--color-app-text-secondary)]">{data.description}</span>
        )}
      </div>
    </div>
  );
}
