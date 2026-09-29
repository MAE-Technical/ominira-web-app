"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type PdfDocumentView from "./PdfDocumentView";

/**
 * The browser-only entry point for PdfDocumentView — what every route and
 * wrapper imports instead of the view itself.
 *
 * The viewer is browser-only through and through — a WebAssembly engine in a
 * worker, blob URLs, pointer and viewport measurement — and there is nothing
 * about a PDF worth rendering on the server, so the whole module is deferred to
 * the client with `ssr: false`. That also keeps EmbedPDF out of the reader
 * routes' initial bundle: it's fetched only when a PDF is actually opened.
 *
 * It lives in a component of its own because `dynamic(..., { ssr: false })` is
 * only allowed in a client component, while the two reader routes
 * (app/read/[slug], app/reader/[slug]) are Server Components.
 *
 * The fallback is the same blank sheet PdfDocumentView shows while the document
 * downloads and opens, so "the chunk is loading" and "the PDF is loading" are one
 * continuous wait in one visual language, with nothing in this viewer spinning.
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
