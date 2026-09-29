"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import MembersOnlyPrompt from "@/app/components/reader/notes/MembersOnlyPrompt";

/**
 * "Save this for later" — the one bookmark control, shared by book rows
 * (BookListRow), a book's own detail page (DetailHeader) and community
 * posts (NoteThreadCard).
 *
 * Icon-only, with no count beside it, which is the visible half of the
 * decision the bookmarks table itself makes (migrations/20261003_bookmarks
 * .sql): a reaction is public appreciation and therefore has a number, a
 * bookmark is private and has nothing to show anyone else. Saved state is
 * carried entirely by the icon's fill.
 *
 * Deliberately quiet — `--reader-text-subtle`, lifting to
 * `--reader-text-muted` on hover, with no hover background at all. It sits
 * on dense repeated surfaces (a list row, a post's action row) next to
 * controls that *are* bordered pills (ReactionButton, ReplyButton); a
 * filled hover chip here would read as a third button of equal weight
 * rather than the small private marker it is.
 *
 * Saved changes the icon's *fill* and nothing else — same color either
 * way. Color is this control's hover channel (subtle -> muted), so
 * spending it on saved state too would mean a saved-and-hovered bookmark
 * had nowhere left to go, and a brand-colored one pulled far more
 * attention down a list of rows than a private marker has any business
 * pulling. Solid vs. outline is a clear enough read on its own, and it's
 * the distinction the glyph was designed around.
 *
 * Gates itself for signed-out readers exactly as ReactionButton does — the
 * same MembersOnlyPrompt in the same scrim-plus-absolute-box popover, shown
 * in place rather than redirecting to /auth/login — since like that button
 * this is reachable from public surfaces with nothing upstream gating it.
 *
 * WHERE THIS RENDERS AT ALL is not this component's decision but its
 * callers', and the rule they share is worth stating once here:
 *
 *   1. Never on something the reader already owns — their own upload, their
 *      own post. Saving your own work is a no-op dressed as an action; an
 *      upload is already in Library's "Personal library only" view and a
 *      post is already on your profile.
 *   2. On a dense *list* of books, quiet unless it's saying something: full
 *      strength when the book is actually saved (a state marker, and the
 *      way to unsave), otherwise hidden until the row is hovered, or merely
 *      dimmed where there's no hover to wait for. An icon at full strength
 *      on every row of a 50-book catalogue is noise on 49 of them. See
 *      BookListRow for the hover/touch split.
 *   3. Always, unconditionally, on a surface dedicated to one thing — a
 *      book's detail page, a post's own card. One tap away from any list,
 *      and the natural home for a considered "save this".
 */
export default function BookmarkButton({
  saved,
  onToggle,
  size = "default",
  className = "",
}: {
  saved: boolean;
  onToggle: () => void;
  size?: "default" | "small";
  /** Positioning and visibility from the caller only (e.g. BookListRow
   * pinning this to the row's trailing edge and revealing it on hover) —
   * never colors, which are this component's own job so a saved bookmark
   * looks identical everywhere. */
  className?: string;
}) {
  const isAuthenticated = useIsAuthenticated();
  const [showPrompt, setShowPrompt] = useState(false);
  const isSmall = size === "small";

  const handleClick = (e: React.MouseEvent) => {
    // Every book row is itself a link (and the whole row is the tap
    // target), so without this a save would navigate into the book at the
    // same time.
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      setShowPrompt((v) => !v);
      return;
    }
    onToggle();
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={saved ? "Remove from saved" : "Save for later"}
        aria-pressed={saved}
        className={`flex flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--reader-text-subtle)] transition-colors hover:text-[var(--reader-text-muted)] ${
          isSmall ? "h-7 w-7" : "h-8 w-8"
        }`}
      >
        <Bookmark size={isSmall ? 17 : 19} strokeWidth={1.75} fill={saved ? "currentColor" : "none"} />
      </button>
      {showPrompt && (
        <>
          <div onClick={() => setShowPrompt(false)} className="fixed inset-0 z-19" />
          <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-56">
            <MembersOnlyPrompt action="bookmark" onClose={() => setShowPrompt(false)} />
          </div>
        </>
      )}
    </div>
  );
}
