"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { LogOut, MoreVertical, X } from "lucide-react";
import { NAV_ITEMS } from "./navItems";
import BrandMark from "./BrandMark";
import { useReaderOverlayStore } from "@/stores/reader-overlay-store";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useProfile } from "@/lib/auth/useProfile";
import { useLogout } from "@/lib/auth/useLogout";
import { avatarColor, avatarInitial } from "@/lib/reader/authorDisplay";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Persistent desktop nav rail — hidden below the same 860px breakpoint
 * ChaptersDrawer/Reader.tsx's notes panel already use for "does this layout
 * have room to push sideways", so AppBottomNav (mobile) takes over below it.
 */
export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const overlayOpen = useReaderOverlayStore((s) => s.open);
  const isAuthenticated = useIsAuthenticated();
  const { data: reader } = useProfile();
  const logout = useLogout();
  // Dismissing the promo card only clears it for this page load, not
  // forever — HomeAuthBanner (the other login discovery surface) only
  // renders on /home, so a permanent dismiss here would leave a reader who
  // then browses elsewhere with no in-app path back to Log in/Join us.
  const [promoDismissed, setPromoDismissed] = useState(false);

  // A soft (client-side) navigation away while ReaderModal is open didn't
  // reliably leave Next's own interception/parallel-route state clean —
  // the destination page rendered, but the *next* deep link into the
  // reader (a different book's ArrowUpRight) could then silently fail to
  // open, leaving the page it landed on unresponsive to clicks until a
  // hard reload. A real browser navigation sidesteps that whole class of
  // problem by resetting everything, at the cost of a full reload instead
  // of an instant client transition — worth it specifically here, since
  // it's the one moment guaranteed to already be mid-navigation anyway.
  const onNavClick = overlayOpen
    ? (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        window.location.href = e.currentTarget.href;
      }
    : undefined;

  // Account has nothing to show without an account — hidden rather than
  // repurposed the way it used to be (swapped for Log in/Join us rows);
  // those now live in the promo card below instead.
  const items = NAV_ITEMS.filter((item) => item.href !== "/account" || isAuthenticated);

  return (
    <aside className="hidden shell:flex fixed left-0 top-0 h-full w-[var(--app-sidebar-w)] z-30 flex-col box-border border-r border-[var(--reader-border)] bg-[var(--reader-surface)] select-none no-callout">
      <Link
        href="/home"
        onClick={onNavClick}
        aria-label="Ominira home"
        className="flex-none px-4 pt-[18px] pb-3.5 no-underline"
      >
        <BrandMark />
      </Link>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 pt-2 flex flex-col gap-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className={`flex items-center gap-3 rounded-sm px-2.5 py-2.5 text-sm font-semibold no-underline transition-colors active:scale-[0.97] ${
                active
                  ? "bg-[var(--reader-accent)]/10 text-[var(--reader-accent)]"
                  : "text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)]"
              }`}
            >
              <Icon size={19} />
              {label}
            </Link>
          );
        })}

        {!isAuthenticated && !promoDismissed && (
          <div className="mt-3.5 rounded-md border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--reader-text)]">New to Ominira?</span>
              <button
                type="button"
                onClick={() => setPromoDismissed(true)}
                aria-label="Dismiss"
                className="cursor-pointer rounded-sm border-none bg-transparent p-0.5 text-[var(--reader-text-subtle)] hover:text-[var(--reader-text-muted)]"
              >
                <X size={14} />
              </button>
            </div>
            <p className="m-0 mb-2.5 text-xs font-medium leading-relaxed text-[var(--reader-text-muted)]">
              Raise your Pan-African consciousness. Read revolutionary books. Share your thoughts with other comrades.
            </p>
            <div className="flex gap-4">
              <Link
                href="/auth/login"
                onClick={onNavClick}
                className="text-[13px] font-medium text-[var(--reader-text-muted)] no-underline hover:text-[var(--reader-text)]"
              >
                Log in
              </Link>
              <Link
                href="/auth/signup"
                onClick={onNavClick}
                className="text-[13px] font-bold text-[var(--reader-accent)] no-underline hover:opacity-80"
              >
                Join us
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Theme switching lives in AppHeader, beside the notification bell —
          this footer is account-only. Log in / Join us live in the promo
          card above instead, alongside HomeAuthBanner on mobile, whenever
          !isAuthenticated. */}
      {isAuthenticated && reader && (
        <div className="flex-none px-4 pb-6 flex items-center gap-2.5">
          <span
            style={{ background: avatarColor(reader.pseudonym) }}
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
          >
            {avatarInitial(reader.pseudonym)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--reader-text)]">
            {reader.pseudonym}
          </span>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="cursor-pointer flex-none rounded-sm border-none bg-transparent p-0.5 text-[var(--reader-text-subtle)] hover:text-[var(--reader-text-muted)]"
              >
                <MoreVertical size={16} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={6}
                className="z-50 min-w-40 rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-1 shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/") })}
                  disabled={logout.isPending}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-sm border-none bg-transparent px-2.5 py-2 text-[13px] font-medium text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut size={15} />
                  {logout.isPending ? "Logging out…" : "Logout"}
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}
    </aside>
  );
}
