"use client";

import { useEffect, useState } from "react";

/** Why a PDF couldn't be fetched — distinguished because the reader says
 * different things for each: a network problem is worth retrying, a file that
 * isn't a PDF is not. */
export type PdfFetchErrorKind = "network" | "not-pdf";

export class PdfFetchError extends Error {
  constructor(
    readonly kind: PdfFetchErrorKind,
    message: string
  ) {
    super(message);
    this.name = "PdfFetchError";
  }
}

/** A PDF's header may be preceded by junk (the spec tolerates up to 1KB of it,
 * and real files lean on that), so the signature is looked for, not assumed at
 * byte 0. */
const HEADER_SEARCH_BYTES = 1024;
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function looksLikePdf(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, HEADER_SEARCH_BYTES));
  outer: for (let i = 0; i <= bytes.length - PDF_SIGNATURE.length; i++) {
    for (let j = 0; j < PDF_SIGNATURE.length; j++) if (bytes[i + j] !== PDF_SIGNATURE[j]) continue outer;
    return true;
  }
  return false;
}

async function fetchPdf(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new PdfFetchError("network", "The document couldn't be downloaded. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new PdfFetchError("network", `The document couldn't be downloaded (HTTP ${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || !looksLikePdf(buffer)) {
    throw new PdfFetchError("not-pdf", "This file isn't a readable PDF.");
  }
  return buffer;
}

/**
 * The document's bytes, fetched here rather than by passing the URL to EmbedPDF.
 * EmbedPDF's own URL loader hands whatever comes back straight to PDFium without
 * looking at the status, so a 404 or an expired link surfaced as "this PDF is
 * corrupt" — here it's a download error the reader can retry, and a file that
 * isn't a PDF at all is caught before PDFium ever sees it.
 *
 * Runs alongside the engine's startup rather than after it: both are mostly
 * network, so the reader waits for the slower of the two, not their sum.
 * `generation` refetches, for Retry.
 */
export function usePdfBytes(url: string, generation: number) {
  const [state, setState] = useState<{ buffer: ArrayBuffer | null; error: Error | null }>({
    buffer: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchPdf(url, controller.signal).then(
      (buffer) => {
        if (!controller.signal.aborted) setState({ buffer, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ buffer: null, error: error instanceof Error ? error : new Error(String(error)) });
      }
    );
    return () => {
      controller.abort();
      setState({ buffer: null, error: null });
    };
  }, [url, generation]);

  return state;
}
