// Public entry point for the browser-side EPUB -> BookDocument parser (see
// reader-uploads-spec.md). Independent implementation of the same target
// shape the Python ingestion pipeline produces, validated against the same
// zod schema (lib/book/schema.ts) before a caller ever uploads it.

export { parseEpub, slugify } from "./document";
export type { ParsedBook, ParseEpubOptions } from "./document";
