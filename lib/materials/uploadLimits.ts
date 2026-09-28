// Shared between HomeComposer's "Add files" and the library's AddBookButton
// (lib/materials/useUploadBook.ts's own DRY note extends to these too) — one
// place for what's acceptable to pick, so the two entry points can't drift
// out of sync on formats or caps.
export const ACCEPTED_FILE_TYPES =
  ".pdf,.epub,.docx,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 10;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
