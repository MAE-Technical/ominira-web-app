"use client";

import { useEffect, type CSSProperties } from "react";
import { PLATFORM_NAME } from "@/lib/config/platform";
import { BRAND_TAGLINE, SPLASH_MARK, WORDMARK } from "@/lib/config/brand-assets";
import { APP_BG, SPLASH_DURATION_MS, SPLASH_FADE_MS, setThemeColor } from "@/lib/pwa/boot";

/**
 * The branded launch screen for the installed mobile PWA's Home launch.
 *
 * Always server-rendered but hidden by CSS: lib/pwa/boot.ts's inline <head>
 * script decides — before the first frame — whether this launch gets a
 * splash (html[data-splash]) and which theme it's in
 * (html[data-reader-theme]). So it's on screen, in the right theme, from the
 * very first paint, and never pops in after hydration or switches theme
 * mid-display. This component only schedules the fade-out.
 *
 * `persist` holds it on screen indefinitely — for reviewing the design at
 * /screen (app/screen/page.tsx), never for the real launch.
 */
export default function AppSplashScreen({ persist = false }: { persist?: boolean }) {
  useEffect(() => {
    const root = document.documentElement;

    // Review mode (app/screen): raise the splash and hold it — no fade, no
    // session bookkeeping — until the page is left.
    if (persist) {
      root.setAttribute("data-splash", "");
      return () => root.removeAttribute("data-splash");
    }

    if (!root.hasAttribute("data-splash")) return;

    // Measured from navigation start, so a slow hydration eats into the
    // splash instead of extending it.
    const fadeAt = Math.max(0, SPLASH_DURATION_MS - performance.now());
    const fade = window.setTimeout(() => {
      root.setAttribute("data-splash", "out");
      setThemeColor(APP_BG[root.getAttribute("data-reader-theme") === "dark" ? "dark" : "light"]);
    }, fadeAt);
    const remove = window.setTimeout(() => root.removeAttribute("data-splash"), fadeAt + SPLASH_FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, [persist]);

  return (
    // Inline display:none (not just the stylesheet) keeps it off every page
    // by default, so a missing/stale stylesheet can never leave it showing;
    // html[data-splash] .app-splash in globals.css overrides it (!important)
    // when active. Not the `hidden` attribute: Tailwind's preflight hides
    // [hidden] with its own layered !important, which nothing can override.
    <div
      className="app-splash"
      role="status"
      aria-label={`${PLATFORM_NAME} is loading`}
      style={
        {
          display: "none",
          "--splash-mark-light": `url(${SPLASH_MARK.light})`,
          "--splash-mark-dark": `url(${SPLASH_MARK.dark})`,
          "--splash-wordmark-light": `url(${WORDMARK.light})`,
          "--splash-wordmark-dark": `url(${WORDMARK.dark})`,
        } as CSSProperties
      }
    >
      {/* Mark + wordmark form one lockup (tight, like the sidebar's stacked
          BrandMark); the tagline is supporting copy, set apart below it. */}
      <div className="app-splash-lockup">
        <div className="app-splash-mark" aria-hidden="true" />
        <div className="app-splash-wordmark" aria-hidden="true" />
      </div>
      <p className="app-splash-tagline">{BRAND_TAGLINE}</p>
    </div>
  );
}
