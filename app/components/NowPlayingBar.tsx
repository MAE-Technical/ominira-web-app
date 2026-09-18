"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import AudioPlayer from "./AudioPlayer";
import { useAudioStore } from "@/stores/audio-store";
import { useNarrationStore } from "@/stores/narration-store";
import { useReaderOverlayStore } from "@/stores/reader-overlay-store";
import { useLayoutStore } from "@/stores/layout-store";

// Matches both reader routes (app/read/[slug], the canonical/shareable URL,
// and app/reader/[slug], the soft-navigable one ReaderLink actually lands
// on — see that component's own doc comment) — deliberately with the
// trailing slash: a bare `startsWith("/read")` also matches `/reading`
// (app/(app)/reading/page.tsx, the "Continue reading" library page), which
// would wrongly hide this bar's sidebar offset and bottom-nav clearance
// while just browsing the library.
function isReaderPath(pathname: string): boolean {
  return pathname.startsWith("/read/") || pathname.startsWith("/reader/");
}

/**
 * The one persistent "now playing" bar — mounted once in the root layout
 * (alongside NarrationEngine, which actually drives playback) so it stays
 * fixed to the bottom of the viewport across every route, library
 * included. Renders nothing while no book is loaded for listening; the
 * reader's own X is the only thing that clears it (see audio-store's
 * closePlayer) — navigating away, including to the library, never does.
 */
export default function NowPlayingBar() {
  // --reader-surface/--reader-border/etc. (globals.css) are scoped to
  // [data-reader-theme] rather than :root, since only the reader itself
  // (not the rest of the app) is meant to follow the light/dark toggle.
  // This bar renders in the root layout though, outside Reader's own
  // theme-scoped div — without setting the attribute again here, those
  // variables would all resolve to nothing and the player would render
  // with no background/border/text color at all.
  //
  // Always forced to "dark" (never the reader's own light/dark toggle) —
  // AppBottomNav and this bar were rendering in near-identical surface
  // colors under the light theme, and on mobile (where they sit flush
  // against each other with no gap) that made them visually merge into one
  // strip. Dark theme's tokens are already black-surface/white-text
  // (globals.css), so pinning to it gives a real black bg + near-white
  // controls regardless of which theme the rest of the app is in, and
  // costs nothing extra when the app happens to already be in dark theme.
  const book = useAudioStore((s) => s.book);
  const closePlayer = useAudioStore((s) => s.closePlayer);
  const setPlayerHeight = useAudioStore((s) => s.setPlayerHeight);
  const audioSection = useNarrationStore((s) => s.audioSection);
  const canSkipToPrevSection = useNarrationStore((s) => s.canSkipToPrevSection);
  const canSkipToNextSection = useNarrationStore((s) => s.canSkipToNextSection);
  const skipToPrevSection = useNarrationStore((s) => s.skipToPrevSection);
  const skipToNextSection = useNarrationStore((s) => s.skipToNextSection);
  const handleSeek = useNarrationStore((s) => s.handleSeek);
  const isBuffering = useNarrationStore((s) => s.isBuffering);
  // Every route except the reader itself now has a persistent left sidebar
  // (app/components/shell/AppSidebar.tsx) at the same 860px breakpoint —
  // full-width here would run this bar underneath it, covering the
  // sidebar's own bottom-pinned theme/logout controls.
  //
  // pathname alone can't tell "the standalone /read page" (no sidebar)
  // apart from "ReaderModal open over a sidebar-having page" (sidebar's
  // still there) — an intercepted (.)read/[slug] navigation moves the URL
  // to /read/[slug] either way. overlayOpen (reader-overlay-store) is what
  // ReaderModal itself sets, so it's the actual source of truth here; a
  // pathname starting with "/read" only means "no sidebar" when that flag
  // says the overlay isn't the reason. Without this override, this bar ran
  // full-width underneath the modal and sat on top of the sidebar's own
  // nav items (z-50 vs. the sidebar's z-30) whenever a book was loaded for
  // listening while the reader overlay was open — silently eating clicks
  // on whatever nav item it happened to cover.
  const pathname = usePathname();
  const router = useRouter();
  const overlayOpen = useReaderOverlayStore((s) => s.open);
  const hasSidebar = !isReaderPath(pathname) || overlayOpen;
  const containerRef = useRef<HTMLDivElement>(null);

  // Floats above AppBottomNav (the mobile tab bar) rather than the other
  // way around — see AppBottomNav's own doc comment. The reader is the one
  // place AppBottomNav is either unmounted (standalone route) or fully
  // covered by the modal panel (intercepted route) — bottomNavHeight can
  // briefly go stale there (AppBottomNav unmounting doesn't reset it), so
  // it's ignored outright rather than trusted while the reader's on screen.
  // The intercepted (.)read/[slug] route still moves the URL to
  // /read/[slug] (see the hasSidebar comment above), so pathname alone
  // reliably tells "the reader itself is on screen" apart from "an ordinary
  // page, sidebar or not".
  const readerActive = isReaderPath(pathname);
  const bottomNavHeight = useLayoutStore((s) => s.bottomNavHeight);
  // +6px whenever AppBottomNav is actually on screen — a hairline gap so
  // the two bars read as separate surfaces rather than a seam, now that
  // both are dark enough (this bar forced to dark theme, see above) that
  // touching edges alone no longer made that obvious.
  const bottomOffset = readerActive ? 0 : bottomNavHeight + (bottomNavHeight > 0 ? 6 : 0);

  // The reader's own notes/annotation-feed panel (desktop "side" variant)
  // is a plain flex sibling with no elevation of its own — without pulling
  // in to clear it, this bar's full width ran right underneath its bottom
  // edge, covering it. See layout-store's readerPanelOpen for why this only
  // matters while the reader itself is on screen.
  const readerPanelOpen = useLayoutStore((s) => s.readerPanelOpen);
  const clearsReaderPanel = readerActive && readerPanelOpen;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !book) {
      setPlayerHeight(0);
      return;
    }
    const ro = new ResizeObserver((entries) => setPlayerHeight(entries[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [book, setPlayerHeight]);

  if (!book) return null;

  return (
    <div
      ref={containerRef}
      data-reader-theme="dark"
      className={`fixed left-0 right-0 z-50 ${hasSidebar ? "shell:left-[var(--app-sidebar-w)]" : ""} ${
        clearsReaderPanel ? "shell:right-95" : ""
      }`}
      style={{ bottom: bottomOffset }}
    >
      <AudioPlayer
        variant="full"
        bookTitle={book.metadata.title}
        chapterLabel={audioSection?.title ?? book.metadata.title}
        coverSrc={book.metadata.cover}
        isBuffering={isBuffering}
        onSeek={handleSeek}
        onSkipPrev={skipToPrevSection}
        onSkipNext={skipToNextSection}
        canSkipPrev={canSkipToPrevSection}
        canSkipNext={canSkipToNextSection}
        // A soft push straight at /reader/[slug] (not /read/[slug]) — same
        // reasoning as ReaderLink's own doc comment: that route falls
        // outside @modal's interception convention, so this bar can be
        // tapped from any page without getting hijacked into ReaderModal,
        // and without the hard reload a /read/[slug] navigation used to
        // need to dodge that.
        onTitleClick={() => {
          router.push(`/reader/${book.slug}`);
        }}
        onClose={closePlayer}
      />
    </div>
  );
}
