"use client";

import { FileText, Play } from "lucide-react";

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
 * today (`data` is just the raw URL), so this renders as a plain
 * hostname-only card; `title`/`description`/`imageUrl` are here so a future
 * server-side unfurl can fill this in with no further plumbing. */
export function LinkPreview({ data }: { data: LinkPreviewData }) {
  return (
    <div className="relative flex min-w-0 overflow-hidden rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)]">
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="" className="h-[76px] w-[76px] flex-none object-cover" />
      ) : (
        <div className="flex h-[76px] w-[76px] flex-none items-center justify-center bg-[var(--color-app-surface-muted)] text-[var(--color-app-text-muted)]">
          <FileText size={20} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5 py-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-app-text-muted)]">{hostname(data.url)}</span>
        <span className="truncate text-[13px] font-bold text-[var(--color-app-text)]">{data.title ?? data.url}</span>
        {data.description && <span className="truncate text-[11px] text-[var(--color-app-text-secondary)]">{data.description}</span>}
      </div>
    </div>
  );
}

/** A bare YouTube-URL note's own preview — same "no fetched metadata yet"
 * caveat as LinkPreview: just a play-button placeholder over a generic
 * video-shaped card, not the video's actual thumbnail/title. */
export function VideoPreview() {
  return (
    <div className="w-full overflow-hidden rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)]">
      <div className="relative flex aspect-video items-center justify-center bg-[var(--color-app-surface-muted)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(20,17,14,0.72)] text-white">
          <Play size={16} fill="currentColor" />
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <span className="truncate text-[13px] font-bold text-[var(--color-app-text)]">YouTube video</span>
        <span className="text-[11px] text-[var(--color-app-text-secondary)]">YouTube</span>
      </div>
    </div>
  );
}
