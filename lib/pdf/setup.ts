import "./polyfills";
import { GlobalWorkerOptions } from "pdfjs-dist";

/**
 * Browser-side pdf.js setup, shared by the reader (react-pdf) and the upload
 * parser — both resolve to the same legacy pdf.js module (next.config.ts), so
 * one GlobalWorkerOptions and one worker serve both.
 *
 * `workerPort` rather than `workerSrc`: pdf.js's worker file can't be
 * polyfilled from outside, so lib/pdf/pdf.worker.ts wraps it and the bundler
 * builds that as a real worker entry. A shared port is also reused across
 * documents instead of pdf.js spawning (and parsing ~2MB of worker) per open.
 */
if (typeof window !== "undefined" && !GlobalWorkerOptions.workerPort) {
  GlobalWorkerOptions.workerPort = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
}
