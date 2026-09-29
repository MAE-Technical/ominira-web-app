"use client";

import { useEffect } from "react";
import { useReaderStore } from "@/stores/reader-store";
import { APP_BG, setThemeColor } from "@/lib/pwa/boot";

// Mounted once at the root layout. The theme itself is put on <html> by
// lib/pwa/boot.ts's inline <head> script before the first paint, straight
// from the persisted reader prefs — every --reader-* token (and html/body's
// own background, globals.css) cascades from there. This component only
// keeps <html> in step when the reader toggles the theme afterwards.
//
// It deliberately does NOT wrap children in its own data-reader-theme div
// or write the store's pre-rehydration value anywhere: before rehydrate()
// the store holds the "light" default, and scoping that onto the tree (or
// onto <html>) was exactly what flashed light over a dark launch.
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const unsubscribe = useReaderStore.subscribe((state, prev) => {
      if (state.theme === prev.theme) return;
      const root = document.documentElement;
      root.setAttribute("data-reader-theme", state.theme);
      // The launch splash owns the chrome colour until it fades out.
      if (!root.hasAttribute("data-splash")) setThemeColor(APP_BG[state.theme]);
    });
    useReaderStore.persist.rehydrate();
    return unsubscribe;
  }, []);

  return children;
}
