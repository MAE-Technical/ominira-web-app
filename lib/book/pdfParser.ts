// PDF -> metadata-only extraction (see reader-uploads-spec.md § 2). No
// structured content extraction, no BookDocument — a reader-uploaded PDF is
// rendered with a plain PDF viewer, not the structured reader. This module
// only pulls what the personal-library card/list needs: title/author (if
// present in the PDF's own metadata), page count, and a rasterized
// first-page thumbnail.

// pdf.js ships two builds: the browser build (used here in the app) and a
// `legacy` build meant for non-browser JS environments (used only by the
// Node-based manual-validation harness, scripts/test-pdf-parser.ts — see
// reader-uploads-spec.md § 2). Both expose the same API; only the import
// path and worker/font wiring differ.
const isServer = typeof window === "undefined";
const pdfjsLib = isServer
  ? await import("pdfjs-dist/legacy/build/pdf.mjs")
  : await import("pdfjs-dist");

if (isServer) {
  // Node has no Worker global pdf.js can post to and no bundler to resolve
  // `standard_fonts`/`cmaps` for it — point both at the package's own copies
  // on disk so base-14 font substitution and CJK text still work headlessly.
  const path = await import("node:path");
  const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(pdfjsDir, "legacy/build/pdf.worker.mjs");
} else if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // `new URL(..., import.meta.url)` is the bundler-portable way to point at
  // the worker copy pdfjs-dist ships, resolved at build time by
  // webpack/Turbopack.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
}

// Some PDF producers (ReportLab-generated ones among them) stamp a generic
// placeholder into the Info dictionary rather than leaving Title/Author
// unset — "anonymous" is the one actually seen in the wild (see
// document-readers-spec.md's PDF title/author fallback fix). Treated the
// same as absent so the caller's own filename/blank fallback kicks in
// instead of surfacing the placeholder verbatim.
const PLACEHOLDER_VALUES = new Set(["anonymous", "unknown", "untitled", "n/a"]);

function meaningful(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export interface PdfMetadata {
  title: string | null;
  author: string | null;
  pageCount: number;
}

export interface ParsedPdf {
  metadata: PdfMetadata;
  /** PNG bytes of the rasterized first page — caller uploads this as the
   * material's thumbnail asset. */
  thumbnail: Uint8Array;
  thumbnailWidth: number;
  thumbnailHeight: number;
}

const THUMBNAIL_MAX_WIDTH = 480;

export interface PdfCanvasFactory {
  createCanvas(width: number, height: number): {
    canvas: unknown;
    context: CanvasRenderingContext2D;
  };
  toPngBytes(canvas: unknown): Promise<Uint8Array>;
}

/** Browser canvas factory — the default when running in a page. Node
 * callers (the test harness) pass a `@napi-rs/canvas`-backed factory
 * instead, since there's no DOM to create a <canvas> element with. */
export const browserCanvasFactory: PdfCanvasFactory = {
  createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    return { canvas, context };
  },
  async toPngBytes(canvas) {
    const blob: Blob = await new Promise((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  },
};

export async function parsePdf(data: ArrayBuffer | Uint8Array, canvasFactory: PdfCanvasFactory = browserCanvasFactory): Promise<ParsedPdf> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const extraOptions = isServer
    ? await (async () => {
        const path = await import("node:path");
        const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
        return {
          standardFontDataUrl: path.join(pdfjsDir, "standard_fonts/"),
          cMapUrl: path.join(pdfjsDir, "cmaps/"),
          cMapPacked: true,
        };
      })()
    : {};
  const loadingTask = pdfjsLib.getDocument({ data: bytes, ...extraOptions });
  const doc = await loadingTask.promise;
  try {
    const pdfMetadata = await doc.getMetadata().catch(() => null);
    const info = (pdfMetadata?.info ?? {}) as { Title?: string; Author?: string };
    const metadata: PdfMetadata = {
      title: meaningful(info.Title),
      author: meaningful(info.Author),
      pageCount: doc.numPages,
    };

    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = THUMBNAIL_MAX_WIDTH / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const { canvas, context } = canvasFactory.createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvasContext: context, viewport, canvas: canvas as HTMLCanvasElement }).promise;
    const thumbnail = await canvasFactory.toPngBytes(canvas);

    return {
      metadata,
      thumbnail,
      thumbnailWidth: Math.round(viewport.width),
      thumbnailHeight: Math.round(viewport.height),
    };
  } finally {
    try {
      await (doc as unknown as { destroy?(): Promise<void> }).destroy?.();
    } catch {
      // best-effort cleanup only
    }
  }
}
