"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Loader from "@/app/components/Loader";
import { usePdfBytes } from "@/lib/pdf/usePdfBytes";
import type { PdfDocumentViewProps } from "./PdfDocumentView";

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
 * It also starts the two slow parts of opening a PDF — the document download and
 * the engine (its code, worker and WebAssembly) — the moment the route mounts,
 * in parallel with the viewer's own code, rather than letting each wait for the
 * one before it. Run in sequence they made a cold open 16–22s on a phone
 * connection, long enough that readers took it for broken and refreshed.
 */
const PdfDocumentViewClient = dynamic(() => import("./PdfDocumentView"), {
  ssr: false,
  loading: () => (
    <div className="relative h-dvh w-full" style={{ background: "var(--reader-bg)" }}>
      <Loader confined />
    </div>
  ),
});

export default function PdfDocumentLoader(props: PdfDocumentViewProps) {
  // Bumped by Retry: refetches the document (and, when the engine was what
  // failed, the view starts a fresh one too).
  const [generation, setGeneration] = useState(0);
  const download = usePdfBytes(props.sourceUrl, generation);
  const retry = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    // Imported rather than statically linked so the engine module stays out of
    // the reader routes' bundle, which every EPUB open loads too.
    // A failure here is left to the view, which reports it with a Retry.
    import("@/lib/pdf/pdfiumEngine").then((m) => m.preloadPdfEngine(), () => {});
  }, []);

  return <PdfDocumentViewClient {...props} download={download} generation={generation} onRetry={retry} />;
}
