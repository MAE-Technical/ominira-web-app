import ReaderLink from "@/app/components/ReaderLink";
import { buildResumeHref, positionPercent } from "@/lib/reader/locator";
import type { ContinueReadingItem } from "@/lib/auth/useContinueReading";
import BookCover from "@/app/components/shared/BookCover";
import { resolveBookThumbnailSrc } from "@/lib/materials/image";

/** The "Continue reading" rail's own card — its one remaining caller since
 * the desktop sidebar's mirror of this list (SidebarContinueReading) was
 * retired in favor of a proper Reading nav item, and the Reading page
 * itself (ShelfView) moved to BookListRow. */
export default function ContinueReadingItemCard({ item }: { item: ContinueReadingItem }) {
  const { material } = item;
  // positionPercent, not item.progressPercent: tracked progress stops just
  // short of 100 by construction, so a finished material only reads full here
  // (see lib/reader/locator.ts).
  const pct = positionPercent(item);
  const isFinished = Boolean(item.finishedAt);

  return (
    <ReaderLink
      // Straight from this reader's own reader_activities row (this whole
      // rail is GET /continue-reading's own response) — see buildResumeHref
      // and useResumeScroll's own doc comment for why the URL, not this
      // device's local mirror, is what a resume link should hand off.
      href={buildResumeHref(material.slug, item)}
      className="flex w-60 flex-none gap-3 rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3 no-underline md:w-70"
    >
      <BookCover src={resolveBookThumbnailSrc(material)} alt={material.title} className="h-20 w-17 flex-none rounded-sm border border-[var(--reader-border)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <div className="truncate font-serif text-sm font-semibold leading-tight text-[var(--reader-text)]">{material.title}</div>
          <div className="mt-0.5 truncate text-xs font-medium text-[var(--reader-text-muted)]">{material.author}</div>
        </div>
        <div className="mt-auto flex flex-col gap-1.5">
          <div className="h-1 overflow-hidden rounded-full bg-[var(--reader-surface-hover)]">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] font-medium text-[var(--reader-text-muted)]">
            {isFinished ? "Finished" : `${pct}% complete`}
          </div>
        </div>
      </div>
    </ReaderLink>
  );
}
