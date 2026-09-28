import type { Metadata } from "next";
import Reader from "@/app/components/reader/Reader";
import PdfDocumentView from "@/app/components/reader/PdfDocumentView";
import DocxDocumentView from "@/app/components/reader/DocxDocumentView";
import ArticleDocumentView from "@/app/components/reader/ArticleDocumentView";
import { readerPageMetadata, loadReaderPageMaterial } from "@/lib/reader/readerPageData";

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
  // ?noteId=<uuid> — push notification deep link for general notes (see
  // lib/notifications/noteTarget.ts), handled by Reader's own general note
  // effect.
  searchParams: Promise<{
    section?: string;
    passage?: string;
    passageIndex?: string;
    note?: string;
    noteId?: string;
    thread?: string;
    listen?: string;
  }>;
}) {
  const { slug } = await params;
  const { section, passage, passageIndex, note, noteId, thread, listen } = await searchParams;

  const material = await loadReaderPageMaterial(slug, section);

  if (material.kind === "pdf") {
    return <PdfDocumentView title={material.title} sourceUrl={material.sourceUrl} />;
  }
  if (material.kind === "docx") {
    return <DocxDocumentView title={material.title} sourceUrl={material.sourceUrl} />;
  }
  if (material.kind === "webpage") {
    return <ArticleDocumentView title={material.title} sourceUrl={material.sourceUrl} articleHtml={material.articleHtml} />;
  }

  return (
    <Reader
      book={material.book}
      materialId={material.materialId}
      eagerSectionIds={material.eagerSectionIds}
      targetSectionId={section}
      targetPassageId={passage}
      targetPassageIndex={passageIndex !== undefined && !Number.isNaN(Number(passageIndex)) ? Number(passageIndex) : undefined}
      targetNoteId={note}
      targetGeneralNoteId={noteId}
      targetThreadId={thread}
      autoListen={listen === "1"}
    />
  );
}
