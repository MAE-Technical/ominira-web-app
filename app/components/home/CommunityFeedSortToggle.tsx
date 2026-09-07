"use client";

import type { CommunityFeedSort } from "@/lib/community/useCommunityFeed";
import PillGroup from "../PillGroup";

// Back to PillGroup, not SortSelect — a native <select> means a real
// <option> list, and every mobile browser enforces a 16px floor on any
// focused form control's font-size to stop the whole page zooming in on
// tap (see globals.css's own `@media (max-width: 767px)` rule). That's
// unavoidable for a real select, and it read oversized/disproportionate
// next to this row's own small text. A button-based pill toggle has no
// such floor to fight — same look this control had before SortSelect was
// tried here.
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
  return <PillGroup options={OPTIONS} selected={mode} onSelect={onChange} />;
}
