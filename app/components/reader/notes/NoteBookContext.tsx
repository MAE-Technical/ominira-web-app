"use client";

import Link from "next/link";
import BookPreview from "./BookPreview";
import HighlightCard from "./HighlightCard";

// Same word-boundary truncation budget Citation used to apply to its own
// fused cover+quote row — tighter than HighlightCard's own 240-char default
// since this sits directly above a BookPreview row rather than getting a
// whole card to itself.
const EXCERPT_PREVIEW_CHARS = 160;

/** A note's book context on the home feed. With an `excerpt` (the note is
 * anchored to a highlight), the passage and its book attribution fuse into
 * one bordered card — quote block on top, book title/section as a meta
 * strip below, the same "media, then its meta strip" shape VideoPreview
 * uses for a thumbnail + title/duration. Both pieces already share one deep
 * link, so reading them as one object (not two stacked cards) matches how
 * they behave. A general note (no `excerpt`) renders just the BookPreview
 * row on its own. */
export default function NoteBookContext({
  href,
  title,
  author,
  section,
  coverUrl,
  materialType,
  excerpt,
}: {
  href: string;
  title: string;
  author?: string | null;
  section?: string;
  coverUrl?: string | null;
  materialType?: string;
  excerpt?: string | null;
}) {
  if (!excerpt) {
    return (
      <Link href={href} className="group flex flex-col no-underline">
        <BookPreview title={title} author={author} section={section} coverUrl={coverUrl} materialType={materialType} />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-sm border border-[var(--reader-border)] no-underline"
    >
      <HighlightCard text={excerpt} maxChars={EXCERPT_PREVIEW_CHARS} bare />
      {/* No author/format here — the passage itself is the point of this
          card, and title/section is enough to place it; author + format
          only earn their spot on a general book-attached note's own
          standalone BookPreview row, where there's no quote already
          carrying the content. */}
      <BookPreview title={title} section={section} coverUrl={coverUrl} bare />
    </Link>
  );
}
