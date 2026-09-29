"use client";

import { Plus, Upload } from "lucide-react";
import type { CategoryContributionStats } from "@/lib/materials/list";
import ReaderAvatar from "@/app/components/shared/ReaderAvatar";

const CONTRIBUTOR_LIST_THRESHOLD = 10;
const MAX_STACKED_AVATARS = 8;

/**
 * "Add a book" entry point — library-contribution-ux-spec.md Step 1+2,
 * Claude Design "Contribute Book Card" project, direction 2a: a header row
 * (quiet upload icon + heading/subhead + a solid brand "add" badge as the
 * one clear affordance) with a contributor strip as a calmer second row
 * underneath, separated by a divider — proof never competes with the ask,
 * and it only appears once there are enough contributors
 * (>= CONTRIBUTOR_LIST_THRESHOLD) to read as a real, established group.
 */
export default function ContributeBookRow({
  category,
  stats,
  onClick,
}: {
  category: string;
  stats: CategoryContributionStats;
  onClick: () => void;
}) {
  const contributorCount = stats.contributors.length;
  const showContributors = contributorCount >= CONTRIBUTOR_LIST_THRESHOLD;
  const stacked = stats.contributors.slice(0, MAX_STACKED_AVATARS);
  const heading = category === "All" ? "Add a book to the library" : `Add a book to ${category}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group mb-8 flex w-full cursor-pointer flex-col rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-5 text-left transition-colors"
    >
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-500/10">
          <Plus size={20} className="text-brand-500" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-[var(--reader-text)]">{heading}</p>
          <p className="mt-1 text-[12px] font-semibold text-[var(--reader-text-muted)]">
            PDF, EPUB, or DOCX
          </p>
        </div>

        <div className="flex h-9 w-9 flex-none items-center justify-center border rounded-full border-[var(--reader-border)]">
          <Upload size={18} className="text-[var(--reader-text-muted)]" />
        </div>
      </div>

      {showContributors && (
        <div className="mt-4 flex items-center gap-2.5 border-t border-[var(--reader-border)] pt-3.5">
          <div className="flex flex-none items-center">
            {stacked.map((contributor) => (
              <div key={contributor.readerId} title={contributor.pseudonym} className="-ml-1.5 flex-none first:ml-0">
                <ReaderAvatar pseudonym={contributor.pseudonym} avatar={contributor.avatar} size={32} className="border-2 border-[var(--reader-surface)]" />
              </div>
            ))}
          </div>
          <span className="text-[14px] font-semibold text-[var(--reader-text-muted)]">
            {contributorCount} comrades have added books here
          </span>
        </div>
      )}
    </button>
  );
}
