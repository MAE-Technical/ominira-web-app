import type { Metadata } from "next";
import Reader from "@/app/components/reader/Reader";
import PdfDocumentView from "@/app/components/reader/PdfDocumentView";
import DocxDocumentView from "@/app/components/reader/DocxDocumentView";
import ArticleDocumentView from "@/app/components/reader/ArticleDocumentView";
import { readerPageMetadata, loadReaderPageMaterial } from "@/lib/reader/readerPageData";

/**
 * The real reader page every in-app entry point (ReaderLink.tsx) actually
 * lands on — a deliberate near-duplicate of app/read/[slug]/page.tsx
 * (same searchParams shape, same <Reader> render), on its own top-level
 * segment so it falls outside app/@modal/(.)read/[slug]'s interception
 * convention, which only matches soft navigation to the literal
 * /read/[slug] path. That's the whole reason this route exists: a plain
 * next/link <Link> here behaves like any other in-app navigation — the
 * root layout (and the one real <audio> element NarrationEngine owns)
 * never unmounts crossing into or out of the reader, so playback never
 * actually stops. /read/[slug] keeps its own two jobs unchanged — the
 * canonical/shareable URL, and the modal-preview target for the home
 * feed's permalinks (NoteBookContext.tsx).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return readerPageMetadata(slug);
}

export default async function ReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // Same meaning as app/read/[slug]/page.tsx's own searchParams — see that
  // file's doc comments for what each one is set by.
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
