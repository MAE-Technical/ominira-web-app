import "./polyfills";
import { GlobalWorkerOptions } from "pdfjs-dist";

/**
 * Browser-side pdf.js setup for the upload parser (lib/book/pdfParser.ts), which
 * resolves to the legacy pdf.js module (next.config.ts). The reader doesn't use
 * pdf.js at all — it renders with PDFium (lib/pdf/pdfiumEngine.ts).
 *
 * `workerPort` rather than `workerSrc`: pdf.js's worker file can't be
 * polyfilled from outside, so lib/pdf/pdf.worker.ts wraps it and the bundler
 * builds that as a real worker entry. A shared port is also reused across
 * documents instead of pdf.js spawning (and parsing ~2MB of worker) per open.
 */
if (typeof window !== "undefined" && !GlobalWorkerOptions.workerPort) {
  GlobalWorkerOptions.workerPort = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
}
