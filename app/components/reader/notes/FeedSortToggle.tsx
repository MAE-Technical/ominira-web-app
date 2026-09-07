"use client";

import type { FeedSort } from "@/lib/reader/feedSort";
import SortSelect from "@/app/components/SortSelect";

const OPTIONS: { value: FeedSort; label: string }[] = [
  { value: "book", label: "Default" },
  { value: "recent", label: "Recent" },
  { value: "top", label: "Top" },
];

/** "Sort by" for the book-wide feed's own entries — same SortSelect and
 * same two labels as CommunityFeedSortToggle (the home community feed), so
 * sorting reads as one consistent control across the app. */
export default function FeedSortToggle({ sort, onChange }: { sort: FeedSort; onChange: (sort: FeedSort) => void }) {
  return <SortSelect options={OPTIONS} value={sort} onChange={onChange} />;
}
