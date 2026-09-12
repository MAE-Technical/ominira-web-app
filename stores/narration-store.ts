import { create } from "zustand";
import type { Section } from "@/lib/book/schema";
import type { KaraokeWord } from "@/lib/audio/karaoke";

/**
 * Derived narration state for whichever book is currently playing
 * (audio-store's `book`) — kept separate from audio-store itself since
 * these fields are recomputed continuously as playback advances (spine
 * section, active passage) rather than being plain playback controls.
 * Written exclusively by lib/audio/NarrationEngine.tsx, the single
 * component (mounted once in the root layout) that owns the real
 * `<audio>` element; every action here is a placeholder until the engine
 * mounts and replaces it, which happens before anything else in the app
 * can render a control that calls one.
 */
type NarrationState = {
  audioSection: Section | undefined;
  /** Which passage is currently being narrated — Reader.tsx uses this,
   * together with `currentWords` below, to find the exact [data-word-index]
   * span to mark om-narrating-word (globals.css) within that passage's
   * [data-passage-id] element. */
  currentPlayingPassageId: string | undefined;
  /** Word-level timings for whichever clip currentPlayingPassageId points
   * at (live.words in NarrationEngine) — empty until that clip has actually
   * finished synthesizing. Reader.tsx scans this against currentTimeMs
   * every tick to find the one [data-word-index] span to mark
   * om-narrating-word; see that effect's own comment on why this has to be
   * imperative DOM rather than a prop threaded into PassageText. */
  currentWords: KaraokeWord[];
  /** Spine index of the section currently narrating, -1 when nothing is
   * playing. Reader compares this against its own carousel activeIndex to
   * decide whether it's "following along". */
  audioIndex: number;
  canSkipToPrevSection: boolean;
  canSkipToNextSection: boolean;
  /** True whenever the current passage isn't playable yet (still
   * synthesizing, or its last attempt failed) — drives the player's
   * buffering spinner. */
  isBuffering: boolean;
  /** Bumped by NarrationEngine every time narration moves because the
   * reader explicitly asked it to (a chapter-skip button, the chapters
   * drawer, clicking a passage/word) — as opposed to the 'ended' handler
   * quietly advancing to the next passage on its own. This is the one
   * signal Reader.tsx's own carousel-follow effect uses to decide whether
   * to move the visual carousel: an explicit jump always follows,
   * regardless of where the reader was previously looking, while a plain
   * auto-advance only follows if they were already watching along. Reader
   * used to also call its own navigateToSection directly from the
   * chapters drawer's click handler, alongside this — two independent
   * places deciding "what section is the reader looking at" for the same
   * click, racing each other. This field is what let that second call
   * site go away: every "jump narration somewhere" entry point (drawer,
   * skip buttons, word click) now funnels through the single
   * requestTarget reconciler in NarrationEngine, which is the only thing
   * that ever bumps this, and Reader's follow effect is the only thing
   * that ever reacts to it — one producer, one consumer, instead of two
   * call sites each independently moving the carousel. */
  explicitJumpSeq: number;

  seekToPassageForListening: (sectionId: string, passageId: string) => void;
  skipToPrevSection: () => void;
  skipToNextSection: () => void;
  /** Jumps narration straight to any section (not just an adjacent one) —
   * ChaptersDrawer's own row clicks use this while in listen mode, the
   * same primitive skipToPrev/NextSection are themselves built on. */
  jumpToSection: (sectionId: string) => void;
  handleWordClick: (passageId: string, wordIndex: number) => void;
  handleSeek: (ms: number) => void;
};

export const useNarrationStore = create<NarrationState>(() => ({
  audioSection: undefined,
  currentPlayingPassageId: undefined,
  currentWords: [],
  audioIndex: -1,
  canSkipToPrevSection: false,
  canSkipToNextSection: false,
  isBuffering: false,
  explicitJumpSeq: 0,

  seekToPassageForListening: () => {},
  skipToPrevSection: () => {},
  skipToNextSection: () => {},
  jumpToSection: () => {},
  handleWordClick: () => {},
  handleSeek: () => {},
}));
