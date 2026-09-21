"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe } from "lucide-react";
import { useReaderProfile, type ReaderProfilePage } from "@/lib/reader/useReaderProfile";
import { avatarColor, avatarInitial, comradeName } from "@/lib/reader/authorDisplay";
import { resolveBookThumbnailSrc } from "@/lib/materials/image";
import Loader from "@/app/components/Loader";
import BookCover from "@/app/components/shared/BookCover";
import UnderlineTabs from "@/app/components/UnderlineTabs";
import ShareButton from "@/app/components/book/ShareButton";
import QuoteCard from "@/app/components/reader/notes/QuoteCard";
import CommunityNoteCard from "@/app/components/home/CommunityNoteCard";

type Tab = "notes" | "highlights";
const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "notes", label: "Public notes" },
  { value: "highlights", label: "Your highlights" },
];

function StatRow({ stats }: { stats: ReaderProfilePage["stats"] }) {
  const cells: { label: string; value: number }[] = [
    { label: "Notes", value: stats.notes },
    { label: "Reading", value: stats.reading },
    { label: "Reactions", value: stats.reactions },
  ];
  return (
    <div className="flex divide-x divide-[var(--reader-border)] rounded-md border border-[var(--reader-border)]">
      {cells.map((cell) => (
        <div key={cell.label} className="flex-1 p-3.5 text-center">
          <div className="font-serif text-[22px] font-semibold text-[var(--reader-accent)]">{cell.value}</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--reader-text-subtle)]">{cell.label}</div>
        </div>
      ))}
    </div>
  );
}

/** The identity hero + stat row + currently-reading shelf — Concept A/2a's
 * "Dossier stack" direction (Claude Design project 5eb1f985, `Reader
 * Profile Concepts.dc.html`), the one combined direction that pass landed
 * on: 1a's identity/stat block with 1g's catalog-row "Currently reading"
 * list (avatar-less cover + title/author + thin progress bar) rather than
 * 1a's own horizontal cover shelf. */
