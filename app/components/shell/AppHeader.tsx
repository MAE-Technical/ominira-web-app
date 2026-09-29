"use client";

import { Search } from "lucide-react";
import NotificationsMenu from "./NotificationsMenu";
import ProfileMenu from "./ProfileMenu";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";

type Props = {
  /** Omitted by pages with nothing to search yet (the stub pages) — the
   * input still renders, just uncontrolled and inert. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Fires when the search field gains focus — the home page uses this
   * (instead of searchValue/onSearchChange) to open SearchModal in its
   * library-wide mode rather than filtering in place the way LibraryView's
   * own controlled searchValue/onSearchChange pair does. When this is set
   * without onSearchChange, the field is made readOnly: there's nothing
   * local to type into here, since the modal owns the actual query. */
  onSearchFocus?: () => void;
};

/** The one browsing-chrome row every page shares (search + bell + profile).
 * A detail-style page (material details, a reader profile) that also needs
 * a back arrow / share action does NOT fold those into this component —
 * they're a different, page-specific row (see DetailHeader) stacked below
 * this one. An earlier version tried merging back/share into AppHeader
 * itself and it fought the search field for space and broke on pages that
 * don't want search at all; keeping the two rows separate is deliberate,
 * not a regression to "fix" back into one component again. */
export default function AppHeader({ searchValue, onSearchChange, onSearchFocus }: Props) {
  const isAuthenticated = useIsAuthenticated();

  return (
    <header className="mb-5 bg-[var(--reader-bg)] py-3">
      <div className="flex items-center gap-4">
        {/* Search first and flexible, account chrome last and fixed. The
            bell used to sit on the far left with the avatar on the far
            right, which read as two unrelated headers: they're one thing —
            "you" — so they travel together as a single cluster, with the
            bell nearest the field and the avatar at the edge (the same
            order, and the same right-hand corner, every app puts them in).
            The field no longer needs its own centering column, so it just
            grows into whatever space the cluster leaves. */}
        <div className="flex h-10 w-full min-w-0 max-w-sm items-center gap-2 rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] px-3.5">
          <Search size={16} className="flex-none text-[var(--reader-text-muted)]" />
          <input
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onFocus={onSearchFocus}
            readOnly={Boolean(onSearchFocus) && !onSearchChange}
            placeholder="Search the library"
            className="min-w-0 flex-1 border-none bg-transparent font-semibold text-[13px] text-[var(--reader-text)] outline-none placeholder:text-[var(--reader-text-subtle)]"
          />
        </div>

        {/* ml-auto: the cluster is pinned to the right edge whether or not
            the field above has grown to its max width. gap-4 (not the
            row's own gap) keeps the bell and the avatar reading as one
            group rather than as two separate header items — close enough
            to pair, far enough that the unread badge never overlaps the
            avatar beside it. */}
        <div className="ml-auto flex flex-none items-center gap-5">
          {isAuthenticated && <NotificationsMenu />}
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
