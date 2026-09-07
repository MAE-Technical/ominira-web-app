"use client";

export type PillOption<T extends string> = { value: T; label: string };

/**
 * The one pill-filter look this app uses everywhere a reader narrows a
 * list down to one of a few named options — CategoryPills (library
 * categories), CommunityFeedSortToggle (Top/Recent), and the reader's own
 * annotation-feed filter (All/Notes/Highlights) all render through this,
 * rather than each inventing its own bordered-pill/segmented-control
 * styling. Individually bordered/filled pills, not a single joined
 * segmented track — reads clearly as "N independent choices" even at three
 * options on a narrow phone screen, which a joined segmented control (equal
 * splits of one shared border) started to compress unreadably.
 */
export default function PillGroup<T extends string>({
  options,
  selected,
  onSelect,
  scroll = false,
}: {
  options: PillOption<T>[];
  /** A single value for one-of-many pickers (the default everywhere else
   * this renders), or an array for many-of-many — pass the reader's current
   * selections and toggle membership yourself in onSelect. */
  selected: T | T[];
  onSelect: (value: T) => void;
  /** Wraps in the edge-to-edge horizontally-scrolling row CategoryPills
   * needs for an open-ended list of categories — omit (the default) for a
   * small, fixed set of options that should just sit inline on one row. */
  scroll?: boolean;
}) {
  const selectedSet = Array.isArray(selected) ? new Set(selected) : null;
  return (
    <div
      className={
        scroll
          ? "-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 no-callout shell:mx-0 shell:px-0"
          : "flex flex-wrap gap-2"
      }
    >
      {options.map((opt) => {
        const active = selectedSet ? selectedSet.has(opt.value) : opt.value === selected;
        return (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`flex-none whitespace-nowrap rounded-sm border px-3 py-2 text-xs font-bold cursor-pointer overflow-hidden transition-colors ${
              active
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
