"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Link as LinkIcon, Loader2, X } from "lucide-react";
import LiteYouTubeEmbed from "react-lite-youtube-embed";
import "react-lite-youtube-embed/dist/LiteYouTubeEmbed.css";
import { useLinkPreview } from "@/lib/community/useLinkPreview";
import { youtubeVideoId } from "@/lib/community/links";
import { useUploadFromUrl } from "@/lib/materials/useUploadFromUrl";
import { ApiError } from "@/lib/api/client";

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One shared link/video-preview card — fetches real og:title/description/
 * image (or, for YouTube, oEmbed title/author/thumbnail) via useLinkPreview,
 * and falls back to just the bare hostname + a generic icon when metadata
 * can't be retrieved, so there's always something to render. Used both in
 * NoteContent (a posted note's own rendered body) and HomeComposer (the
 * draft's live preview as a reader types a URL) — the one place this shape
 * is built, per DRY, rather than each screen re-deriving it.
 *
 * A YouTube video gets a full-width playable banner — it's its own
 * interactive object (the embed's play button, not this card, is what
 * starts it), so it renders outside the clickable strip entirely, and
 * clicking its metadata strip below just opens YouTube externally — there's
 * no in-app video reader to ingest it into.
 *
 * A plain (non-video) link is different: clicking it auto-ingests the page
 * into the in-app reader on first click — POSTs to `/api/materials/from-url`
 * (fetch + Readability extraction server-side, document-readers-spec.md
 * § 4), then opens `/read/[slug]`. That route dedupes by `source_url`
 * server-side, so a second click on the same link (this card or any other
 * reader's) is a cheap lookup, not a re-fetch/re-extract — "ingested once,
 * doesn't need to again" holds regardless of who clicks or how many times.
 * If extraction fails (not an article — a login page, an app shell, etc.),
 * the card shows why and becomes a plain external link to the original
 * (see openInReader for why that isn't an automatic window.open). The hover
 * arrow (BookPreview's own affordance) is what signals "this opens in the
 * reader," not just another external link. */
export default function LinkPreviewCard({ url, dismissible, onDismiss }: { url: string; dismissible?: boolean; onDismiss?: () => void }) {
  const router = useRouter();
  const { data, isLoading } = useLinkPreview(url);
  const { upload: uploadFromUrl } = useUploadFromUrl();
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const isVideo = data?.kind === "video";
  const videoId = isVideo ? youtubeVideoId(url) : null;

  async function openInReader() {
    if (ingesting) return;
    setIngesting(true);
    try {
      const result = await uploadFromUrl(url, { visibility: "public" });
      router.push(`/read/${result.slug}`);
    } catch (err) {
      // Not a readable article (login page, app shell, paywall, …), or the
      // request itself failed. No `window.open` here: by now we're past an
      // await, and Safari (and every iOS PWA) only lets a tap open a window
      // synchronously — it silently blocked this, dead-ending the click.
      // Instead the card turns into a real external link (below), which a
      // second tap opens natively everywhere, with the reason shown.
      setIngestError(err instanceof ApiError ? err.message : "Couldn't open this in the reader.");
    } finally {
      // Always clear the guard, even on success: closing the reader overlay
      // is a router.back() to this same soft-navigated page, which can leave
      // this card mounted with `ingesting` stuck true forever if we only
      // reset it in the catch branch — the next click would then silently
      // no-op on the `if (ingesting) return;` guard above.
      setIngesting(false);
    }
  }

  const metaStrip = (
    <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
      {!videoId && !data?.imageUrl && (
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-sm bg-[var(--color-app-surface-muted)] text-[var(--color-app-text-muted)]">
          <LinkIcon size={18} strokeWidth={1.5} />
        </div>
      )}
      {!videoId && data?.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element -- remote, unoptimized preview thumbnails from arbitrary third-party hosts */
        <img src={data.imageUrl} alt="" className="h-[52px] w-[38px] flex-none rounded-[4px] object-cover" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-app-text-muted)]">
          {data?.siteName ?? hostname(url)}
        </span>
        <span className="break-words text-[12px] font-semibold text-[var(--color-app-text)]">
          {isLoading ? "Loading preview…" : (data?.title ?? url)}
        </span>
        {data?.description && (
          <span className="truncate text-[11px] text-[var(--color-app-text-secondary)]">{data.description}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-sm,4px)] border border-[var(--color-app-border)] bg-[var(--color-app-surface)]">
      {videoId && (
        // Click-to-load facade (real iframe only swapped in on click), so a
        // feed full of video notes doesn't eagerly load a dozen YouTube
        // players at once. Sits outside the metadata strip below — clicking
        // play plays the video in place, it doesn't navigate anywhere.
        <LiteYouTubeEmbed id={videoId} title={data?.title ?? "YouTube video"} thumbnail={data?.imageUrl ?? undefined} />
      )}
      {videoId ? (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} className="min-w-0 no-underline">
          {metaStrip}
        </a>
      ) : ingestError ? (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} className="min-w-0 no-underline">
          {metaStrip}
          <div className="flex items-center justify-between gap-2 border-t border-[var(--color-app-border)] px-3 py-2 text-[11px]">
            <span className="min-w-0 text-[var(--color-app-text-secondary)]">{ingestError}</span>
            <span className="flex flex-none items-center gap-0.5 font-semibold text-brand-500">
              Open original
              <ArrowUpRight aria-hidden="true" size={13} />
            </span>
          </div>
        </a>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            openInReader();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            openInReader();
          }}
          className="flex min-w-0 cursor-pointer items-center gap-2"
        >
          <div className="min-w-0 flex-1">{metaStrip}</div>
          <div className="flex-none pr-3">
            {ingesting ? (
              <Loader2 size={16} className="animate-spin text-[var(--color-app-text-muted)]" />
            ) : (
              <ArrowUpRight
                aria-hidden="true"
                size={16}
                className="text-[var(--color-app-text-muted)] opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              />
            )}
          </div>
        </div>
      )}
      {dismissible && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss?.();
          }}
          aria-label="Remove link preview"
          className="absolute right-2 top-2 flex h-[22px] w-[22px] flex-none cursor-pointer items-center justify-center rounded-full border border-[var(--color-app-border)] bg-[var(--color-app-surface)] text-[var(--color-app-text-muted)]"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
