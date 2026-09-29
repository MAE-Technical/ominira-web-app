"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReaderProfile, type ReaderProfilePage } from "@/lib/reader/useReaderProfile";
import { comradeName } from "@/lib/reader/authorDisplay";
import ReaderAvatar from "@/app/components/shared/ReaderAvatar";
import { resolveBookThumbnailSrc } from "@/lib/materials/image";
import { communityFeedItemHref } from "@/lib/community/useCommunityFeed";
import type { MaterialSummary } from "@/lib/api/types";
import Loader from "@/app/components/Loader";
import UnderlineTabs from "@/app/components/UnderlineTabs";
import DetailHeader from "@/app/components/shared/DetailHeader";
import NoResults from "@/app/components/shared/NoResults";
import BookListRow from "@/app/components/shell/BookListRow";
import QuoteCard from "@/app/components/reader/notes/QuoteCard";
import NoteCard from "@/app/components/reader/notes/NoteCard";

type Tab = "posts" | "highlights";
// A visitor still gets the tab bar, just with the one tab they're allowed to
// see — the page keeps the same shape whoever's looking, rather than the
// posts list swapping between a tab and a bare heading.
const SELF_TABS: { value: Tab; label: string }[] = [
  { value: "posts", label: "Posts" },
  { value: "highlights", label: "Highlights" },
];
const PUBLIC_TABS = SELF_TABS.slice(0, 1);

/** Avatar beside name + city — Profile Page.dc.html's left-aligned identity
 * block, minus its share button, which lives in DetailHeader's row above
 * instead (same place a material page puts it). The owner also gets a plain
 * "Edit profile" link through to account settings — the mirror of that
 * page's own "View profile" link back here. */
function ProfileIdentity({ reader, isSelf }: { reader: ReaderProfilePage["reader"]; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-4 pt-2 pb-6">
      <ReaderAvatar pseudonym={reader.pseudonym} avatar={reader.avatar} size={64} />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 truncate text-[15px] font-semibold text-[var(--reader-text)]">
          {comradeName(reader.pseudonym)}
        </h1>
        {reader.city && reader.country && (
          <span className="text-[13px] font-medium text-[var(--reader-text-muted)]">
            {reader.city}, {reader.country}
          </span>
        )}
        {isSelf && (
          <Link
            href="/account"
            className="mt-1.5 text-xs font-semibold text-[var(--reader-accent)]"
          >
            Edit profile
          </Link>
        )}
      </div>
    </div>
  );
}

function StatRow({ stats }: { stats: ReaderProfilePage["stats"] }) {
  const cells: { label: string; value: number }[] = [
    { label: "Books started", value: stats.reading },
    { label: "Posts", value: stats.notes },
    // { label: "Reactions", value: stats.reactions },
  ];
  return (
    <div className="flex gap-8 border-y border-[var(--reader-border)] py-4">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-0.5">
          <span className="text-xl font-bold text-[var(--reader-text)]">{cell.value}</span>
          <span className="text-xs font-medium text-[var(--reader-text-muted)]">{cell.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Currently reading and contributions — plain BookListRows in the same
 * 1-col mobile / 2-col desktop grid as the Library and Shelf, so a book here
 * behaves exactly as it would anywhere else (the viewer's own progress and
 * save state, the "reading now" line). Headings are small eyebrow labels,
 * the same quiet style LibraryView uses, not page-level serif titles. */
function BookSection({ title, items, emptyText }: { title: string; items: MaterialSummary[]; emptyText?: string }) {
  if (items.length === 0 && !emptyText) return null;
  return (
    <section className="mt-8">
      <h2 className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--reader-text-subtle)]">{title}</h2>
      {items.length === 0 ? (
        <NoResults className="mt-3 mb-0" message={emptyText!} />
      ) : (
        <div className="grid grid-cols-1 shell:grid-cols-2 shell:gap-x-10">
          {items.map((material) => (
            <BookListRow key={material.id} material={material} />
          ))}
        </div>
      )}
    </section>
  );
}

function PostsList({ items, emptyText }: { items: ReaderProfilePage["publicNotes"]; emptyText: string }) {
  if (items.length === 0) return <NoResults className="mt-4 mb-0" message={emptyText} />;
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <NoteCard
          key={item.note.id}
          materialId={item.material?.id ?? null}
          note={item.note}
          replies={item.replies}
          excerpt={item.excerpt}
          {...(item.material
            ? {
                bookContext: {
                  href: communityFeedItemHref(item) ?? "",
                  title: item.material.title,
                  author: item.material.author,
                  section: item.label ?? undefined,
                  coverUrl: resolveBookThumbnailSrc(item.material),
                  materialType: item.material.materialType,
                },
              }
            : {})}
        />
      ))}
    </div>
  );
}

/** Self-view only — a bare highlight has no note attached, so each entry is
 * just the quoted passage in the same QuoteCard every other quote in this
 * app renders in, plus which book it's from. Never shown to a visitor
 * (highlights are always private; the server doesn't even query them). */
function HighlightsList({ items }: { items: ReaderProfilePage["highlights"] }) {
  if (!items || items.length === 0) return <NoResults className="mt-4 mb-0" message="No private highlights yet" />;
  return (
    <div className="mt-4 flex flex-col gap-3">
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
 * A reader's public profile — follows Profile Page.dc.html's direction
 * (ui-mockups/): left-aligned identity, a plain stat row, then the lists.
 * Back/share come from DetailHeader, the same row a material page uses;
 * where that page puts its bookmark in the `action` slot, a profile has
 * nothing to save, so the slot stays empty — the owner's "Edit profile" link
 * lives in ProfileIdentity instead.
 *
 * Fetched client-side (useReaderProfile) rather than server-rendered like
 * MaterialDetailView, since which chrome to show — self vs. public — is a
 * function of the *viewer's* own signed-in identity, which only ever lives
 * client-side here (see useReaderProfile's own doc comment).
 */
export default function ReaderProfileView({ slug }: { slug: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useReaderProfile(slug);
  const [tab, setTab] = useState<Tab>("posts");

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

  const { reader, isSelf, stats, currentlyReading, publicNotes, highlights, contributions } = data;
  const displayName = comradeName(reader.pseudonym);

  return (
    <div className="pb-12 shell:mx-auto shell:max-w-4xl">
      <DetailHeader
        onBack={() => (window.history.length > 1 ? router.back() : router.push("/"))}
        shareAction={{ title: displayName, text: `${displayName} on Ominira`, ariaLabel: "Share this profile" }}
      />

      <ProfileIdentity reader={reader} isSelf={isSelf} />
      <StatRow stats={stats} />

      <BookSection
        title="Currently reading"
        items={currentlyReading.map((entry) => entry.material)}
        emptyText="Not reading anything yet."
      />
      <BookSection title="Contributed to the library" items={contributions} />

      <div className="mt-10 mb-2">
        <UnderlineTabs options={isSelf ? SELF_TABS : PUBLIC_TABS} value={tab} onChange={setTab} />
      </div>
      {tab === "posts" ? (
        <PostsList
          items={publicNotes}
          emptyText={
            isSelf
              ? "You haven't shared a public post yet — leave one on a highlight while reading and it'll show up here."
              : "No public posts yet"
          }
        />
      ) : (
        <HighlightsList items={highlights} />
      )}
    </div>
  );
}
