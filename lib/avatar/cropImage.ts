import type { Area } from "react-easy-crop";
import { AVATAR_EXPORT_PX } from "@/lib/avatar/avatar";

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  return [canvas, ctx];
}

/** Draws the cropped square of `src` at AVATAR_EXPORT_PX and encodes it —
 * WebP where the browser can, otherwise whatever toBlob falls back to (PNG
 * on older Safari); the upload route accepts either. A phone photo's crop
 * can be thousands of px across, and one big downscale drops detail (the
 * result reads soft and flat), so it halves in steps down to the target. */
export async function cropToAvatar(src: string, area: Area): Promise<Blob> {
  const image = new Image();
  image.src = src;
  await image.decode();

  let size = Math.round(area.width);
  const [first, ctx] = canvasOf(size);
  let canvas = first;
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);

  while (size > AVATAR_EXPORT_PX) {
    const next = Math.max(AVATAR_EXPORT_PX, Math.round(size / 2));
    const [nextCanvas, nextCtx] = canvasOf(next);
    nextCtx.drawImage(canvas, 0, 0, next, next);
    [canvas, size] = [nextCanvas, next];
  }

  // A crop smaller than the target is upscaled once rather than left small.
  if (size < AVATAR_EXPORT_PX) {
    const [out, outCtx] = canvasOf(AVATAR_EXPORT_PX);
    outCtx.drawImage(canvas, 0, 0, AVATAR_EXPORT_PX, AVATAR_EXPORT_PX);
    canvas = out;
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop image."))), "image/webp", 0.92)
  );
}
