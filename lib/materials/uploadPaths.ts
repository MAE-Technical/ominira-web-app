export type UploadMaterialType = "book" | "pdf" | "docx";

const EXTENSION_BY_MATERIAL_TYPE: Record<UploadMaterialType, string> = { book: "epub", pdf: "pdf", docx: "docx" };
const THUMBNAIL_EXTENSIONS = new Set(["png", "jpg", "gif", "webp", "svg"]);
const IMAGE_NAME = /^[\w.-]{1,200}\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/** Cap on one EPUB's body images — well above any real book. */
export const MAX_UPLOAD_IMAGES = 500;

/** An EPUB body image's file name inside its upload's images folder:
 * URL-safe, image extension only, no path segments. */
export function isUploadImageName(value: unknown): value is string {
  return typeof value === "string" && IMAGE_NAME.test(value);
}

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
 * Every object one upload may write, derived only from the uploader's own id
 * and a server-issued uploadId — never from client-supplied paths — so the
 * finalize step (POST /api/materials/upload) can only ever claim objects in
 * the caller's own `uploads/{readerId}/` folder. Both the signing route and
 * the finalize route build paths here, so they can't drift apart. Finalize
 * moves them into the material's `books/<slug>/` folder.
 */
export function uploadObjectPaths(readerId: string, uploadId: string, materialType: UploadMaterialType, thumbExt: string | null) {
  const folder = `uploads/${readerId}/${uploadId}`;
  return {
    folder,
    source: `${folder}/source.${EXTENSION_BY_MATERIAL_TYPE[materialType]}`,
    json: materialType === "book" ? `${folder}/book.json` : null,
    thumbnail: thumbExt ? `${folder}/cover.${thumbExt}` : null,
    images: materialType === "book" ? `${folder}/images` : null,
  };
}
