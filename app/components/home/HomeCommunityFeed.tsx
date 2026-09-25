"use client";

import { useState } from "react";
import SearchableAppPage from "@/app/components/shell/SearchableAppPage";
import { communityFeedItemHref, useCommunityFeed, type CommunityFeedSort } from "@/lib/community/useCommunityFeed";
import { resolveBookThumbnailSrc } from "@/lib/materials/image";
import FeaturedThisWeek from "@/app/components/shell/FeaturedThisWeek";
import CommunityFeedSortToggle from "./CommunityFeedSortToggle";
import NoteCard from "@/app/components/reader/notes/NoteCard";
import HomeAuthBanner from "./HomeAuthBanner";
import HomeInstallBanner from "./HomeInstallBanner";
import HomePushPrompt from "./HomePushPrompt";

/** Stand-in for a NoteCard while `GET /api/community/notes` is still in
 * flight — same flush flat-row footprint as the real card, at every width,
 * so the feed's layout doesn't jump once real cards swap in, and so this
 * reads as "loading," not as an empty state. */
function NoteCardSkeleton() {
  return (
    <div className="animate-pulse border-b border-[var(--reader-border)] py-4">
      <div className="mb-3 h-3 w-2/3 rounded-full bg-[var(--reader-surface-hover)]" />
      <div className="mb-2 h-3 w-full rounded-full bg-[var(--reader-surface-hover)]" />
      <div className="mb-4 h-3 w-4/5 rounded-full bg-[var(--reader-surface-hover)]" />
      <div className="h-2.5 w-1/3 rounded-full bg-[var(--reader-surface-hover)]" />
    </div>
  );
}

/** The home page's real content — a "continue reading" shelf, then the
 * global community feed (`GET /api/community/notes`), newest or top-
 * reacted first. Same page-composition shape as LibraryView (AppHeader,
 * then a page heading + a filter control, then the content). */
export default function HomeCommunityFeed() {
  const [sort, setSort] = useState<CommunityFeedSort>("recent");
  const { data, isLoading } = useCommunityFeed(sort);
  const items = data?.items ?? [];

  return (
    <SearchableAppPage>

      <HomeInstallBanner />
      <HomeAuthBanner />
      <HomePushPrompt />

      <FeaturedThisWeek />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-serif text-xl font-bold text-[var(--reader-text)]">Community notes</h1>
          {/* <p className="mt-1 mb-0 font-literata text-sm text-[var(--reader-text-muted)]">
            What comrades are discussing across the library right now.
          </p> */}
        </div>
        {items.length > 0 && <CommunityFeedSortToggle mode={sort} onChange={setSort} />}
      </div>

      {isLoading ? (
        <div className="flex flex-col">
          {Array.from({ length: 4 }).map((_, i) => (
            <NoteCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--reader-text-muted)]">No notes yet — annotate a passage to start the discourse.</p>
      ) : (
        // One column of flat rows, each separated by its own bottom
        // border, at every width — no boxed/masonry treatment on desktop
        // (see NoteCard's own doc comment for why: CSS multi-column forced
        // a full-feed reflow whenever any one card's height changed, e.g.
        // its inline reply composer opening).
        <div className="flex flex-col">
          {items.map((item) => (
            <NoteCard
              key={item.note.id}
              materialId={item.material.id}
              note={item.note}
              replies={item.replies}
              excerpt={item.excerpt}
              bookContext={{
                href: communityFeedItemHref(item),
                title: item.material.title,
                section: item.label,
                coverUrl: resolveBookThumbnailSrc(item.material),
              }}
            />
          ))}
        </div>
      )}
    </SearchableAppPage>
  );
}
