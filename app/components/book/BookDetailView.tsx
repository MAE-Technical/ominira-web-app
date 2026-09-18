"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronRight, Headphones, Play } from "lucide-react";
import type { MaterialDetail } from "@/lib/materials/detail";
import { buildTocOutlineRows } from "@/lib/reader/tocOutline";
import { useReadingPositionStore } from "@/stores/reading-position-store";
import { useSessionStore } from "@/stores/session-store";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useContinueReading } from "@/lib/auth/useContinueReading";
import { useBookCommunityNotes } from "@/lib/materials/useBookCommunityNotes";
import BookCover from "@/app/components/shared/BookCover";
import { ReadingNowMetaItem, ReadingRoomModal } from "@/app/components/shared/CurrentReaders";
import { resolveBookCoverSrc } from "@/lib/materials/image";
import PulseDot from "@/app/components/shared/PulseDot";
import BookNoteCard from "./BookNoteCard";
import ShareButton from "./ShareButton";
import ReaderLink from "../ReaderLink";
import UnderlineTabs from "../UnderlineTabs";
import Tooltip from "../reader/Tooltip";

type Tab = "outline" | "notes";
const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "outline", label: "Table of content" },
  { value: "notes", label: "Community notes" },
];

/** The two tabs read as a direct continuation of the metadata block above —
 * an underline bar sharing that block's own bottom border, not a separate
 * floating pill control — so the whole header (cover through tabs) reads as
 * one fused unit, the way a profile page's own tab bar sits flush under its
 * bio. Brand-rust is reserved for "Start reading" just above this; the
 * active tab gets the reader's own ink color instead, so the two controls
 * never compete for the same accent. */
function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div className="mb-6 border-b border-[var(--reader-border)]">
      <UnderlineTabs options={TAB_OPTIONS} selected={tab} onSelect={onChange} />
    </div>
  );
}

/**
 * The community-notes tab's layout — two independent flex-col stacks
 * (left/right) in row-major reading order (card 1 left, card 2 right, card
 * 3 left, ...), not a CSS grid.
 *
 * A grid was the first version, and broke visibly once a book had more than
 * a couple of notes: a grid's rows are *shared* tracks — even with
 * `items-start` (which only stops the *shorter* cell in a row from
 * stretching to fill it), the row's own height is still set by its tallest
 * cell. A note card's height depends entirely on how much a reader wrote
 * and how long its reply thread is, so neighboring cells in the same row
 * routinely differ wildly — and the shorter column ends up with a
 * mismatched, content-dependent gap under each such card instead of a
 * uniform one. Two self-contained flex-col stacks remove the row coupling
 * entirely — each column's own gap is always exactly gap-5.
 *
 * Not CSS multi-column masonry (`columns-2`) either: masonry fills the
 * *entire first column* before spilling into the second, which for a
 * handful of unevenly-sized cards crams nearly everything into one column
 * and leaves the other almost empty. Alternating by index instead always
 * keeps cards in reading order across the row — for an odd card count, the
 * leftover lands in the left column, the same position every other row's
 * first card already has.
 *
 * Rendered as two full DOM trees, one hidden per breakpoint, rather than
 * one structure reflowed by CSS — the same swap AppBottomNav/AppSidebar
 * already do for the app shell itself. The single mobile column
 * (0,1,2,3,...) and the two desktop columns (evens down the left, odds
 * down the right) are genuinely different shapes; no CSS variant can
 * retarget that on its own.
 */
