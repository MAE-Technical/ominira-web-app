"use client";

import { useState } from "react";
import SearchableAppPage from "@/app/components/shell/SearchableAppPage";
import { useCommunityFeed, type CommunityFeedSort } from "@/lib/community/useCommunityFeed";
import FeaturedThisWeek from "@/app/components/shell/FeaturedThisWeek";
import CommunityFeedSortToggle from "./CommunityFeedSortToggle";
import CommunityNoteCard from "./CommunityNoteCard";
import HomeAuthBanner from "./HomeAuthBanner";
import HomeInstallBanner from "./HomeInstallBanner";
import HomePushPrompt from "./HomePushPrompt";

/** Stand-in for a CommunityNoteCard while `GET /api/community/notes` is
 * still in flight — same rounded-card footprint (border, padding, roughly
 * a card's worth of lines) so the feed's layout doesn't jump once real
 * cards swap in, and so this reads as "loading," not as an empty state. */
function CommunityNoteCardSkeleton() {
  return (
    <div className="animate-pulse rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-4">
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
        <div className="columns-1 gap-5 lg:columns-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mb-5 break-inside-avoid">
              <CommunityNoteCardSkeleton />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--reader-text-muted)]">No notes yet — annotate a passage to start the discourse.</p>
      ) : (
        // A 2-column masonry on desktop (CSS multi-column, not CSS Grid —
        // no broadly-supported grid masonry mode exists yet) rather than a
        // single column, since card height varies a lot here: voice vs.
        // text notes, and however many replies happen to be expanded.
        // Multi-column re-flows on its own whenever a card's height changes
        // (e.g. expanding a reply thread) — no JS measuring/repositioning
        // needed, unlike a hand-rolled masonry. The one real tradeoff: this
        // fills top-to-bottom in column 1 before starting column 2
        // (newspaper order), not left-to-right row by row, so "Top"/
        // "Recent" reads column-major rather than one strict ranked
        // sequence — acceptable for a discussion feed, not a leaderboard.
        // `gap` only spaces the columns apart, not items stacked within one
        // column, so each card's own wrapper carries the vertical margin
        // instead; break-inside-avoid keeps a card from splitting across
        // the column break.
        <div className="columns-1 gap-5 lg:columns-2">
          {items.map((item) => (
            <div key={item.note.id} className="mb-5 break-inside-avoid">
              <CommunityNoteCard item={item} />
            </div>
          ))}
        </div>
      )}
    </SearchableAppPage>
  );
}
