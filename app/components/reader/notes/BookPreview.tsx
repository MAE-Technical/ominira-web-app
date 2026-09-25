"use client";

import { Book, ChevronRight } from "lucide-react";

/** A note's book source — cover art (or a Book-icon fallback, when there's
 * no cover) on the left, title+section on the right, and a chevron that
 * only shows on hover (via the ancestor `<Link>`'s `group` class) as a hint
 * that the whole row is one deep link. Self-contained — see LinkPreview's
 * doc comment on why these don't share scaffolding. */
export default function BookPreview({
  title,
  section,
  coverUrl,
  onClick,
  bare = false,
}: {
  title: string;
  section?: string;
  coverUrl?: string | null;
  onClick?: () => void;
  /** Drops this row's own border/radius, keeping just the surface tint +
   * padding — for NoteBookContext fusing this in as the meta strip under a
   * quote block, one bordered card instead of two stacked ones (mirrors
   * VideoPreview's thumbnail+title/duration strip). */
  bare?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      className={`flex min-w-0 items-center gap-2.5 bg-[var(--color-app-surface-muted)] px-3 py-2.5 ${
        bare ? "" : "rounded-sm border border-[var(--color-app-border)]"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="h-[52px] w-[38px] flex-none rounded-[4px] object-cover" />
      ) : (
        <div className="flex h-[52px] w-[38px] flex-none items-center justify-center rounded-[4px] bg-[var(--color-app-surface-muted)] text-[var(--color-app-text-muted)]">
          <Book size={18} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-bold text-[var(--color-app-text)]">{title}</span>
        {section && <span className="truncate text-[11px] text-[var(--color-app-text-secondary)]">{section}</span>}
      </div>
      <ChevronRight
        aria-hidden="true"
        size={16}
        className="flex-none text-[var(--color-app-text-muted)]"
      />
    </div>
  );
}
