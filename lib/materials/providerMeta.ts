import type { Json } from "@/lib/supabase/database.types";

/** Shape written by scripts/generate-material-google-metadata.ts. `isbn` lives here
 * (not a standalone column) since it only ever needs to be read alongside the rest of
 * Google's response, and filtered via `google_meta_data->>'isbn'` (see the two
 * generate-material-*-metadata.ts scripts and the index in
 * migrations/20260829_materials_provider_metadata.sql). */
export type GoogleMetaData = {
  googleBooksId: string | null;
  isbn: string | null;
  coverUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  /** The matched volume's own title/author — carried along purely so
   * lib/materials/enrichMaterial.ts can backfill a material's own (empty)
   * title/author column from it. Not read anywhere else: display always
   * goes through the material's own canonical title/author, never these. */
  title: string | null;
  author: string | null;
};

/** Shape written by scripts/generate-material-openlibrary-metadata.ts. */
export type OpenLibraryMetaData = {
  coverUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  /** Same backfill-only purpose as GoogleMetaData.author above — OpenLibrary's
   * `jscmd=data` response carries authors too. */
  author: string | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseGoogleMetaData(json: Json | null | undefined): GoogleMetaData {
  const obj = (json ?? {}) as Record<string, unknown>;
  return {
    googleBooksId: str(obj.googleBooksId),
    isbn: str(obj.isbn),
    coverUrl: str(obj.coverUrl),
    thumbnailUrl: str(obj.thumbnailUrl),
    description: str(obj.description),
    title: str(obj.title),
    author: str(obj.author),
  };
}

export function parseOpenLibraryMetaData(json: Json | null | undefined): OpenLibraryMetaData {
  const obj = (json ?? {}) as Record<string, unknown>;
  return {
    coverUrl: str(obj.coverUrl),
    thumbnailUrl: str(obj.thumbnailUrl),
    description: str(obj.description),
    author: str(obj.author),
  };
}
