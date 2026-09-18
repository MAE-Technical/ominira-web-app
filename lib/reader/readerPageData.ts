import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBookDocumentFromMaterial, MaterialNotFoundError } from "@/lib/materials/toBookDocument";
import { getMaterialDetail } from "@/lib/materials/detail";
import { PLATFORM_NAME } from "@/lib/config/platform";

/**
 * Shared server-side load for the two routes that render the real,
 * standalone reader page — app/read/[slug] (the canonical/shareable URL)
 * and app/reader/[slug] (the soft-navigable entry point ReaderLink points
 * at, so the root layout's <audio> element never unmounts crossing into
 * it). Both render the exact same <Reader> with the exact same prop set,
 * so sharing this is a real de-dup, not forced abstraction — unlike
 * app/@modal/(.)read/[slug]/page.tsx, which renders <ReaderModal> with a
 * narrower prop set and stays deliberately separate (see its own doc
 * comment).
 */

// Deliberately uses the cheap DB-only getMaterialDetail rather than
// getBookDocumentFromMaterial (which pulls the full Section[] tree,
// including a Storage read for every passage) — a <title>/description tag
// only ever needs metadata, never the book's actual text.
export async function readerPageMetadata(slug: string): Promise<Metadata> {
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

export async function loadReaderPageBook(slug: string, eagerSectionId?: string) {
  try {
    return await getBookDocumentFromMaterial(slug, { eagerSectionId });
  } catch (err) {
    if (err instanceof MaterialNotFoundError) notFound();
    // Schema/parse errors and anything unexpected surface through error.tsx
    throw err;
  }
}
