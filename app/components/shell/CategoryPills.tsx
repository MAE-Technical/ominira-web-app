"use client";

import PillScrollRow from "./PillScrollRow";

type Props = {
  items: { key: string; label: string }[];
  allKey: string;
  allLabel?: string;
  selected: string;
  /** Called with each item's key (including `allKey`) to build its href.
   * Library passes real `/library?q=...` URLs; Home passes "#" for now
   * since its topic filter doesn't have a URL of its own yet — see
   * `onSelect`. */
  hrefFor: (key: string) => string;
  /** Omit for a pure navigation filter (Library). Pass to intercept the
   * click (`e.preventDefault()`, then this) and filter in place instead —
   * Home's topic filter, until it grows a real URL like Library's. */
  onSelect?: (key: string) => void;
};

/**
 * The shared category/topic pill filter — Library's category filter (real
 * navigation to `/library?q=<slug>`) and Home's topic filter (in-place
 * filter via `onSelect`) both render through this one component rather
 * than each reimplementing the row around PillScrollRow. The one real
 * difference between them — navigate vs. filter-in-place — is just
 * whether `onSelect` is passed, not a reason for two components.
 */
export default function CategoryPills({ items, allKey, allLabel = "All", selected, hrefFor, onSelect }: Props) {
  return (
    <PillScrollRow
      items={[{ key: allKey, label: allLabel }, ...items].map(({ key, label }) => ({
        key,
        label,
        active: key === selected,
        href: hrefFor(key),
        onClick: onSelect
          ? (e: React.MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              onSelect(key);
            }
          : undefined,
      }))}
    />
  );
}
