/** Columns required to render a catalogue card. Keep this list deliberately
 * narrow: materials also contains reader/navigation data that can be large. */
export const MATERIAL_SUMMARY_COLUMNS =
  "id, slug, material_type, title, author, description, cover_url, thumbnail_url, google_meta_data, openlibrary_meta_data, cover_source, language, published_year, page_count_estimate, categories, created_at, uploaded_by, visibility";

/** Metadata required by detail pages, excluding TOC/spine payloads.
 * `source_url` is only ever read back for a reader's own upload (deleting
 * it — DELETE /api/materials/[materialId] — needs the raw source file's
 * object path), but it's cheap to always select alongside json_storage_path
 * rather than adding a second, narrower column list just for that one
 * route. */
export const MATERIAL_DETAIL_COLUMNS =
  `${MATERIAL_SUMMARY_COLUMNS}, narrator_count, json_storage_path, article_html_storage_path, source_url, status, updated_at, reaction_count`;
