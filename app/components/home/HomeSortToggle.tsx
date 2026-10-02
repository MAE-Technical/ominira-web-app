"use client";

import UnderlineTabs from "@/app/components/UnderlineTabs";
import type { CommunityFeedSort } from "@/lib/community/useCommunityFeed";

const OPTIONS: { value: CommunityFeedSort; label: string }[] = [
  { value: "recent", label: "Latest" },
  { value: "top", label: "Popular" },
];

/** Home's sort control — same underline-tab styling as Shelf's tab bar. */
export default function HomeSortToggle({
  mode,
  onChange,
}: {
  mode: CommunityFeedSort;
  onChange: (mode: CommunityFeedSort) => void;
}) {
  return <UnderlineTabs options={OPTIONS} value={mode} onChange={onChange} />;
}
