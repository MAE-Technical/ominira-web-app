import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReaderModal from "@/app/components/reader/ReaderModal";
import PdfDocumentModal from "@/app/components/reader/PdfDocumentModal";
import DocxDocumentModal from "@/app/components/reader/DocxDocumentModal";
import ArticleDocumentModal from "@/app/components/reader/ArticleDocumentModal";
import { loadReaderMaterial, MaterialNotFoundError } from "@/lib/reader/loadReaderMaterial";
import { locatorFromQuery } from "@/lib/reader/locator";
import { readerPageMetadata } from "@/lib/reader/readerPageData";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return readerPageMetadata(slug);
}

/** Same server-side load as app/read/[slug]/page.tsx, deliberately
 * duplicated rather than shared — this is the one other place a book gets
 * loaded for the reader, and the two pages diverge in what they render
 * around it (ReaderModal vs. Reader directly), so a shared helper would buy
 * little. Intercepts any client-side navigation to /read/[slug] that
 * originates from elsewhere under the root layout (the home community
 * feed today), rendering it as an overlay via the @modal parallel slot
 * instead of replacing the current page — a hard refresh or a direct link
 * still resolves to the real app/read/[slug]/page.tsx, since interception
 * only applies to client-side <Link>/router navigation. */
export default async function ReadBookModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // ?page=/?block= are the non-EPUB resume targets — see app/read/[slug]'s
  // own searchParams comment.
  searchParams: Promise<{
    section?: string;
    passageIndex?: string;
    page?: string;
    block?: string;
    passage?: string;
    note?: string;
    noteId?: string;
    thread?: string;
  }>;
}) {
  const { slug } = await params;
  const { section, passageIndex, page, block, passage, note, noteId, thread } = await searchParams;

  let material;
  try {
    material = await loadReaderMaterial(slug);
  } catch (err) {
    if (err instanceof MaterialNotFoundError) {
      notFound();
    }
    throw err;
  }

  // Every single-document viewer's wrapper takes the same props
  // (DocumentModalProps), so they're built once here rather than per branch.
  if (material.kind !== "book") {
    const documentProps = {
      slug,
      materialId: material.materialId,
      title: material.title,
      sourceUrl: material.sourceUrl,
      urlLocator: locatorFromQuery({ section, passageIndex, page, block }),
    };
    if (material.kind === "pdf") return <PdfDocumentModal {...documentProps} />;
    if (material.kind === "docx") return <DocxDocumentModal {...documentProps} />;
    return <ArticleDocumentModal {...documentProps} articleUrl={material.articleUrl} />;
  }

  return (
    <ReaderModal
      slug={material.slug}
      metadata={material.metadata}
      contentBase={material.contentBase}
      materialId={material.materialId}
      targetSectionId={section}
      targetPassageId={passage}
      targetNoteId={note}
      targetGeneralNoteId={noteId}
      targetThreadId={thread}
    />
  );
}