function CardGrid<T>({
  items,
  keyOf,
  children,
}: {
  items: T[];
  keyOf: (item: T, index: number) => React.Key;
  children: (item: T, index: number) => React.ReactNode;
}) {
  const columns = [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];

  return (
    <>
      <div className="flex flex-col gap-5 shell:hidden">
        {items.map((item, i) => (
          <div key={keyOf(item, i)}>{children(item, i)}</div>
        ))}
      </div>
      <div className="hidden shell:flex shell:items-start shell:gap-5">
        {columns.map((column, colIndex) => (
          <div key={colIndex} className="flex min-w-0 flex-1 flex-col gap-5">
            {column.map((item, i) => {
              const index = i * 2 + colIndex;
              return <div key={keyOf(item, index)}>{children(item, index)}</div>;
            })}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Every row — including a numbered sub-heading that has both its own
 * lead-in passages *and* children (e.g. "2.4.1 Some historical myths...",
 * itself parent to "A.", "B.", ...) — is independently clickable: `isGroup`
 * only picks the row's typography (a bold section head vs. a plain leaf),
 * never whether it links anywhere. The link always points at the section's
 * own id; `/read/[slug]`'s resolveSpineTarget (lib/reader/sections.ts) is
 * what lands a click on real content — itself if it has passages, otherwise
 * the nearest one after it — so a pure grouping node with no passages of
 * its own (a true "Part" divider) still goes somewhere sensible instead of
 * being inert. This is the same `buildTocOutlineRows` the reader's own
 * ChaptersDrawer flattens its sidebar from (lib/reader/tocOutline.ts) —
 * one shared algorithm, so the book-detail outline and the in-reader
 * drawer can't drift into different notions of the same book's contents.
 */
function OutlineTab({ material, currentSectionId }: { material: MaterialDetail; currentSectionId?: string }) {
  const rows = buildTocOutlineRows(material.sections);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-4">
      <div className="flex flex-col divide-y divide-[var(--reader-border)]">
        {rows.map(({ section, depth, isGroup }) => {
          // Exact match only — reader_activities.section_id is always one
          // real spine entry (never a pure grouping label with no passages
          // of its own), so there's no walk-forward-to-the-nearest-real-
          // section to do here the way resolveSpineTarget does for a click;
          // this is just "is this the row the reader's own position names."
          const isCurrent = section.id === currentSectionId;
          return isGroup ? (
            <ReaderLink
              key={section.id}
              href={`/read/${material.slug}?section=${section.id}`}
              style={{ paddingLeft: depth * 20 }}
              className={`block w-full pt-4 pb-1.5 text-[13.5px] font-semibold no-underline first:pt-0 hover:text-brand-500 ${isCurrent ? "text-brand-500" : "text-[var(--reader-text)]"}`}
            >
              {section.label}
            </ReaderLink>
          ) : (
            <ReaderLink
              key={section.id}
              href={`/read/${material.slug}?section=${section.id}`}
              style={{ paddingLeft: depth * 20 }}
              className={`group flex w-full items-center gap-3 py-2.5 pr-1 no-underline transition-colors hover:bg-[var(--reader-surface-hover)]`}
            >
              <span
                className={`min-w-0 flex-1 truncate text-[13.5px] font-medium transition-colors group-hover:text-[var(--reader-text)] ${isCurrent ? "font-semibold text-brand-500" : "text-[var(--reader-text-muted)]"}`}
              >
                {section.label}
              </span>
              {isCurrent && <PulseDot />}
              <ChevronRight
                size={14}
                className="flex-none text-[var(--reader-text-subtle)] transition-colors group-hover:text-[var(--reader-text-muted)] group-hover:translate-x-0.5"
              />
            </ReaderLink>
          );
        })}
      </div>
    </div>
  );
}

function NotesTab({ materialId }: { materialId: string }) {
  // No sort toggle here — "top" (highest-reacted first) is the one useful
  // default for a book-scoped feed this size; a Top/Recent switch was
  // redundant weight next to the outline/notes tab switch directly above it.
  const { data, isLoading } = useBookCommunityNotes(materialId, "top");
  const items = data?.items ?? [];

  if (isLoading) {
    return <p className="mt-1 mb-0 font-literata text-sm text-[var(--reader-text-muted)]">Loading notes…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="mt-1 mb-0 font-literata text-sm text-[var(--reader-text-muted)]">
        No community notes on this book yet — be the first to highlight a passage and share your thoughts.
      </p>
    );
  }

  return (
    <CardGrid items={items} keyOf={(item) => item.note.id}>
      {(item) => <BookNoteCard materialId={materialId} item={item} />}
    </CardGrid>
  );
}

/** Published year / page count / audiobook availability / who's reading
 * this right now, as a single dot-separated byline rather than a row of
 * bordered chips — a book's facts read as editorial metadata (the way a
 * magazine masthead or a library catalog card sets them), not as UI
 * controls, which is what a bordered pill implied even with no fill.
 * Audiobook and "reading now" each get a small brand-colored accent — the
 * two deliberate points of color in an otherwise quiet, all-text line;
 * everything else stays plain. "Reading now" is the one interactive fact
 * here (see ReadingNowMetaItem) — clicking it is what opens ReadingRoomModal;
 * that open state is lifted to BookDetailView because the modal itself
 * renders at the page's own top level, not nested under this line. */
function MetaLine({
  material,
  hasNarration,
  onOpenReaders,
}: {
  material: MaterialDetail;
  hasNarration: boolean;
  onOpenReaders: () => void;
}) {
  const parts: { key: string; node: React.ReactNode }[] = [];
  if (material.publishedYear) parts.push({ key: "year", node: <span>{material.publishedYear}</span> });
  if (material.pageCountEstimate) parts.push({ key: "pages", node: <span>{material.pageCountEstimate} pages</span> });
  if (hasNarration) {
    parts.push({
      key: "audio",
      node: (
        <span className="inline-flex items-center gap-1 text-brand-500">
          <Headphones size={12} />
          Audiobook
        </span>
      ),
    });
  }
  if (material.currentReaders.length > 0) {
    parts.push({
      key: "reading-now",
      node: (
        <ReadingNowMetaItem
          readers={material.currentReaders}
          totalCount={material.currentReaderCount}
          onOpen={onOpenReaders}
        />
      ),
    });
  }
  if (parts.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 text-[13px] font-medium text-[var(--reader-text-subtle)]">
      {parts.map((part, i) => (
        <span key={part.key} className="inline-flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          {part.node}
        </span>
      ))}
    </div>
  );
}

function BookDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Whether line-clamp-6 is actually cutting text is a function of rendered layout
  // (container width, word lengths, real line breaks) — a character-count guess got
  // this wrong both ways (a "Show more" with nothing more to show; a long single-line
  // blurb with no button at all). Measure the real thing instead: scrollHeight only
  // exceeds clientHeight while the clamp class is genuinely truncating something.
  const [isTruncated, setIsTruncated] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured once while still clamped (expanded starts false) — not re-run on
    // `expanded` toggles, so the button's presence doesn't flip-flop as the element's
    // own clamping turns on and off.
    setIsTruncated(el.scrollHeight > el.clientHeight + 1); // +1: subpixel rounding guard
  }, [text]);

  return (
    // text-left: the block itself sits centered with everything else in the
    // hero (BookDetailView's own wrapping column), but a paragraph read as
    // centered prose, not the block's position, is the part that's genuinely
    // harder to read — this stays left-aligned regardless of that ancestor.
    <div className="mt-4 text-left">
      <p
        ref={ref}
        className={`text-sm font-medium leading-6 text-[var(--reader-text-muted)] ${!expanded ? "line-clamp-6" : ""}`}
      >
        {text}
      </p>
      {isTruncated && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 border-none bg-transparent p-0 text-sm font-semibold text-brand-500 cursor-pointer hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * A book's "profile page": cover, title/author/facts/progress/CTAs sitting
 * directly on the page background (no card, no backdrop panel behind it —
 * the cover art itself already carries the visual interest), an underline
 * tab bar fused directly beneath it (sharing its own bottom border as the
 * one seam in the whole header), then the selected tab's content — the
 * book's outline, or every community note on it. This is the one page a
 * reader is likeliest to land on cold from a shared link, so the whole
 * header reads as one deliberate, continuous unit rather than a stack of
 * separately-boxed widgets.
 *
 * The two tabs deliberately don't share one layout: the outline is a single
 * document (one flowing list, see OutlineTab), while notes are a feed of
 * independent posts (a card grid, see CardGrid) — each gets the shape that
 * actually matches what it is, rather than forcing both into one mold for
 * its own sake.
 *
 * Served entirely from `materials.detail`'s DB-only fields (api-spec.md's
 * own worked example for this exact page) — no `BookDocument`, no Storage
 * round trip for the hero/outline. The notes tab's own fetch
 * (useBookCommunityNotes) is the one thing on this page that does touch
 * Storage (for each note's quoted excerpt), and only once that tab is
 * actually selected.
 */
export default function BookDetailView({ material }: { material: MaterialDetail }) {
  // Ensures the position mirror is populated even for a reader who lands
  // straight on this page (a shared link, a search-engine hit) without ever
  // visiting /home first — see useContinueReading's own hydration effect.
  const continueReadingQuery = useContinueReading();
  const pct = Math.round(useReadingPositionStore((s) => s.progressPercentByMaterial[material.id] ?? 0));
  const position = useReadingPositionStore((s) => s.positions[material.id]);
  const sessionHasHydrated = useSessionStore((s) => s.hasHydrated);
  const isAuthenticated = useIsAuthenticated();
  // Same "has the real server position had its chance to correct the local
  // mirror yet" gate Reader.tsx's own serverPositionReady uses. Without it,
  // a reader could click "Resume reading" against whatever this device's
  // local store already happened to hold (right after login, before
  // GET /continue-reading has actually landed) — exactly the stale-mirror
  // race useResumeScroll's URL-based handoff exists to avoid; gating the
  // CTA on this closes it off at the source instead of at the destination.
  const positionReady = sessionHasHydrated && (!isAuthenticated || continueReadingQuery.isFetched);
  // Hands the reader's own real reader_activities row straight through the
  // URL (?section=&passageIndex=) rather than making the reader page ask
  // this device's local mirror to reconstruct it — that mirror is exactly
  // what could be stale/out of sync with the server, which is what used to
  // land "Resume reading" on the right chapter but its very first passage
  // instead of the one actually saved. See useResumeScroll's own doc
  // comment. Falls back to a plain link (section-only default local resume)
  // whenever there's genuinely nothing to resume yet, or the store hasn't
  // resolved a position for this material.
  const resumeHref =
    pct > 0 && position
      ? `/read/${material.slug}?section=${position.sectionId}&passageIndex=${position.passageIndex}`
      : `/read/${material.slug}`;
  const [tab, setTab] = useState<Tab>("outline");
  const [readersOpen, setReadersOpen] = useState(false);

  // Gates the "Audiobook" badge only — a claim about real prerecorded
  // narration. The Listen CTA below isn't gated on this: NarrationEngine
  // falls back to live, on-demand AI narration for any book without one.
  const hasRecordedAudiobook = material.narratorCount > 0;
  // `position` is one shared resume record for both reading and listening
  // (see stores/reading-position-store.ts's Position type), and setPosition
  // always writes the *whole* record — reading's own writes (useReadingProgress)
  // never include `audioTimeMs`, only NarrationEngine's do (always, even at
  // 0ms when playback starts), so whichever mode wrote last is the one whose
  // shape survives. That makes `audioTimeMs`'s presence double as "which mode
  // was this reader last in," not just "has this book ever been listened to" —
  // exactly the signal the two CTAs below need to stop reading as two
  // unrelated "have I started" states over one shared bookmark.
  const lastModeWasListen = position?.audioTimeMs !== undefined;
  const router = useRouter();

  return (
    <div className="pb-12 shell:mx-auto shell:max-w-4xl">
      <div className="flex items-center gap-3 py-3.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-[var(--reader-border)] text-[var(--reader-text)] cursor-pointer transition-colors hover:bg-[var(--reader-surface-hover)]"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="ml-auto">
          <ShareButton title={material.title} text={`${material.title} by ${material.author}`} />
        </div>
      </div>

      <div className="mb-8 flex flex-col items-center gap-5">
        {/* One full-width column at every breakpoint now, not a side-by-side
            split above `shell:` — a two-column hero read fine narrow but
            put the cover and a wide text column awkwardly far apart once
            the page had real width to work with. Centering the cover on
            its own line, with everything else stacked at full width below
            it (title through the CTAs), reads as one deliberate column
            instead of two columns fighting for the same row. */}
        <BookCover
          src={resolveBookCoverSrc(material)}
          alt={material.title}
          className="aspect-[2/3] w-48 shell:w-56 flex-none shadow-lg"
        />
        {/* max-w-lg, not the cover's own w-56 — a book's title/description
            need noticeably more measure than the cover to read as text, so
            this column is deliberately wider than the image sitting above
            it, just still narrower than the page (and centered within it)
            rather than stretching to the full shell width the two-column
            layout used to fill. text-center here is the one shared switch
            for title/author/metadata — BookDescription opts itself back to
            text-left (see its own comment): a centered *block* reads fine,
            centered *prose* doesn't. */}
        <div className="mx-auto w-full max-w-lg min-w-0 text-center">
          <h1 className="font-serif text-2xl font-semibold leading-tight text-[var(--reader-text)] shell:text-4xl">
            {material.title}
          </h1>
          <div className="mt-2 text-sm font-medium text-[var(--reader-text-muted)]">{material.author}</div>

          <MetaLine material={material} hasNarration={hasRecordedAudiobook} onOpenReaders={() => setReadersOpen(true)} />

          {/* Google first, OpenLibrary as backup — material.description (first-party)
              is left out of this cascade for now, it isn't reliably populated. */}
          {(material.googleDescription ?? material.openlibraryDescription) && (
            <BookDescription text={(material.googleDescription ?? material.openlibraryDescription)!} />
          )}

          {/* Neither the progress bar nor the CTA below commits to a real
              number/label until positionReady — showing a stale/default
              "Start reading" (or the wrong % complete) for the instant
              before GET /continue-reading lands would be as misleading as
              the wrong-passage bug this whole flow exists to avoid, just
              one step earlier. A skeleton pulse in the same footprint below
              is a deliberately brief, layout-stable stand-in — this only
              shows at all when a real position is plausible (pct or a
              locally-hydrated position already say so) rather than every
              page load. */}
          {!positionReady && (pct > 0 || position) && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="h-1 flex-1 animate-pulse overflow-hidden rounded-full bg-[var(--reader-surface-hover)]" />
              <span className="flex-none text-xs font-semibold text-transparent">0% complete</span>
            </div>
          )}
          {positionReady && pct > 0 && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <div className="flex w-full items-center justify-center gap-3">
                {/* --reader-surface is literally the same value as --reader-bg
                    in both themes (see globals.css) — invisible as a track
                    color now that this hero sits directly on the page
                    background rather than its own tinted panel.
                    --reader-surface-hover is the token actually built to read
                    as a filled element against a flat bg in either theme. */}
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--reader-surface-hover)]">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="flex-none text-xs font-semibold text-[var(--reader-text-muted)]">{pct}% complete</span>
              </div>
              {/* One shared bar, one shared bookmark (see lastModeWasListen's
                  own comment) — this is the one place that says so out loud,
                  so "left off listening" doesn't read as a second, competing
                  progress state next to the Read/Listen buttons below it. */}
              <span className="text-[11px] font-medium text-[var(--reader-text-subtle)]">
                Left off {lastModeWasListen ? "listening" : "reading"}
              </span>
            </div>
          )}

          {/* One primary CTA, not two competing "continue" buttons — it
              follows whichever mode this reader was last in (or Read, before
              any position exists), and the small square icon button next to
              it is purely a mode *switch*, not a second equally-weighted
              action. Same pattern Audible/Kindle/Spotify audiobooks use for
              a book that has both a text and an audio thread: one resume
              action, one low-emphasis way to jump to the other thread. */}
          <div className="mt-5 flex items-center justify-center gap-2">
            {positionReady ? (
              <ReaderLink
                href={lastModeWasListen ? `/read/${material.slug}?listen=1` : resumeHref}
                className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-brand-500 px-6 py-2.5 text-center text-sm font-semibold text-white no-underline shell:flex-none hover:bg-brand-600"
              >
                {lastModeWasListen && <Play size={16} />}
                {lastModeWasListen
                  ? "Continue listening"
                  : pct > 0
                    ? "Continue reading"
                    : "Start reading"}
              </ReaderLink>
            ) : (
              // Same footprint as the real CTA, deliberately non-navigable —
              // a click here before the server position lands is exactly
              // the click that could otherwise walk off with a stale/
              // inaccurate URL (see positionReady's own comment above).
              <div
                aria-hidden="true"
                className="flex-1 animate-pulse rounded-sm bg-[var(--reader-surface-hover)] px-6 py-2.5 text-center text-sm font-semibold text-transparent shell:flex-none"
              >
                Start reading
              </div>
            )}

            {/* ?listen=1 rather than calling openBook(book) directly — this
                is a real navigation (ReaderLink), and audio-store's `book`
                field isn't persisted (only `speed` is), so setting it
                before the page unloads would just lose it. Reader.tsx
                picks the flag up on mount and calls openBook itself
                instead, the same handoff targetSectionId/targetPassageId
                already do for "jump to this chapter"/"open this note"
                links. Unconditional now — no book is without at least
                live AI narration. Icon-only, deliberately lower-emphasis
                than the primary CTA: this is "switch mode," not a second
                thing to do — the label moves into Tooltip (this project's
                own shared reader-icon-button tooltip, see its doc comment)
                instead of a visible second string competing with the CTA. */}
            <Tooltip label={lastModeWasListen ? "Switch to reading" : hasRecordedAudiobook ? "Listen (audiobook)" : "Listen"}>
              <ReaderLink
                href={lastModeWasListen ? resumeHref : `/read/${material.slug}?listen=1`}
                aria-label={lastModeWasListen ? "Switch to reading" : hasRecordedAudiobook ? "Listen (audiobook)" : "Listen"}
                className="flex flex-none cursor-pointer items-center justify-center rounded-sm border border-[var(--reader-border)] bg-transparent p-2.5 text-[var(--reader-text)] no-underline hover:bg-[var(--reader-surface)]"
              >
                {lastModeWasListen ? <BookOpen size={18} /> : <Headphones size={18} />}
              </ReaderLink>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* A modal (SearchModal's own chrome), not an inline section pushed
          into the hero above — only mounted at all once the "reading now"
          fact in MetaLine is clicked open (see CurrentReaders.tsx's own
          doc comment on why this moved off the page's own flow). */}
      {readersOpen && (
        <div className="fixed inset-0 z-50">
          <ReadingRoomModal
            readers={material.currentReaders}
            totalCount={material.currentReaderCount}
            onClose={() => setReadersOpen(false)}
          />
        </div>
      )}

      <TabBar tab={tab} onChange={setTab} />

      {tab === "outline" ? (
        // Only once positionReady — same reasoning as the CTA/progress bar
        // above: a locally-stale position highlighting the wrong chapter
        // for a moment is exactly the kind of "confidently wrong" this page
        // is trying to stop doing.
        <OutlineTab material={material} currentSectionId={positionReady ? position?.sectionId : undefined} />
      ) : (
        <NotesTab materialId={material.id} />
      )}
    </div>
  );
}
