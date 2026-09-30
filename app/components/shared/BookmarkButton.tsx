"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import MembersOnlyPrompt from "@/app/components/reader/notes/MembersOnlyPrompt";

/**
 * "Save this for later" — the one bookmark control, used by a book's detail
 * page and community posts (NoteThreadCard). One look everywhere: change it
 * here and both follow. The behaviour lives in the same two places too —
 * optimistic toggle + toast + ordering in lib/bookmarks/useBookmarks.ts and
 * useToggleNoteBookmark, sharing serialize.ts and stores/toast-store.ts.
 *
 * Icon-only, no count (a bookmark is private, unlike a reaction). Muted at
 * rest, brand-coloured and filled when saved.
 *
 * Gates itself for signed-out readers exactly as ReactionButton does — the
 * same MembersOnlyPrompt popover, shown in place rather than redirecting.
 *
 * Where it renders is the callers' call: never on something the reader
 * already owns (their own upload/post), and not on book list rows — the
 * detail page is the place to save a book.
 */
export default function BookmarkButton({
  saved,
  onToggle,
  className = "",
}: {
  saved: boolean;
  onToggle: () => void;
  /** Positioning and visibility from the caller only (e.g. BookListRow
   * pinning this to the row's trailing edge and revealing it on hover) —
   * never colors, which are this component's own job so a saved bookmark
   * looks identical everywhere. */
  className?: string;
}) {
  const isAuthenticated = useIsAuthenticated();
  const [showPrompt, setShowPrompt] = useState(false);

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
        className={`flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-colors ${
          saved ? "text-brand-500" : "text-[var(--reader-text-subtle)] hover:text-[var(--reader-text-muted)]"
        }`}
>
        <Bookmark size={17} strokeWidth={1.75} fill={saved ? "currentColor" : "none"} />
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
