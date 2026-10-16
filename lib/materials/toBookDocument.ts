import type { BookMetadata } from "@/lib/book/schema";
import type { Database } from "@/lib/supabase/database.types";
import { resolveBookCoverSrc } from "./image";
import { parseGoogleMetaData, parseOpenLibraryMetaData } from "./providerMeta";

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

export class MaterialNotFoundError extends Error {
  constructor(materialId: string) {
    super(`No published material found for "${materialId}"`);
    this.name = "MaterialNotFoundError";
  }
}

/** A book's metadata from its materials row, which wins over the document's
 * own: a reader can retitle their upload, and the cover follows the same own
 * -> openlibrary -> google cascade as everywhere else (lib/materials/
 * image.ts), so ChaptersDrawer, NowPlayingBar and the media session all get
 * the resolved one. */
export function bookMetadataFromRow(row: MaterialRow): BookMetadata {
  const google = parseGoogleMetaData(row.google_meta_data);
  const openlibrary = parseOpenLibraryMetaData(row.openlibrary_meta_data);
  return {
    title: row.title,
    author: row.author,
    description: row.description ?? "",
    cover:
      resolveBookCoverSrc({
        cover: row.cover_url,
        coverSource: row.cover_source,
        googleCoverUrl: google.coverUrl,
        googleThumbnailUrl: google.thumbnailUrl,
        openlibraryCoverUrl: openlibrary.coverUrl,
        openlibraryThumbnailUrl: openlibrary.thumbnailUrl,
      }) ?? "",
    language: row.language ?? "",
    publishedYear: row.published_year ?? undefined,
    pageCountEstimate: row.page_count_estimate ?? 0,
  };
}
