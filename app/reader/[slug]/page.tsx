import type { Metadata } from "next";
import Reader from "@/app/components/reader/Reader";
import PdfDocumentLoader from "@/app/components/reader/PdfDocumentLoader";
import DocxDocumentView from "@/app/components/reader/DocxDocumentView";
import ArticleDocumentView from "@/app/components/reader/ArticleDocumentView";
import { readerPageMetadata, loadReaderPageMaterial } from "@/lib/reader/readerPageData";
import { locatorFromQuery } from "@/lib/reader/locator";

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
    // ?page=<n> (PDF) / ?block=<n> (DOCX, web article) — the same resume
    // handoff ?section=&passageIndex= makes for an EPUB, in whichever
    // addressing scheme the material's own viewer speaks. Built by
    // buildResumeHref, parsed by locatorFromQuery.
    page?: string;
    block?: string;
    note?: string;
    noteId?: string;
    thread?: string;
    listen?: string;
  }>;
}) {
  const { slug } = await params;
  const { section, passage, passageIndex, page, block, note, noteId, thread, listen } = await searchParams;

  const material = await loadReaderPageMaterial(slug, section);

  const urlLocator = locatorFromQuery({ section, passageIndex, page, block });

  if (material.kind === "pdf") {
    return (
      <PdfDocumentLoader materialId={material.materialId} title={material.title} sourceUrl={material.sourceUrl} urlLocator={urlLocator} />
    );
  }
  if (material.kind === "docx") {
    return (
      <DocxDocumentView materialId={material.materialId} title={material.title} sourceUrl={material.sourceUrl} urlLocator={urlLocator} />
    );
  }
  if (material.kind === "webpage") {
    return (
      <ArticleDocumentView
        materialId={material.materialId}
        title={material.title}
        sourceUrl={material.sourceUrl}
        articleHtml={material.articleHtml}
        urlLocator={urlLocator}
      />
    );
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
