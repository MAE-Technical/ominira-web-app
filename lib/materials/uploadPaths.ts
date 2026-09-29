export type UploadMaterialType = "book" | "pdf" | "docx";

const EXTENSION_BY_MATERIAL_TYPE: Record<UploadMaterialType, string> = { book: "epub", pdf: "pdf", docx: "docx" };
const THUMBNAIL_EXTENSIONS = new Set(["png", "jpg", "gif", "webp", "svg"]);

export function isUploadMaterialType(value: unknown): value is UploadMaterialType {
  return value === "book" || value === "pdf" || value === "docx";
}

/** The thumbnail's file extension from its MIME type, or null for anything
 * that isn't an image we accept as a cover. */
export function thumbnailExtension(contentType: unknown): string | null {
  if (typeof contentType !== "string" || !contentType.startsWith("image/")) return null;
  const sub = contentType.slice("image/".length).split("+")[0];
  const ext = sub === "jpeg" ? "jpg" : sub;
  return THUMBNAIL_EXTENSIONS.has(ext) ? ext : null;
}

/**
 * Every Storage object one upload may write, derived only from the uploader's
 * own id and a server-issued uploadId — never from client-supplied paths — so
 * the finalize step (POST /api/materials/upload) can only ever claim objects
 * under the caller's own `uploads/{readerId}/` folder. Both the signing route
 * and the finalize route build paths here, so they can't drift apart.
 */
export function uploadObjectPaths(readerId: string, uploadId: string, materialType: UploadMaterialType, thumbExt: string | null) {
  const folder = `uploads/${readerId}`;
  const prefix = `${folder}/${uploadId}`;
  return {
    folder,
    source: `${prefix}.${EXTENSION_BY_MATERIAL_TYPE[materialType]}`,
    json: materialType === "book" ? `${prefix}.json` : null,
    thumbnail: thumbExt ? `${prefix}-thumbnail.${thumbExt}` : null,
  };
}
