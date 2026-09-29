// Shared between HomeComposer's "Add files" and the library's AddBookModal
// (lib/materials/useUploadBook.ts's own DRY note extends to these too) — one
// place for what's acceptable to pick, so the two entry points can't drift
// out of sync on formats or caps.
export const ACCEPTED_FILE_TYPES =
  ".pdf,.epub,.docx,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type UploadLimits = { maxFileSizeBytes: number; maxFiles: number };

export const MEMBER_UPLOAD_LIMITS: UploadLimits = { maxFileSizeBytes: 10 * 1024 * 1024, maxFiles: 10 };
// Admins add editorial books in bulk from /admin/library/new. The server
// grants this cap only to ADMIN_EMAILS (isAdminReader) — the client value is
// just for fail-fast feedback.
export const ADMIN_UPLOAD_LIMITS: UploadLimits = { maxFileSizeBytes: 200 * 1024 * 1024, maxFiles: 20 };

export const MAX_FILE_SIZE_BYTES = MEMBER_UPLOAD_LIMITS.maxFileSizeBytes;
export const MAX_FILES = MEMBER_UPLOAD_LIMITS.maxFiles;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
