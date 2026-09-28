import { resolveMaterialRow } from "@/lib/materials/resolve";
import { buildBookDocumentFromRow, MaterialNotFoundError } from "@/lib/materials/toBookDocument";
import { resolveStorageUrl } from "@/lib/storage/config";
import type { BookDocument } from "@/lib/book/schema";

export { MaterialNotFoundError };

export type ReaderMaterial =
  | { kind: "book"; book: BookDocument; materialId: string; eagerSectionIds: string[] }
  | { kind: "pdf"; materialId: string; title: string; author: string; sourceUrl: string }
  | { kind: "docx"; materialId: string; title: string; author: string; sourceUrl: string }
  | { kind: "webpage"; materialId: string; title: string; author: string; sourceUrl: string; articleHtml: string };

/**
 * The one place all three reader routes (app/read/[slug], app/reader/[slug],
 * app/@modal/(.)read/[slug]) resolve a slug and decide what kind of viewer
 * it needs — resolves the row exactly once, then either builds the full
 * `BookDocument` (EPUB) or hands back the bare fields `PdfDocumentView`
 * needs. See document-readers-spec.md § 1/§ 3.
 */
export async function loadReaderMaterial(
  slug: string,
  opts: { eagerSectionId?: string } = {}
): Promise<ReaderMaterial> {
  const row = await resolveMaterialRow(slug);
  if (!row) throw new MaterialNotFoundError(slug);

  if (row.material_type === "pdf" || row.material_type === "docx") {
    if (!row.source_url) throw new Error(`${row.material_type} material "${slug}" has no source_url`);
    return { kind: row.material_type, materialId: row.id, title: row.title, author: row.author, sourceUrl: row.source_url };
  }

  if (row.material_type === "webpage") {
    if (!row.source_url || !row.article_html_storage_path) {
      throw new Error(`webpage material "${slug}" is missing source_url or article_html_storage_path`);
    }
    const res = await fetch(resolveStorageUrl(row.article_html_storage_path));
    if (!res.ok) throw new Error(`Failed to fetch article HTML for "${slug}": ${res.status}`);
    return {
      kind: "webpage",
      materialId: row.id,
      title: row.title,
      author: row.author,
      sourceUrl: row.source_url,
      articleHtml: await res.text(),
    };
  }

  const { book, materialId, eagerSectionIds } = await buildBookDocumentFromRow(row, opts);
  return { kind: "book", book, materialId, eagerSectionIds };
}
