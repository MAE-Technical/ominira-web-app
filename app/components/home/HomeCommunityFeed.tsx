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
 * still in flight — same footprint as the real card at each breakpoint (a
 * flush flat row on mobile, a boxed masonry card on desktop) so the feed's
 * layout doesn't jump once real cards swap in, and so this reads as
 * "loading," not as an empty state. */
function CommunityNoteCardSkeleton() {
  return (
    <div className="animate-pulse border-b border-[var(--reader-border)] py-4 lg:mb-5 lg:break-inside-avoid lg:rounded-sm lg:border lg:bg-[var(--reader-surface)] lg:p-5">
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
        <div className="lg:columns-2 lg:gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <CommunityNoteCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--reader-text-muted)]">No notes yet — annotate a passage to start the discourse.</p>
      ) : (
        // Mobile: a single column of flat rows, each separated by its own
        // bottom border, flush with the page's own edges (no card padding)
        // so a note lines up with the "Community notes" heading above it —
        // the redesign's precise mobile treatment. Desktop: still a 2-column
        // masonry of boxed cards (CSS multi-column, not Grid — no broadly-
        // supported grid masonry mode exists yet) — a single column reads
        // too wide there for now; CommunityNoteCard's own lg: classes add
        // the border/background/padding/break-inside-avoid back in at that
        // breakpoint. Plain block flow (no flex-col) is what makes the
        // mobile single-column stacking free — only the lg:columns-2 needs
        // an explicit multi-column declaration.
        <div className="lg:columns-2 lg:gap-5">
          {items.map((item) => (
            <CommunityNoteCard key={item.note.id} item={item} />
          ))}
        </div>
      )}
    </SearchableAppPage>
  );
}
