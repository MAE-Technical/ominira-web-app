"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Headphones } from "lucide-react";
import { avatarColor, avatarInitial, comradeName } from "@/lib/reader/authorDisplay";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";
import { formatTimeAgo } from "@/lib/reader/timeAgo";
import PulseDot from "./PulseDot";

type Reader = { readerId: string; pseudonym: string; audioTimeMs: number | null; updatedAt: string };
type Props = { readers: Reader[]; totalCount: number };

/**
 * "Who's reading this right now" — spec.md's deferred "Read together... see
 * who else is currently reading," first slice: presence only, no chat/voice
 * call yet (that stays its own future feature). Each row links to that
 * comrade's own `/@{pseudonym}` profile (app/(app)/[handle], slug via
 * pseudonymToSlug). Data is lib/reader/activity.ts's listCurrentReaders:
 * already most-recently-active-first.
 *
 * Both pieces below are a deliberate fusion of the two concepts from the
 * "Reading now" presence design pass (Claude Design project e84a8d62): the
 * "Presence line" concept's pulsing-dot voice for the trigger, combined
 * with the "Reading-room roster" concept's row styling (avatar, name,
 * reading-vs-listening mode icon, relative time) for what it reveals —
 * never that concept's own always-open card.
 *
 * `PresenceLine` is the book list row's own compact signal — unrelated to
 * the other two, no toggle, no per-person chrome (see its own note on the
 * row having no room for more). `ReadingNowMetaItem` is the book-detail
 * page's *trigger*, deliberately not its own line — it's one more
 * dot-separated fact alongside published-year/page-count/audiobook
 * (BookDetailView's `MetaLine`). `ReadingRoomModal` is what that trigger
 * opens — a real modal (SearchModal's own dialog chrome: translucent
 * backdrop, centered card, mobile full-screen variant), not an inline
 * section pushed into the hero's own flow — a roster can run long, and a
 * book's title/CTAs shouldn't reflow to make room for it.
 */
export function PresenceLine({ readers, totalCount }: Props) {
  if (readers.length === 0) return null;

  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      <PulseDot />
      <span className="text-[11px] font-medium text-[var(--reader-text-muted)]">
        {totalCount} reading now
      </span>
    </div>
  );
}

type TriggerProps = Props & { onOpen: () => void };

/** Renders nothing beyond the pill itself — opens ReadingRoomModal
 * (`aria-haspopup="dialog"`; nothing here expands in place any more, see
 * this file's own doc comment). The trailing chevron is the one visual cue
 * that this dot-separated fact, unlike its neighbors on MetaLine (published
 * year, page count), is actually clickable — without it this read as inert
 * text sitting next to real metadata, same affordance NoteBookContext's own
 * "open" glyph gives an otherwise-plain row. */
export function ReadingNowMetaItem({ readers, totalCount, onOpen }: TriggerProps) {
  if (readers.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="inline-flex cursor-pointer items-center gap-0.5 border-none bg-transparent p-0 font-medium text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
    >
      <PulseDot className="mr-1" />
      {totalCount} reading now
      <ChevronRight size={13} className="flex-none" />
    </button>
  );
}

/**
 * The roster itself, in SearchModal's own dialog chrome — translucent
 * backdrop, a centered card (full-screen on mobile, same `isMobile` resize
 * listener SearchModal uses) — rather than an inline section pushed into
 * whichever page opened it. Every reader within the cap
 * (CURRENT_READERS_DETAIL_CAP on a book-detail page, see lib/reader/
 * activity.ts's listCurrentReaders) renders at once, no separate
 * click-to-reveal step — a modal already has the room a book hero's own
 * centered column didn't.
 */
export function ReadingRoomModal({ readers, totalCount, onClose }: Props & { onClose: () => void }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Never expandable further past the cap — no pseudonym was fetched for
  // these (see listCurrentReaders' own `neededReaderIds`), so this is a
  // static remainder, not a "load more" affordance.
  const remaining = totalCount - readers.length;

  return (
    <div
      className={`w-full h-full box-border bg-black/45 flex justify-center ${
        isMobile ? "items-stretch p-0" : "items-start py-16 px-6"
      }`}
    >
      <div
        className={`w-full bg-[var(--reader-surface)] shadow-lg flex flex-col box-border overflow-hidden ${
          isMobile ? "h-full rounded-none" : "max-w-[640px] max-h-[560px] rounded-lg"
        }`}
      >
        <div className="flex flex-none items-center justify-between gap-2.5 border-b border-[var(--reader-border)] px-5 py-4">
          <span className="text-sm font-semibold text-[var(--reader-text)]">{totalCount} reading now</span>
          <span onClick={onClose} className="cursor-pointer text-sm font-medium text-[var(--reader-text-muted)]">
            Close
          </span>
        </div>

        <div className="om-scroll flex-1 overflow-y-auto px-3 py-2">
          {readers.map((r) => {
            const displayName = comradeName(r.pseudonym);
            const ModeIcon = r.audioTimeMs !== null ? Headphones : BookOpen;
            return (
              <Link
                key={r.readerId}
                href={`/@${pseudonymToSlug(r.pseudonym)}`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-sm px-1 py-[11px] no-underline hover:bg-[var(--reader-surface-hover)]"
              >
                <span
                  style={{ background: avatarColor(displayName) }}
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
                >
                  {avatarInitial(displayName)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--reader-text)]">
                  {displayName}
                </span>
                {/* <span className="flex flex-none items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-[var(--reader-text-subtle)]">
                  <ModeIcon size={14} />
                  {formatTimeAgo(new Date(r.updatedAt).getTime())}
                </span> */}
              </Link>
            );
          })}

          {remaining > 0 && (
            <div className="px-1 py-2.5 text-center text-[12px] font-semibold text-[var(--reader-text-subtle)]">
              +{remaining} more comrades
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
