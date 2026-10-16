import { resolveMaterialRow } from "@/lib/materials/resolve";
import { bookMetadataFromRow, MaterialNotFoundError } from "@/lib/materials/toBookDocument";
import { contentFolder } from "@/lib/materials/readerFiles";
import { cdnUrl } from "@/lib/storage/r2";
import type { BookMetadata } from "@/lib/book/schema";

export { MaterialNotFoundError };

export type ReaderMaterial =
  | { kind: "book"; materialId: string; slug: string; contentBase: string; metadata: BookMetadata }
  | { kind: "pdf"; materialId: string; title: string; author: string; sourceUrl: string }
  | { kind: "docx"; materialId: string; title: string; author: string; sourceUrl: string }
  | { kind: "webpage"; materialId: string; title: string; author: string; sourceUrl: string; articleUrl: string };

/**
 * The one place all three reader routes (app/read/[slug], app/reader/[slug],
 * app/@modal/(.)read/[slug]) resolve a slug and decide what kind of viewer
 * it needs. Database columns only: the browser fetches the book's text (or
 * the article's HTML) from the CDN itself, so none of it passes through
 * here. See bandwidth-spec.md step 5.
 */
export async function loadReaderMaterial(slug: string): Promise<ReaderMaterial> {
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
    return {
      kind: "webpage",
      materialId: row.id,
      title: row.title,
      author: row.author,
      sourceUrl: row.source_url,
      articleUrl: cdnUrl(row.article_html_storage_path),
    };
  }

  if (!row.json_storage_path) throw new Error(`book material "${slug}" has no json_storage_path`);
  return {
    kind: "book",
    materialId: row.id,
    slug: row.slug,
    contentBase: cdnUrl(contentFolder(row.json_storage_path)),
    metadata: bookMetadataFromRow(row),
  };
}
