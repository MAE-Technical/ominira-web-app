"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import AudioPlayer from "./AudioPlayer";
import { useAudioStore } from "@/stores/audio-store";
import { useNarrationStore } from "@/stores/narration-store";
import { useReaderStore } from "@/stores/reader-store";
import { useReaderOverlayStore } from "@/stores/reader-overlay-store";
import { useLayoutStore } from "@/stores/layout-store";

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
  const theme = useReaderStore((s) => s.theme);
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
  const overlayOpen = useReaderOverlayStore((s) => s.open);
  const hasSidebar = !pathname.startsWith("/read") || overlayOpen;
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
  const readerActive = pathname.startsWith("/read");
  const bottomNavHeight = useLayoutStore((s) => s.bottomNavHeight);
  const bottomOffset = readerActive ? 0 : bottomNavHeight;

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
      data-reader-theme={theme}
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
        // A real navigation, not router.push — see ReaderLink's own doc
        // comment. This bar can be tapped from any page (not just home),
        // so a soft push here would get intercepted into ReaderModal, still
        // leaving whatever page it was tapped from (its sidebar included)
        // visible underneath.
        onTitleClick={() => {
          window.location.href = `/read/${book.slug}`;
        }}
        onClose={closePlayer}
      />
    </div>
  );
}
