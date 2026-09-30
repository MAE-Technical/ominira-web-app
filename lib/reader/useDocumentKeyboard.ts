"use client";

import { useEffect } from "react";

/** How far Up/Down move the scroll — a line-ish nudge, matching what a browser's
 * own arrow-key scroll does on an ordinary page. */
const LINE_STEP_PX = 64;
/** What a screenful means for PageUp/PageDown and Space: not the full height,
 * so a line or two of context carries over the jump — the same overlap every
 * document viewer (Preview, Acrobat, Chrome's PDF viewer) keeps. */
const PAGE_OVERLAP_PX = 64;
/** Fraction of the remaining distance covered each frame. At 60fps ~0.18 lands a
 * line step in about six frames: fast enough to feel like a direct response,
 * slow enough that the eye follows the text instead of being cut to a new
 * position. */
const EASE = 0.18;

/**
 * Desktop keyboard navigation for the single-document viewers (PDF, DOCX, web
 * article) — the keys a reader already expects from every other document viewer:
 *
 *   ← / →            a screenful
 *   ↑ / ↓            scroll by a line
 *   PageUp/PageDown  scroll by a screenful
 *   Space/Shift+Space   ditto (the long-standing reading shortcut)
 *   Home / End       top / bottom of the document
 *
 * Bound on `window` rather than the scroll container because the container is
 * not focusable and nothing in these viewers holds focus after open, so a
 * container-scoped listener would simply never fire — the same reason
 * DocumentOverlayShell binds Escape at the window. Typing is respected: a
 * keystroke aimed at a form field (the pager's page input, a note composer) or
 * carrying a modifier (⌘F, ⌘←/browser-back) is left alone.
 *
 * Scrolling is animated here, frame by frame, rather than handed to
 * `scrollTo({ behavior: "smooth" })`. The native version restarts its animation
 * from a standstill on every call, so a held or repeated arrow key — the normal
 * way anyone reads down a page — produced a stutter of overlapping starts and
 * stops. Keeping our own target means repeat keystrokes *accumulate* into one
 * continuous glide, which is the whole difference between paging and reading.
 */
export function useDocumentKeyboard({ scrollElement }: { scrollElement: HTMLElement | null }) {
  useEffect(() => {
    if (!scrollElement) return;

    // The in-flight glide: where it's heading, and the frame it's waiting on.
    // Null when the scroll is at rest, which is also how a new keystroke knows
    // whether to start a loop or just move the goalposts of the running one.
    let glide: { target: number; frame: number } | null = null;

    const stop = () => {
      if (glide) cancelAnimationFrame(glide.frame);
      glide = null;
    };

    const glideBy = (delta: number) => {
      const max = scrollElement.scrollHeight - scrollElement.clientHeight;
      // From the *target*, not the current position, while a glide is running —
      // that's what makes a second keystroke mean "one more line further on"
      // rather than "one line from wherever this animation happens to be".
      const from = glide ? glide.target : scrollElement.scrollTop;
      const target = Math.max(0, Math.min(max, from + delta));
      if (glide) {
        glide.target = target;
        return;
      }
      const step = () => {
        if (!glide) return;
        const remaining = glide.target - scrollElement.scrollTop;
        if (Math.abs(remaining) < 0.5) {
          scrollElement.scrollTop = glide.target;
          glide = null;
          return;
        }
        // At least a pixel a frame, or the tail of the ease would crawl.
        scrollElement.scrollTop += Math.abs(remaining) < 2 ? remaining : remaining * EASE;
        glide.frame = requestAnimationFrame(step);
      };
      glide = { target, frame: requestAnimationFrame(step) };
    };

    const glideTo = (top: number) => {
      stop();
      glideBy(top - scrollElement.scrollTop);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;

      const screenful = Math.max(LINE_STEP_PX, scrollElement.clientHeight - PAGE_OVERLAP_PX);

      switch (event.key) {
        case "ArrowLeft":
          glideBy(-screenful);
          break;
        case "ArrowRight":
          glideBy(screenful);
          break;
        case "ArrowUp":
          glideBy(-LINE_STEP_PX);
          break;
        case "ArrowDown":
          glideBy(LINE_STEP_PX);
          break;
        case "PageUp":
          glideBy(-screenful);
          break;
        case "PageDown":
          glideBy(screenful);
          break;
        case " ":
          glideBy(event.shiftKey ? -screenful : screenful);
          break;
        case "Home":
          glideTo(0);
          break;
        case "End":
          glideTo(scrollElement.scrollHeight);
          break;
        default:
          return;
      }
      // Only once a key was actually handled — otherwise this would swallow
      // Escape (the overlay's close) and every typed character.
      event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    // A wheel, a drag or a touch mid-glide is the reader taking over; carrying on
    // toward a target they've scrolled away from would drag them back.
    for (const type of ["wheel", "touchstart", "pointerdown"] as const)
      scrollElement.addEventListener(type, stop, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      for (const type of ["wheel", "touchstart", "pointerdown"] as const)
        scrollElement.removeEventListener(type, stop);
      stop();
    };
  }, [scrollElement]);
}
