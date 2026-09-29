"use client";

import { useEffect, useState } from "react";
import type { FontFallbackConfig } from "@embedpdf/engines";
import { FontCharset, type PdfEngine } from "@embedpdf/models";
import { fonts as arabicFonts } from "@embedpdf/fonts-arabic";
import { fonts as hebrewFonts } from "@embedpdf/fonts-hebrew";
import { fonts as jpFonts } from "@embedpdf/fonts-jp";
import { fonts as krFonts } from "@embedpdf/fonts-kr";
import { fonts as latinFonts } from "@embedpdf/fonts-latin";
import { fonts as scFonts } from "@embedpdf/fonts-sc";
import { fonts as tcFonts } from "@embedpdf/fonts-tc";

/**
 * The PDFium (WebAssembly) engine behind the PDF reader — one per tab, shared by
 * every open of every document, and torn down once nothing has used it for a
 * while.
 *
 * Shared because starting it is the expensive part of opening a PDF: a worker,
 * plus compiling ~4.6MB of WebAssembly. Paying that once per session rather than
 * once per open is the difference between the second document appearing at once
 * and the reader waiting on a spinner again.
 *
 * Torn down when idle because a WebAssembly heap only ever grows — after a large
 * scanned PDF the engine can be holding a couple of hundred megabytes that it will
 * never hand back, which on a phone is memory the rest of the app (and every
 * other tab) is competing for. `IDLE_TEARDOWN_MS` is long enough to cover closing
 * one document and opening the next, short enough that it isn't left resident
 * for the rest of the session.
 */
const IDLE_TEARDOWN_MS = 60_000;

/**
 * Fonts PDFium falls back to for text in a script whose font the PDF didn't embed.
 *
 * PDFium carries its own metric-compatible substitutes for the Latin standard
 * fonts (the Times/Helvetica/Courier families), and running as WebAssembly it
 * never sees the device's installed fonts — which is exactly what makes a
 * document render identically on an Android phone and a Mac (the device-specific
 * fallback was the old pdf.js viewer's font bug). What it has no built-in
 * substitute for is CJK, Arabic, Hebrew, Cyrillic, Greek and Vietnamese; those
 * come from EmbedPDF's Noto packages, fetched on demand and only for a document
 * that actually needs them.
 *
 * Built here rather than taken from `@embedpdf/engines`' own `cdnFontConfig` for
 * two reasons: that one points at `@latest`, so the fonts a document renders with
 * could change underneath it, and importing it drags the in-thread engine
 * (~350KB, never used here) into the reader's bundle.
 */
const FONT_PACKAGE_VERSION = "1.0.0";

function fontVariants(files: { file: string; weight?: number; italic?: boolean }[], pkg: string) {
  const base = `https://cdn.jsdelivr.net/npm/@embedpdf/${pkg}@${FONT_PACKAGE_VERSION}/fonts`;
  return files.map((f) => ({ url: `${base}/${f.file}`, weight: f.weight, italic: f.italic }));
}

const latin = fontVariants(latinFonts, "fonts-latin");
const FONT_FALLBACK: FontFallbackConfig = {
  fonts: {
    [FontCharset.SHIFTJIS]: fontVariants(jpFonts, "fonts-jp"),
    [FontCharset.HANGEUL]: fontVariants(krFonts, "fonts-kr"),
    [FontCharset.GB2312]: fontVariants(scFonts, "fonts-sc"),
    [FontCharset.CHINESEBIG5]: fontVariants(tcFonts, "fonts-tc"),
    [FontCharset.ARABIC]: fontVariants(arabicFonts, "fonts-arabic"),
    [FontCharset.HEBREW]: fontVariants(hebrewFonts, "fonts-hebrew"),
    [FontCharset.CYRILLIC]: latin,
    [FontCharset.GREEK]: latin,
    [FontCharset.VIETNAMESE]: latin,
  },
};

async function createEngine(): Promise<PdfEngine> {
  const { createPdfiumEngine } = await import("@embedpdf/engines/pdfium-worker-engine");
  // Emitted by the bundler as a hashed, same-origin static asset. Turbopack
  // hands back a root-relative path ("/_next/static/media/pdfium.<hash>.wasm"),
  // and the engine fetches it from a worker started from a blob: URL, where a
  // relative path can't be resolved at all ("Failed to parse URL") — so it's
  // made absolute against the page first.
  const asset = new URL("@embedpdf/pdfium/pdfium.wasm", import.meta.url);
  const wasmUrl = new URL(String(asset), window.location.href).href;
  return createPdfiumEngine(wasmUrl, { fontFallback: FONT_FALLBACK });
}

type SharedEngine = {
  engine: Promise<PdfEngine>;
  users: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

let shared: SharedEngine | null = null;

function destroy(entry: SharedEngine) {
  entry.engine.then(
    (engine) => engine.destroy?.(),
    () => {}
  );
}

/**
 * Takes a reference on the shared engine, starting it if nothing holds one.
 * `release` hands it back; `discard` additionally marks this engine as broken
 * (its WebAssembly failed to load, say), so the next acquire starts a fresh one
 * instead of handing out the same failure again.
 */
function acquirePdfEngine() {
  if (!shared) {
    const entry: SharedEngine = { engine: createEngine(), users: 0, idleTimer: null };
    // A failed start (the engine chunk didn't download) must not be cached.
    entry.engine.catch(() => {
      if (shared === entry) shared = null;
    });
    shared = entry;
  }
  const entry = shared;
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
  entry.users += 1;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.users -= 1;
    if (entry.users > 0) return;
    if (shared !== entry) {
      destroy(entry);
      return;
    }
    entry.idleTimer = setTimeout(() => {
      if (entry.users > 0 || shared !== entry) return;
      shared = null;
      destroy(entry);
    }, IDLE_TEARDOWN_MS);
  };
  const discard = () => {
    if (shared === entry) shared = null;
  };
  return { engine: entry.engine, release, discard };
}

/**
 * Starts the engine without holding on to it — the engine code, its worker and
 * the ~2MB (compressed) WebAssembly download all begin now, in parallel with
 * everything else a PDF open waits on, instead of in sequence after the viewer's
 * own code has arrived (which put the WASM last on the critical path: ~6s of a
 * ~17s cold open). The viewer then acquires the same, already-starting engine; if
 * it never does, the idle teardown reclaims it.
 */
export function preloadPdfEngine() {
  acquirePdfEngine().release();
}

/**
 * The shared engine for as long as the calling component is mounted. Bumping
 * `generation` re-acquires — after `discard`, that means a fresh engine, which is
 * what a reader's Retry needs after the engine itself failed.
 */
export function usePdfEngine(generation: number) {
  const [state, setState] = useState<{
    engine: PdfEngine | null;
    error: Error | null;
    discard: () => void;
  }>({ engine: null, error: null, discard: () => {} });

  useEffect(() => {
    let active = true;
    const handle = acquirePdfEngine();
    handle.engine.then(
      (engine) => {
        if (active) setState({ engine, error: null, discard: handle.discard });
      },
      (error: unknown) => {
        if (active) setState({ engine: null, error: error instanceof Error ? error : new Error(String(error)), discard: handle.discard });
      }
    );
    return () => {
      active = false;
      handle.release();
      setState({ engine: null, error: null, discard: () => {} });
    };
  }, [generation]);

  return state;
}
