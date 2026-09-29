// Public entry point for the browser-side EPUB -> BookDocument parser (see
// reader-uploads-spec.md). Independent implementation of the same target
// shape the Python ingestion pipeline produces, validated against the same
// zod schema (lib/book/schema.ts) before a caller ever uploads it.

export { parseEpub, slugify } from "./document";
export type { ParsedBook, ParseEpubOptions } from "./document";
// Re-exported so a caller that already has `coverPath` (ParsedBook's own
// field) can pull that one asset's raw bytes back out of the same archive
// for a preview thumbnail, without re-parsing the whole EPUB a second time.
export { ZipReader } from "./zip";
