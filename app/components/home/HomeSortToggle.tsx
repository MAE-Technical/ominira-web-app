"use client";

import type { CommunityFeedSort } from "@/lib/community/useCommunityFeed";

const OPTIONS: { value: CommunityFeedSort; label: string }[] = [
  { value: "top", label: "Popular" },
  { value: "recent", label: "Latest" },
];

/**
 * Home's own sort control — the Claude Design mock's plain text-link
 * "Sort by" row (no border/fill, just a bold-and-brand-colored active
 * state), deliberately not PillGroup/CommunityFeedSortToggle's bordered-
 * pill look. Two different sort rows now exist in the app on purpose:
 * this one for Home's own layout pass, the older pill style unchanged
 * everywhere else PillGroup already renders it.
 */
export default function HomeSortToggle({
  mode,
  onChange,
}: {
  mode: CommunityFeedSort;
  onChange: (mode: CommunityFeedSort) => void;
}) {
  return (
    <div className="flex justify-left gap-5 py-3 border-b border-[var(--reader-border)]">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`cursor-pointer border-none bg-transparent font-bold text-[12px] ${
            mode === opt.value ? "text-brand-500" : "text-[var(--reader-text-subtle)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