function CurrentlyReadingSection({ items }: { items: ReaderProfilePage["currentlyReading"] }) {
  return (
    <div className="mt-10">
      <div className="mt-7 mb-5">
        <h1 className="m-0 font-serif text-lg font-bold text-[var(--reader-text)]">Currently reading</h1>
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-[var(--reader-border)] px-4 py-5 text-center text-sm font-medium text-[var(--reader-text-muted)]">
          Not reading anything yet — open a book to begin.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {items.map(({ material, progressPercent }) => (
            <Link
              key={material.id}
              href={`/book/${material.slug}`}
              className="flex items-center gap-3 no-underline"
            >
              <BookCover
                src={resolveBookThumbnailSrc(material)}
                alt={material.title}
                className="h-16 w-11 flex-none rounded-xs"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[var(--reader-text)]">{material.title}</div>
                <div className="truncate text-xs font-medium text-[var(--reader-text-muted)]">{material.author}</div>
                {/* progressPercent is only ever non-null for `isSelf` — a
                    visitor sees which books someone has open, never how far
                    into them (see ReaderProfilePage's own doc comment). */}
                {progressPercent !== null && (
                  <div className="mt-1.5 h-[3px] rounded-full bg-[var(--reader-surface-hover)]">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${progressPercent}%` }} />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PublicNotesList({ items, emptyText }: { items: ReaderProfilePage["publicNotes"]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="mt-1 mb-0 font-literata text-sm text-[var(--reader-text-muted)]">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      {items.map((item) => (
        <CommunityNoteCard key={item.note.id} item={item} />
      ))}
    </div>
  );
}

/** Self-view only, "highlight just the quote card" — a bare highlight has
 * no note attached to it, so unlike PublicNotesList's full CommunityNoteCard
 * reuse (reply/react/edit thread and all), each entry here is just the
 * quoted passage in the same QuoteCard every other quote in this app
 * renders in, plus which book it's from. Never interactive, never shown to
 * a visitor — see ReaderProfileView's own doc comment on why this tab
 * doesn't exist at all outside self-view. */
function HighlightsList({ items }: { items: ReaderProfilePage["highlights"] }) {
  if (!items || items.length === 0) {
    return (
      <p className="mt-1 mb-0 font-literata text-sm text-[var(--reader-text-muted)]">
        No private highlights yet
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((highlight) => (
        <QuoteCard key={highlight.id}>
          <div className="flex flex-col gap-1.5">
            <p className="m-0 font-serif text-[15px] leading-[1.6] text-[var(--color-app-text)]">
              {highlight.excerpt}
            </p>
            <span className="text-xs font-medium text-[var(--color-app-text-secondary)]">{highlight.material.title}</span>
          </div>
        </QuoteCard>
      ))}
    </div>
  );
}

/**
 * A reader's public dossier — implements Claude Design project 5eb1f985's
 * `Reader Profile Concepts.dc.html`, the "combined direction" pass landed
 * on (identity/stats from concept 1a + catalog-row reading list from 1g),
 * reached via CurrentReaders.tsx's roster links and any future pseudonym
 * byline. Fetched client-side (useReaderProfile) rather than server-rendered
 * like BookDetailView, since which chrome to show — self vs. public — is a
 * function of the *viewer's* own signed-in identity, which only ever lives
 * client-side here (session-store, not a cookie session — see
 * useReaderProfile's own doc comment).
 *
 * Public notes and highlights are NOT the mock's own two stacked sections —
 * per this feature's own brief, they're tabbed exactly like the reader's
 * in-book "Notes & highlights" panel (BookAnnotationFeedPanel), just with
 * one difference: a visitor only ever sees "Public notes", full stop, no
 * tab control at all (there's nothing else they're allowed to see) —
 * "My highlights" only exists as a tab once `isSelf` is true.
 */
export default function ReaderProfileView({ slug }: { slug: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useReaderProfile(slug);
  const [tab, setTab] = useState<Tab>("notes");

  if (isLoading) {
    return (
      <div className="relative min-h-[60vh]">
        <Loader confined />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="m-0 text-sm font-medium text-[var(--reader-text-muted)]">
          This comrade&rsquo;s profile couldn&rsquo;t be found.
        </p>
        <Link href="/home" className="text-sm font-semibold text-brand-500 no-underline hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const { reader, isSelf, stats, currentlyReading, publicNotes, highlights } = data;
  const displayName = comradeName(reader.pseudonym);

  return (
    <div className="pb-12 shell:mx-auto shell:max-w-2xl">
      <div className="flex items-center gap-3 py-3.5">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          aria-label="Back"
          className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-md border border-[var(--reader-border)] bg-transparent text-[var(--reader-text)] transition-colors hover:bg-[var(--reader-surface-hover)]"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--reader-text)]">
          {isSelf ? "My profile" : displayName}
        </span>
        <ShareButton title={displayName} text={`${displayName} on Ominira`} ariaLabel="Share this profile" />
      </div>

      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span
          style={{ background: avatarColor(reader.pseudonym) }}
          className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-full font-serif text-[28px] font-semibold text-white"
        >
          {avatarInitial(reader.pseudonym)}
        </span>
        <div className="font-serif text-2xl font-semibold text-[var(--reader-text)]">{displayName}</div>
        {reader.city && reader.country && (
          <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--reader-text-muted)]">
            <Globe size={14} className="text-[var(--reader-text-subtle)]" />
            {reader.city}, {reader.country}
          </div>
        )}
        {isSelf && (
          <Link
            href="/account"
            className="mt-1 rounded-sm border border-[var(--reader-border)] px-4 py-1.5 text-xs font-semibold text-[var(--reader-text)] no-underline transition-colors hover:bg-[var(--reader-surface-hover)]"
          >
            Edit profile
          </Link>
        )}
      </div>

      <StatRow stats={stats} />
      <CurrentlyReadingSection items={currentlyReading} />

      <div className="mt-10 pt-6">
        {isSelf ? (
          <>
            <div className="mb-5 border-b border-[var(--reader-border)]">
              <UnderlineTabs options={TAB_OPTIONS} selected={tab} onSelect={setTab} />
            </div>
            {tab === "notes" ? (
              <PublicNotesList
                items={publicNotes}
                emptyText="You haven't shared a public note yet — leave one on a highlight while reading and it'll show up here."
              />
            ) : (
              <HighlightsList items={highlights} />
            )}
          </>
        ) : (
          <>
            <div className="mt-1 mb-5">
              <h1 className="m-0 font-serif text-lg font-bold text-[var(--reader-text)]">Public notes</h1>
            </div>
            <PublicNotesList
              items={publicNotes}
              emptyText="No public notes yet"
            />
          </>
        )}
      </div>
    </div>
  );
}
