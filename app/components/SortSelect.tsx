"use client";

import { ChevronDown } from "lucide-react";

export type SortOption<T extends string> = { value: T; label: string };

/**
 * The one shared "Sort by" control wherever a feed needs real ranking
 * options (Top/Recent today, plus the reader's own "Book order") — the
 * book-wide notes panel (FeedSortToggle) and the home community feed
 * (CommunityFeedSortToggle) both render through this, rather than each
 * inventing its own dropdown. A native `<select>`, not PillGroup's pill
 * toggle — sort is a single current choice among options that read fine
 * collapsed (unlike PillGroup's own callers, e.g. CategoryPills, where
 * seeing every option at once matters), and a select scales to more
 * options later without needing a wider and wider row of buttons. No
 * visible "Sort by" text — the selected option's own name (e.g. "Recent")
 * already says what this is once it's sitting next to the content it
 * sorts; `label` still names the control for assistive tech via
 * `aria-label`, just not as an extra word on screen. Sits on the same
 * subtle, theme-aware `--reader-surface-hover` tint as FeedItemLabel (the
 * book-wide feed's own category label) — one shared "quietly tinted, not a
 * bare outline" treatment for this kind of small metadata chrome, rather
 * than each inventing its own.
 */
export default function SortSelect<T extends string>({
  label = "Sort by",
  options,
  value,
  onChange,
}: {
  label?: string;
  options: SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface-hover)] py-1 pl-2 pr-6 text-xs font-semibold text-[var(--reader-text)] cursor-pointer outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-1.5 text-[var(--reader-text-muted)]" />
    </span>
  );
}
