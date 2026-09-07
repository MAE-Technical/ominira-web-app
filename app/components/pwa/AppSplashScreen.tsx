"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PLATFORM_NAME } from "@/lib/config/platform";
import { useReaderStore } from "@/stores/reader-store";

const SPLASH_DURATION_MS = 2000;
const SPLASH_SESSION_KEY = "ominira:pwa-launch-splash-shown";

// Theme controls the visual treatment only. Add future splash quotations here
// without changing the layout or binding a quotation to a color scheme.
const SPLASH_QUOTES = [
  {
    text: "Imperialism is a system of exploitation that occurs not only in the brutal form of those who come with guns to conquer territory... We are fighting this system that allows a handful of men on Earth to rule all of humanity.",
    attribution: "— Thomas Sankara",
  },
  {
    text: "The decolonization of the mind is necessary as the decolonization of the land.",
    attribution: "— Frantz Fanon",
  },
] as const;

/**
 * The branded launch screen for the installed mobile PWA's initial Home
 * load. All ordinary routes and browser/desktop visits use their normal
 * loading UI instead. The manifest background remains the native first
 * paint; this supplies the branded, theme-aware screen immediately after.
 */
export default function AppSplashScreen() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const hasShownThisMount = useRef(false);
  // A stable initial value avoids an SSR/client hydration mismatch. The
  // animation-frame callback then selects a fresh quote for each app launch.
  const [quoteIndex, setQuoteIndex] = useState(0);
  const theme = useReaderStore((state) => state.theme);
  const assetTheme = theme === "dark" ? "dark" : "light";

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    // A Home launch is the app-start moment we brand. A detail/admin URL is
    // regular navigation, even when opened directly from an installed app.
    if (!isStandalone || !isMobile || pathname !== "/home") return;
    if (hasShownThisMount.current) return;

    try {
      if (window.sessionStorage.getItem(SPLASH_SESSION_KEY)) {
        hasShownThisMount.current = true;
        return;
      }
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    } catch {
      // Storage can be unavailable in privacy-restricted contexts. The
      // splash remains safe to show once for this page lifetime there.
    }

    hasShownThisMount.current = true;
    const showTimeout = window.setTimeout(() => setVisible(true), 0);
    const hideTimeout = window.setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
    return () => {
      window.clearTimeout(showTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, [pathname]);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      setQuoteIndex(Math.floor(Math.random() * SPLASH_QUOTES.length));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);

  if (!visible || pathname !== "/home") return null;

  const dark = theme === "dark";
  const quote = SPLASH_QUOTES[quoteIndex];

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-hidden transition-opacity duration-200"
      style={{ background: dark ? "#1d1c1b" : "#ffffff" }}
      aria-label={`${PLATFORM_NAME} is loading`}
      role="status"
    >
      <div className="flex min-h-[100svh] w-full max-w-[440px] flex-col px-6 py-12 shell:px-8 shell:py-16">
        <header className="grid w-full max-w-[340px] grid-cols-[53px_1fr_53px] self-center items-center">
          <span aria-hidden="true" />
          <p className="text-center font-serif text-3xl font-semibold tracking-[0.08em] text-[#b74f34] uppercase shell:text-4xl">
            {PLATFORM_NAME}
          </p>
          <Image
            src={`/images/splash/${assetTheme}-accent.svg`}
            alt=""
            width={53}
            height={55}
            unoptimized
            priority
            className="h-[55px] w-[53px] justify-self-end"
          />
        </header>
        <div className="mt-[clamp(4rem,12svh,7rem)] w-full max-w-[400px] self-center text-center font-serif text-lg leading-[1.28] text-[#b74f34] shell:text-2xl">
          <p>{quote.text}</p>
          <p className="mt-5">{quote.attribution}</p>
        </div>
        <Image
          src={`/images/splash/${assetTheme}-illustration-new.svg`}
          alt=""
          width={340}
          height={347}
          unoptimized
          priority
          className="mt-auto w-full max-w-[400px] self-center"
        />
      </div>
    </div>
  );
}
