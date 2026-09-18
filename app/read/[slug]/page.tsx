import type { Metadata } from "next";
import Reader from "@/app/components/reader/Reader";
import { readerPageMetadata, loadReaderPageBook } from "@/lib/reader/readerPageData";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return readerPageMetadata(slug);
}

export default async function ReadBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // ?section=<sectionId> — set by the book-detail page's chapter links
  // (app/(app)/book/[slug]) to jump straight to that chapter on this one
  // load, without touching the reader's own saved resume position.
  // ?passage=<passageId>&note=<annotationId> — set by the home community
  // feed's cards, narrowing that further to one exact passage and
  // (optionally, paired with it) opening that annotation's thread once
  // the reader has landed.
  // ?passageIndex=<n> — paired with ?section=, set by the book-detail
  // page's own "Resume reading" button (BookDetailView.tsx), straight from
  // this reader's real reader_activities row — see useResumeScroll's own
  // doc comment for why the URL, not this device's local mirror, is what
  // that button hands off.
  // ?listen=1 — set by the book-detail page's own Listen button (via
  // ReaderLink, which actually lands on app/reader/[slug] today — see that
  // route's own doc comment) rather than the router.push+openBook() it used
  // when this was a soft one — this is how it hands that intent off
  // instead. This route (app/read/[slug]) keeps the same searchParams shape
  // purely so a shared/bookmarked /read/[slug]?listen=1 link still works.
  searchParams: Promise<{ section?: string; passage?: string; passageIndex?: string; note?: string; listen?: string }>;
}) {
  const { slug } = await params;
  const { section, passage, passageIndex, note, listen } = await searchParams;

  const { book, materialId, eagerSectionIds } = await loadReaderPageBook(slug, section);
  return (
    <Reader
      book={book}
      materialId={materialId}
      eagerSectionIds={eagerSectionIds}
      targetSectionId={section}
      targetPassageId={passage}
      targetPassageIndex={passageIndex !== undefined && !Number.isNaN(Number(passageIndex)) ? Number(passageIndex) : undefined}
      targetNoteId={note}
      autoListen={listen === "1"}
    />
  );
}
