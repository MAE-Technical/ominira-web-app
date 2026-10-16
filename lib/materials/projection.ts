import type { Database } from "@/lib/supabase/database.types";
import { fetchMaterialManifest } from "./manifest";
import { parseGoogleMetaData, parseOpenLibraryMetaData } from "./providerMeta";

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

// Everything `fields=` may request. All of it resolves off the row, except
// `spine` and the `sections` outline, which come from the small manifest.
// A book's text never passes through here: the reader fetches it from the
// CDN (lib/materials/readerFiles.ts).
const DB_ONLY_FIELDS = new Set([
  "title",
  "author",
  "description",
  "cover",
  "coverSource",
  "googleCoverUrl",
  "googleThumbnailUrl",
  "googleDescription",
  "googleMetaData",
  "openlibraryCoverUrl",
  "openlibraryThumbnailUrl",
  "openlibraryDescription",
  "openlibraryMetaData",
  "language",
  "publishedYear",
  "pageCountEstimate",
  "narratorCount",
  "spine",
  "toc_titles",
]);

/**
 * The `fields=` resolver: given a `materials` row and the requested field
 * list, returns those fields. Shared by the details route, the details page
 * and the OG image.
 */
export async function projectMaterial(row: MaterialRow, opts: { fields: string[] }): Promise<Record<string, unknown>> {
  const fields = new Set(opts.fields);
  const result: Record<string, unknown> = { id: row.id, slug: row.slug };

  const manifest =
    row.json_storage_path && (fields.has("spine") || fields.has("sections"))
      ? await fetchMaterialManifest(row.json_storage_path)
      : null;

  for (const field of fields) {
    if (DB_ONLY_FIELDS.has(field)) {
      switch (field) {
        case "title":
          result.title = row.title;
          break;
        case "author":
          result.author = row.author;
          break;
        case "description":
          result.description = row.description;
          break;
        case "cover":
          result.cover = row.cover_url;
          break;
        case "coverSource":
          result.coverSource = row.cover_source;
          break;
        case "googleCoverUrl":
          result.googleCoverUrl = parseGoogleMetaData(row.google_meta_data).coverUrl;
          break;
        case "googleThumbnailUrl":
          result.googleThumbnailUrl = parseGoogleMetaData(row.google_meta_data).thumbnailUrl;
          break;
        case "googleDescription":
          result.googleDescription = parseGoogleMetaData(row.google_meta_data).description;
          break;
        case "googleMetaData":
          result.googleMetaData = row.google_meta_data;
          break;
        case "openlibraryCoverUrl":
          result.openlibraryCoverUrl = parseOpenLibraryMetaData(row.openlibrary_meta_data).coverUrl;
          break;
        case "openlibraryThumbnailUrl":
          result.openlibraryThumbnailUrl = parseOpenLibraryMetaData(row.openlibrary_meta_data).thumbnailUrl;
          break;
        case "openlibraryDescription":
          result.openlibraryDescription = parseOpenLibraryMetaData(row.openlibrary_meta_data).description;
          break;
        case "openlibraryMetaData":
          result.openlibraryMetaData = row.openlibrary_meta_data;
          break;
        case "language":
          result.language = row.language;
          break;
        case "publishedYear":
          result.publishedYear = row.published_year;
          break;
        case "pageCountEstimate":
          result.pageCountEstimate = row.page_count_estimate;
          break;
        case "narratorCount":
          result.narratorCount = row.narrator_count;
          break;
        case "spine":
          result.spine = manifest?.spine ?? row.spine;
          break;
        case "toc_titles":
          result.toc_titles = row.toc_titles;
          break;
      }
      continue;
    }

    if (field === "sections") {
      // The outline only (TocSection[]), no passage content.
      result.sections = manifest?.toc ?? row.toc;
      continue;
    }
    // Unknown field name — ignored rather than erroring, so a client can
    // request a superset without every route needing to stay in lockstep.
  }

  return result;
}
