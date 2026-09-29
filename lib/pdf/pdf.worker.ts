// pdf.js worker entry: polyfill the worker's own globals, then load pdf.js's
// worker, which wires itself to `self` on evaluation. ES imports run in order,
// so the shims are in place before any pdf.js code executes.
import "./polyfills";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
