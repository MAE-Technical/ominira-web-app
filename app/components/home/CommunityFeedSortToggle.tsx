"use client";

import type { CommunityFeedSort } from "@/lib/community/useCommunityFeed";
import SortSelect from "../SortSelect";

const OPTIONS: { value: CommunityFeedSort; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "recent", label: "Recent" },
];

export default function CommunityFeedSortToggle({
  mode,
  onChange,
}: {
  mode: CommunityFeedSort;
  onChange: (mode: CommunityFeedSort) => void;
}) {
  return <SortSelect options={OPTIONS} value={mode} onChange={onChange} />;
}
