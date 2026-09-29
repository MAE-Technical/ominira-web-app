"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type PdfDocumentView from "./PdfDocumentView";

/**
 * The browser-only entry point for PdfDocumentView — what every route and
 * wrapper imports instead of the view itself.
 *
 * react-pdf pulls in pdfjs-dist's viewer utilities, which touch `window` and
 * `document` at *module evaluation* (`webpack://pdf.js/web/ui_utils.js`:
 * `window.requestAnimationFrame(...)`, `document.documentElement.style`). That
 * happens during SSR/prerender of anything that imports it — including a
 * "use client" component, which Next still renders on the server — so the mere
 * import crashed the reader routes with `ReferenceError: window is not defined`
 * before any of this component's own code ran. No amount of `typeof window`
 * guarding inside the view can help: the throw is in the dependency's top-level
 * code, so the import itself has to be deferred to the client, which is exactly
 * what `ssr: false` does.
 *
 * It lives in a component of its own because `dynamic(..., { ssr: false })` is
 * only allowed in a client component, while the two reader routes
 * (app/read/[slug], app/reader/[slug]) are Server Components.
 *
 * The fallback is the same blank sheet the <Document> fetch and every unpainted
 * page show (see PdfScrollPages), so "the chunk is loading", "the PDF is
 * loading" and "this page hasn't painted" are one continuous wait in one visual
 * language, with nothing in this viewer ever spinning.
 */
const PdfDocumentViewClient = dynamic(() => import("./PdfDocumentView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full justify-center pt-[76px]" style={{ background: "var(--reader-bg)" }}>
      <div className="h-full w-full max-w-[min(90vw,800px)] animate-pulse rounded-sm bg-[var(--reader-surface)] shadow-sm ring-1 ring-[var(--reader-border)]" />
    </div>
  ),
});

export default function PdfDocumentLoader(props: ComponentProps<typeof PdfDocumentView>) {
  return <PdfDocumentViewClient {...props} />;
}
