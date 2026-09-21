import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Manrope, Literata } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";
import TouchActiveState from "./components/pwa/TouchActiveState";
import AppSplashScreen from "./components/pwa/AppSplashScreen";
import NowPlayingBar from "./components/NowPlayingBar";
import ThemeProvider from "./components/ThemeProvider";
import QueryProvider from "./components/QueryProvider";
import NarrationEngine from "@/lib/audio/NarrationEngine";
import { PLATFORM_NAME, PLATFORM_URL } from "@/lib/config/platform";

// The wider reader font picker (app/fonts.ts) is defined but not loaded here
// right now — only Literata (the current single reading-font default) is
// applied, so the other 7 self-hosted fonts aren't paying for themselves in
// bundle weight while there's no UI exposing them. Re-adding the picker is
// just restoring this import, not rebuilding the font definitions.

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const literata = Literata({
  variable: "--font-literata-google",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(PLATFORM_URL),
  title: { default: PLATFORM_NAME, template: `%s — ${PLATFORM_NAME}` },
  description: "Raise your Pan-African consciousness.",
  applicationName: PLATFORM_NAME,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: PLATFORM_NAME,
  },
  openGraph: {
    siteName: PLATFORM_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  other: {
    // Next only emits the standardized `mobile-web-app-capable` tag; older
    // iOS Safari (pre-17.4) only honors this legacy Apple-prefixed one for
    // standalone (no-browser-chrome) launch from the home screen.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  /** The @modal parallel slot (app/@modal) — null on every route except an
   * intercepted (.)read/[slug] navigation (app/@modal/(.)read/[slug]),
   * where it renders the reader as a full-viewport overlay on top of
   * `children` instead of replacing it. See ReaderModal's own doc comment. */
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Some browser extensions (password managers, form-fill tools, etc.)
      // inject their own attributes onto <html> before React hydrates —
      // e.g. a stray data-qb-installed. That's an external DOM mutation,
      // not a real client/server mismatch in this app's own markup, so it's
      // suppressed here rather than chased as a bug (per React's own
      // hydration-mismatch guidance).
      suppressHydrationWarning
      className={`${sourceSerif.variable} ${manrope.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <QueryProvider>
          <ThemeProvider>
            <AppSplashScreen />
            {children}
          </ThemeProvider>
          {modal}
          <ServiceWorkerRegistration />
          <TouchActiveState />
          <NarrationEngine />
          <NowPlayingBar />
          {/* `mode` is explicit (rather than relying on the "auto" default)
           * so a local `bun run dev` never reports as production even if
           * NODE_ENV gets overridden by tooling — only a real production
           * build sends events; every other mode just console-logs them. */}
          <Analytics
            mode={
              process.env.NODE_ENV === "production"
                ? "production"
                : "development"
            }
          />
        </QueryProvider>
      </body>
    </html>
  );
}
