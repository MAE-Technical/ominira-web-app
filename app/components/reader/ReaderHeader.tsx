"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Moon, Play, Search, Sun, X } from "lucide-react";
import type { Section } from "@/lib/book/schema";
import { useReaderStore } from "@/stores/reader-store";
import Tooltip from "./Tooltip";
import ChapterPill from "./ChapterPill";

type Props = {
  visible: boolean;
  topBarHeightPx: number;
  railInsetPx: number;
  /** Present only when Reader is mounted inside the (.)read/[slug] overlay
   * (ReaderModal.tsx) — swaps the leading control from a Link back to home
   * into a plain close button, since "back" would otherwise describe a
   * page navigation that isn't actually happening here (see Reader.tsx's
   * own doc comment on this prop). Absent on the standalone /read/[slug]
   * route, which uses browser history. Deliberately the *only* thing
   * that picks X vs. the back arrow — same on mobile and desktop, an
   * overlay is always X and a standalone page is always back, regardless
   * of viewport. */
  onClose?: () => void;
  /** No listen button at all when there's nothing to narrate — not even a
   * disabled one. Otherwise always true in practice: NarrationEngine falls
   * back to live, on-demand AI narration for any section without a
   * prerecorded track, so this isn't gated on one existing. */
  canListen: boolean;
  /** While true, the button below is hidden entirely rather than turned
   * into a play/pause toggle — the persistent player (NowPlayingBar) is
   * the only place play/pause lives once listening has started, so
   * there's exactly one control per action and no way for the two to
   * drift out of sync. This button's only job is *starting* listen mode;
   * closing the player (its own X) is what brings it back. */
  isListen: boolean;
  onListen: () => void;
  onToggleSearch: () => void;
  /** Current chapter/section, rendered as a ChapterPill between the back
   * button and the icon cluster — see ChapterPill's own doc comment for
   * why the outline no longer has a dedicated icon. */
  activeSection: Section | undefined;
  onToggleChapters: () => void;
};

const iconButtonClass =
  "w-9 h-9 rounded-md border-none bg-transparent cursor-pointer flex items-center justify-center flex-none text-[var(--reader-text)] transition-colors hover:bg-[var(--reader-surface-hover)]";

/**
 * Header — back arrow, the current-chapter pill (opens the outline — see
 * ChapterPill), and (right) listen, search, and a theme switch. Deliberately
 * thin: the old outline icon, book title/author block, and notes-feed
 * button are gone — notes moved to the floating NotesFeedFab. The fuller
 * type/layout config menu (font size, spacing, width, family) that used to
 * live behind a "Settings" popover here is shelved for now in favor of this
 * plain sun/moon toggle, same as it was before that popover existed — those
 * settings stay at their defaults until a proper settings module replaces
 * this. Same show/hide-on-scroll/click lifecycle as before — the chapter
 * pill lives inside this bar now (not an independent overlay) specifically
 * so it shares that lifecycle rather than staying on screen through it, per
 * reader feedback that a persistent element undercut the distraction-free
 * reading experience.
 */
export default function ReaderHeader({
  visible,
  topBarHeightPx,
  railInsetPx,
  onClose,
  canListen,
  isListen,
  onListen,
  onToggleSearch,
  activeSection,
  onToggleChapters,
}: Props) {
  const router = useRouter();
  const theme = useReaderStore((s) => s.theme);
  const setTheme = useReaderStore((s) => s.setTheme);

  return (
    <div
      style={{ height: topBarHeightPx, paddingLeft: railInsetPx, paddingRight: railInsetPx }}
      // select-none/no-callout: this is all chrome, nothing here is meant
      // to be selectable text — same reasoning as the .no-callout comment
      // in globals.css (an explicit boundary, not an inherited guess, is
      // what keeps Safari's long-press selection from getting confused).
      className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 box-border border-b border-[var(--reader-border)] bg-[var(--reader-surface)] transition-[transform,opacity] duration-200 ease-out select-none no-callout ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      {/* Back/close + the chapter pill are one group here (not two direct
          flex children of the justify-between row) so this still lays out
          correctly whether or not ChapterPill has anything to show (it
          renders null with no active section) — justify-between only ever
          sees this group and the icon cluster below, not a 2-vs-3-children
          reshuffle. */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        {onClose ? (
          <Tooltip label="Close" side="bottom" align="start">
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-md border border-[var(--reader-border)] bg-[var(--reader-surface)] flex items-center justify-center text-[var(--reader-text)] flex-none cursor-pointer"
            >
              <X size={18} />
            </button>
          </Tooltip>
        ) : (
          <Tooltip label="Back" side="bottom" align="start">
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="w-9 h-9 rounded-md border border-[var(--reader-border)] bg-[var(--reader-surface)] flex items-center justify-center text-[var(--reader-text)] no-underline flex-none"
            >
              <ArrowLeft size={18} />
            </button>
          </Tooltip>
        )}

        <ChapterPill section={activeSection} onClick={onToggleChapters} />
      </div>

      <div className="flex items-center gap-1.5 md:gap-2 flex-none">
        {canListen && !isListen && (
          <Tooltip label="Listen to this book" side="bottom">
            <button onClick={onListen} aria-label="Listen to this book" className={iconButtonClass}>
              <Play size={16} />
            </button>
          </Tooltip>
        )}

        <Tooltip label="Search" side="bottom" align="end">
          <button onClick={onToggleSearch} aria-label="Search" className={iconButtonClass}>
            <Search size={16} />
          </button>
        </Tooltip>

        <Tooltip label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} side="bottom" align="end">
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            className={iconButtonClass}
          >
            {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
