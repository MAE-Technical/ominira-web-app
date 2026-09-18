"use client";

import Link from "next/link";
import { Check, Headphones } from "lucide-react";
import { useReadingPositionStore } from "@/stores/reading-position-store";
import type { MaterialSummary } from "@/lib/api/types";
import BookCover from "@/app/components/shared/BookCover";
import { PresenceLine } from "@/app/components/shared/CurrentReaders";
import { resolveBookCoverSrc, resolveBookThumbnailSrc } from "@/lib/materials/image";
import ReaderLink from "@/app/components/ReaderLink";

/**
 * List-row book tile — Claude Design "Library catalogue listing" project,
 * direction 1c ("Editorial tint"), since trimmed to just
 * title/author/progress (the description made the listing feel
 * overwhelming — a reader after it goes to the book's own detail page).
 * Shared by the Library catalogue and the Reading page (ReadingView) — the
 * latter reuses it unmodified, since `showProgress` already reads live off
 * reading-position-store, which each page's own `useContinueReading` call
 * already populated.
 *
 * Covers here come from three inconsistent sources (own uploads,
 * OpenLibrary, Google — see lib/materials/image.ts) with wildly different
 * styles, which the old cover-tile grid made loud. The thin rust-tint
 * overlay pulls whatever's left toward one shared warm tone —
 * rgba(190,64,13,.16) is brand-500 (#be400d is rgb(190,64,13)) at 16%
 * opacity, multiplied over the art.
 *
 * The text column has no `items-start`, so it stretches to the row's full
 * height (the thumbnail's) and centers title/author/progress within that,
 * rather than pinning them to the top and leaving the tall thumbnail
 * towering over a short text block.
 *
 * One wrapping link for the whole row: PresenceLine below is deliberately a
 * plain pulsing-dot + count line, not a set of individual comrade links (see
 * its own doc comment) — no interactive element inside the row that a
 * wrapping `<a>` would nest invalidly.
 */
export default function BookListRow({
  material,
  resumeTarget,
  selection,
}: {
  material: MaterialSummary;
  /** Reading page only (ReadingView) — every row there is already this
   * reader's own real reader_activities entry (GET /continue-reading), so
   * the row skips book-detail entirely and goes straight into the reader at
   * that exact section/passage, the same URL-based handoff
   * BookDetailView's own "Resume reading" and ContinueReadingItemCard use
   * (see useResumeScroll's doc comment for why the URL, not a client store
   * read on arrival, is what carries this). Absent everywhere else (the
   * Library catalogue) — those rows are for *browsing*, where the detail
   * page's blurb/outline/CTA is still the right landing spot, most of them
   * not even started yet. */
  resumeTarget?: { sectionId: string; passageIndex: number; audioTimeMs?: number | null };
  /** SurveyWizard's "which of these have you read?" step only — renders this
   * row as a toggleable checkbox tile instead of a navigating link, and
   * skips resumeTarget/progress/presence entirely (irrelevant to "have you
   * ever read this", and this step runs before there's even an authenticated
   * reader for reading-position-store to have anything for). Mutually
   * exclusive with resumeTarget. */
  selection?: { selected: boolean; onToggle: () => void };
}) {
  const pct = Math.round(useReadingPositionStore((s) => s.progressPercentByMaterial[material.id] ?? 0));
  const showProgress = !selection && pct > 0;
  // `audioTimeMs` set on this row's own reader_activities entry means this
  // reader's last activity on the book was listening, not reading (see
  // BookDetailView's lastModeWasListen for the same read on the client-side
  // mirror) — carried through as `listen=1` so the row's click genuinely
  // resumes the same way "Continue listening" on the book-detail page
  // would, instead of always dropping a listening reader back into text.
  const wasListening = resumeTarget?.audioTimeMs != null;
  const href = resumeTarget
    ? `/read/${material.slug}?section=${resumeTarget.sectionId}&passageIndex=${resumeTarget.passageIndex}${wasListening ? "&listen=1" : ""}`
    : `/book/${material.slug}`;
  const className = `group flex min-w-0 gap-4 border-b border-[var(--reader-border)] py-4 no-underline ${
    selection ? `cursor-pointer rounded-xs px-2 text-left transition-colors ${selection.selected ? "bg-brand-50/40" : ""}` : ""
  }`;

  const content = (
    <>
      <div className="relative h-28 w-20 flex-none overflow-hidden rounded-xs">
        {/* Selection mode (SurveyWizard) asks for the widest-variant cover,
            not the compact-list thumbnail every other row here uses — this
            tile is the main thing on the screen, not a dense list item. */}
        <BookCover
          src={selection ? resolveBookCoverSrc(material) : resolveBookThumbnailSrc(material)}
          alt={material.title}
          className="h-full w-full"
          iconSize={22}
        />
        <div className="absolute inset-0 bg-[rgba(190,64,13,0.16)] mix-blend-multiply" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="font-serif text-[14px] font-semibold leading-tight text-[var(--reader-text)] group-hover:text-brand-500">
          {material.title}
        </div>
        <div className="text-[11px] font-semibold capitalize tracking-[0.04em] text-[var(--reader-text-muted)]">
          {material.author}
        </div>
        {showProgress && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--reader-accent)]">
              {pct >= 100 ? "Finished" : `${pct}%`}
            </span>
            <span className="h-1 max-w-[160px] flex-1 overflow-hidden rounded-full bg-[var(--reader-border)]">
              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
            </span>
            {/* One shared bar either way (see wasListening above) — this icon
                is the only thing on the row that says which door clicking it
                reopens, without needing a second, listen-specific progress
                readout next to the reading one. */}
            {wasListening && <Headphones size={12} className="flex-none text-[var(--reader-text-subtle)]" />}
          </div>
        )}
        {!selection && <PresenceLine readers={material.currentReaders} totalCount={material.currentReaderCount} />}
      </div>

      {selection && (
        <div
          aria-hidden="true"
          className={`flex h-6 w-6 flex-none items-center justify-center self-center rounded-full border-2 transition-colors ${
            selection.selected
              ? "border-brand-500 bg-brand-500"
              : "border-[var(--reader-border)] bg-[var(--reader-surface)]"
          }`}
        >
          {selection.selected && <Check size={14} strokeWidth={3} className="text-white" />}
        </div>
      )}
    </>
  );

  if (selection) {
    return (
      <button type="button" onClick={selection.onToggle} className={className}>
        {content}
      </button>
    );
  }

  // ReaderLink (a plain <a>, never next/link's <Link>) once this is headed
  // into /read/[slug] — the (.)read/[slug] modal interception fires for ANY
  // client-side Link navigation there regardless of origin (see ReaderLink's
  // own doc comment), which would otherwise pop this up as an overlay on top
  // of the Reading page instead of the real standalone reader.
  return resumeTarget ? (
    <ReaderLink href={href} className={className}>
      {content}
    </ReaderLink>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
