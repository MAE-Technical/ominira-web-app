import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReaderModal from "@/app/components/reader/ReaderModal";
import { getBookDocumentFromMaterial, MaterialNotFoundError } from "@/lib/materials/toBookDocument";
import { getMaterialDetail } from "@/lib/materials/detail";
import { PLATFORM_NAME } from "@/lib/config/platform";

// Same cheap DB-only metadata as app/read/[slug]/page.tsx's own
// generateMetadata — kept in sync so the tab title still reflects the book
// being read even when this intercepted overlay, not the hard-navigation
// page, is what's actually mounted.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let material;
  try {
    material = await getMaterialDetail(slug);
  } catch {
    return { title: "Book not found" };
  }
  const { title, author, description } = material;
  const desc = description || `${title} by ${author} — read or listen on ${PLATFORM_NAME}.`;
  return { title, description: desc };
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
  searchParams: Promise<{ section?: string; passage?: string; note?: string; noteId?: string }>;
}) {
  const { slug } = await params;
  const { section, passage, note, noteId } = await searchParams;

  let book, materialId, eagerSectionIds;
  try {
    ({ book, materialId, eagerSectionIds } = await getBookDocumentFromMaterial(slug, { eagerSectionId: section }));
  } catch (err) {
    if (err instanceof MaterialNotFoundError) {
      notFound();
    }
    throw err;
  }
  return (
    <ReaderModal
      book={book}
      materialId={materialId}
      eagerSectionIds={eagerSectionIds}
      targetSectionId={section}
      targetPassageId={passage}
      targetNoteId={note}
      targetGeneralNoteId={noteId}
    />
  );
}
