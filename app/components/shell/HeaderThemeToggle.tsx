"use client";

import { Moon, Sun } from "lucide-react";
import { useReaderStore } from "@/stores/reader-store";

/**
 * AppHeader's one-tap theme switch for signed-out readers, in the slot the
 * notification bell takes once signed in (signed-in readers switch theme
 * from ProfileMenu). Shows the current theme — sun in light, moon in dark —
 * like ReaderHeader's toggle. Both icons render and <html>'s
 * data-reader-theme hides the other (.theme-*-only, globals.css), so the
 * right one is there on first paint rather than after reader-store
 * rehydrates. The click reads <html> for the same reason.
 */
export default function HeaderThemeToggle() {
  const setTheme = useReaderStore((s) => s.setTheme);

  const toggle = () => {
    const isDark = document.documentElement.getAttribute("data-reader-theme") === "dark";
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      className="flex flex-none cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
    >
      <Sun size={18} className="theme-light-only" />
      <Moon size={18} className="theme-dark-only" />
    </button>
  );
}
