import type { Metadata } from "next";
import Reader from "@/app/components/reader/Reader";
import { readerPageMetadata, loadReaderPageBook } from "@/lib/reader/readerPageData";

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
 * feed's permalinks (NoteBookHeader.tsx).
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
