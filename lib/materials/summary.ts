import type { Database } from "@/lib/supabase/database.types";
import type { MaterialSummary } from "@/lib/api/types";
import { parseGoogleMetaData, parseOpenLibraryMetaData } from "./providerMeta";

type MaterialRow = Pick<Database["public"]["Tables"]["materials"]["Row"],
  "id" | "slug" | "material_type" | "title" | "author" | "description" | "cover_url" |
  "language" | "published_year" | "page_count_estimate" | "categories" | "thumbnail_url" |
  "google_meta_data" | "openlibrary_meta_data" | "cover_source" | "uploaded_by" | "visibility">;

/** snake_case materials row -> camelCase MaterialSummary (api-spec.md's Shared Types). */
export function toMaterialSummary(row: MaterialRow): MaterialSummary {
  const google = parseGoogleMetaData(row.google_meta_data);
  const openlibrary = parseOpenLibraryMetaData(row.openlibrary_meta_data);
  return {
    id: row.id,
    slug: row.slug,
    materialType: row.material_type,
    title: row.title,
    author: row.author,
    description: row.description,
    cover: row.cover_url,
    thumbnail: row.thumbnail_url,
    googleCoverUrl: google.coverUrl,
    googleThumbnailUrl: google.thumbnailUrl,
    googleDescription: google.description,
    openlibraryCoverUrl: openlibrary.coverUrl,
    openlibraryThumbnailUrl: openlibrary.thumbnailUrl,
    openlibraryDescription: openlibrary.description,
    coverSource: row.cover_source,
    language: row.language,
    publishedYear: row.published_year,
    pageCountEstimate: row.page_count_estimate,
    categories: (row.categories as string[] | null) ?? [],
    // Real values, when wanted, are filled in by the caller after this
    // (listPublishedMaterials/getMaterialDetail) — see MaterialSummary's own
    // doc comment on why this isn't a plain materials-row column.
    currentReaders: [],
    currentReaderCount: 0,
    uploadedBy: row.uploaded_by,
    visibility: row.visibility,
  };
}
