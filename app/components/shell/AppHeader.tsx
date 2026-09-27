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

export default function AppHeader({ searchValue, onSearchChange, onSearchFocus }: Props) {
  const isAuthenticated = useIsAuthenticated();

  return (
    <header className="-mx-5 mb-5 bg-[var(--reader-bg)] px-5 py-3 shell:-mx-10 shell:px-10">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 max-w-md flex items-center gap-2 h-10 px-3.5 rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)]">
          <Search size={16} className="flex-none text-[var(--reader-text-muted)]" />
          <input
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onFocus={onSearchFocus}
            readOnly={Boolean(onSearchFocus) && !onSearchChange}
            placeholder="Search for a book"
            className="flex-1 min-w-0 border-none bg-transparent font-medium text-[14px] text-[var(--reader-text)] outline-none placeholder:text-[var(--reader-text-subtle)]"
          />
        </div>

        <div className="ml-auto flex flex-none items-center gap-2">
          {isAuthenticated && <NotificationsMenu />}
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
