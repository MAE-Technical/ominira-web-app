"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Moon, Settings, Sun, LogOut, UserCircle } from "lucide-react";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useProfile } from "@/lib/auth/useProfile";
import { useLogout } from "@/lib/auth/useLogout";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";
import { avatarColor, avatarInitial } from "@/lib/reader/authorDisplay";
import { useReaderStore } from "@/stores/reader-store";

// AppHeader's avatar trigger + account dropdown — replaces the header's old
// standalone ThemeToggleButton: the theme switch now lives in here alongside
// View profile, Account, and Logout. Also covers the signed-out state: same
// trigger position, a plain user icon instead of the avatar, and a dropdown
// offering Log in / Join us instead — one menu instead of two separate
// header layouts.
export default function ProfileMenu() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { data: reader } = useProfile();
  const logout = useLogout();
  const theme = useReaderStore((s) => s.theme);
  const setTheme = useReaderStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-10 flex-none cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-semibold text-[var(--reader-text)] hover:bg-[var(--reader-surface-hover)]"
          >
            <UserCircle size={18} />
            Account
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="z-50 w-48 overflow-hidden rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-1.5 shadow-lg"
          >
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-sm px-2.5 py-2.5 text-[12px] font-semibold text-[var(--reader-text)] no-underline hover:bg-[var(--reader-surface-hover)]"
            >
              Log in
            </Link>
            <Link
              href="/auth/signup"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-sm px-2.5 py-2.5 text-[12px] font-semibold text-[var(--reader-accent)] no-underline hover:bg-[var(--reader-surface-hover)]"
            >
              Join us
            </Link>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  if (!reader) return null;
  const isDark = theme === "dark";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border-none p-0"
        >
          <span
            style={{ background: avatarColor(reader.pseudonym) }}
            className="flex h-full w-full items-center justify-center rounded-full text-sm font-bold text-white"
          >
            {avatarInitial(reader.pseudonym)}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-60 overflow-hidden rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] shadow-lg"
        >
          <Link
            href={`/@${pseudonymToSlug(reader.pseudonym)}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 border-b border-[var(--reader-border)] px-2.5 py-2.5 no-underline hover:bg-[var(--reader-surface-hover)]"
          >
            <span
              style={{ background: avatarColor(reader.pseudonym) }}
              className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-sm font-semibold text-white"
            >
              {avatarInitial(reader.pseudonym)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-[var(--reader-text)]">{reader.pseudonym}</div>
              <div className="text-xs font-semibold text-[var(--reader-text-muted)]">View profile</div>
            </div>
          </Link>

          <div className="p-1.5">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-sm px-2.5 py-2.5 text-[12px] font-semibold text-[var(--reader-text)] no-underline hover:bg-[var(--reader-surface-hover)]"
            >
              <Settings size={16} />
              Account
            </Link>
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-sm border-none bg-transparent px-2.5 py-2.5 text-left text-[12px] font-semibold text-[var(--reader-text)] hover:bg-[var(--reader-surface-hover)]"
            >
              {isDark ? <Moon size={16} /> : <Sun size={16} />}
              {isDark ? "Dark theme" : "Light theme"}
              <span className="ml-auto text-[11px] font-semibold text-[var(--reader-text-muted)]">
                {isDark ? "On" : "Off"}
              </span>
            </button>
            <div className="my-1.5 h-px bg-[var(--reader-border)]" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout.mutate(undefined, { onSuccess: () => router.push("/") });
              }}
              disabled={logout.isPending}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-sm border-none bg-transparent px-2.5 py-2.5 text-left text-[12px] font-semibold text-[var(--reader-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={16} />
              {logout.isPending ? "Logging out…" : "Log out"}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
