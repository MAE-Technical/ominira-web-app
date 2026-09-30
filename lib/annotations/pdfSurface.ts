import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import type { AnnotationRange } from "@/lib/api/types";
import { wordAround, type SelectionSurface } from "./surface";

/** Marks each rendered PDF page's element with its page index. */
export const PDF_PAGE_ATTR = "data-pdf-page";

/** A PDF page as an annotation block — what ends up in `AnnotationRange.passageId`. */
export const pdfBlockId = (pageIndex: number) => `pdf:p${pageIndex}`;
export const pdfPageIndexOf = (block: string) => (block.startsWith("pdf:p") ? Number(block.slice(5)) : -1);

/** One character's box, in page points from the page's top-left corner. */
type CharBox = { x: number; y: number; w: number; h: number; run: number };

/** A page's text and the geometry of every character in it — indexed the same
 * way (PDFium's text-page character index), so a character offset means one
 * thing for both. */
export type PdfPageText = { text: string; boxes: (CharBox | undefined)[] };

export type PdfSurface = SelectionSurface & {
  /** Starts loading a page's text and geometry (cheap to call repeatedly). */
  ensurePage(pageIndex: number): void;
  /** A loaded page's text + geometry, or undefined until it has loaded. */
  page(pageIndex: number): PdfPageText | undefined;
  /** Fires whenever another page finishes loading. */
  onPageLoad(listener: () => void): () => void;
};

/**
 * A SelectionSurface over PDF pages, from PDFium's own text and glyph
 * geometry — the PDF counterpart of createDomSurface, so the shared selection
 * engine and every highlight/note behave on a PDF exactly as on an EPUB.
 *
 * A page's text and geometry are loaded from the engine in the background as
 * the page comes into view (ensurePage); until then the page is simply not
 * selectable yet. Positions on screen are converted to and from page points
 * using the page element's rendered size, so hit-testing and drawing follow
 * any zoom without re-querying the engine.
 */
export function createPdfSurface(root: HTMLElement, engine: PdfEngine, doc: PdfDocumentObject): PdfSurface {
  const pages = new Map<number, PdfPageText>();
  const loading = new Set<number>();
  const listeners = new Set<() => void>();

  const ensurePage = (index: number) => {
    const page = doc.pages[index];
    if (!page || pages.has(index) || loading.has(index)) return;
    loading.add(index);
    engine
      .getPageGeometry(doc, page)
      .toPromise()
      .then(async (geo) => {
        const boxes: (CharBox | undefined)[] = [];
        geo.runs.forEach((run, r) => {
          run.glyphs.forEach((g, i) => {
            // flags 2 = an empty glyph (no ink, no box worth drawing).
            if (g.flags !== 2) boxes[run.charStart + i] = { x: g.x, y: g.y, w: g.width, h: g.height, run: r };
          });
        });
        const count = boxes.length;
        const [text = ""] = count
          ? await engine.getTextSlices(doc, [{ pageIndex: index, charIndex: 0, charCount: count }]).toPromise()
          : [""];
        pages.set(index, { text, boxes });
        listeners.forEach((l) => l());
      })
      .catch(() => {})
      .finally(() => loading.delete(index));
  };

  const pageEl = (index: number) => root.querySelector<HTMLElement>(`[${PDF_PAGE_ATTR}="${index}"]`);

  /** Page points per CSS pixel for a rendered page. */
  const layoutOf = (el: HTMLElement, index: number) => {
    const r = el.getBoundingClientRect();
    return { r, scale: r.width / doc.pages[index].size.width };
  };

  /** The page under a point — or, from the gap between pages, the nearest. */
  const pageAt = (x: number, y: number): HTMLElement | null => {
    const hit = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(`[${PDF_PAGE_ATTR}]`);
    if (hit && root.contains(hit)) return hit;
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const el of root.querySelectorAll<HTMLElement>(`[${PDF_PAGE_ATTR}]`)) {
      const r = el.getBoundingClientRect();
      const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (dist < bestDist) {
        best = el;
        bestDist = dist;
      }
    }
    return best;
  };

  return {
    ensurePage,
    page: (index) => pages.get(index),
    onPageLoad(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    pointAt(x, y) {
      const el = pageAt(x, y);
      if (!el) return null;
      const index = Number(el.getAttribute(PDF_PAGE_ATTR));
      const data = pages.get(index);
      if (!data) {
        ensurePage(index);
        return null;
      }
      const { r, scale } = layoutOf(el, index);
      const px = (x - r.left) / scale;
      const py = (y - r.top) / scale;
      // The nearest character, strongly preferring the line the point is on
      // (vertical distance weighted well above horizontal), then which half
      // of it the point falls in — a caret goes before or after it.
      let best = -1;
      let bestScore = Infinity;
      data.boxes.forEach((b, i) => {
        if (!b) return;
        const dy = py < b.y ? b.y - py : py > b.y + b.h ? py - (b.y + b.h) : 0;
        const dx = px < b.x ? b.x - px : px > b.x + b.w ? px - (b.x + b.w) : 0;
        const score = dy * 20 + dx;
        if (score < bestScore) {
          best = i;
          bestScore = score;
        }
      });
      if (best < 0) return null;
      const b = data.boxes[best]!;
      return { block: pdfBlockId(index), offset: best + (px > b.x + b.w / 2 ? 1 : 0) };
    },

    wordAt({ block, offset }) {
      const data = pages.get(pdfPageIndexOf(block));
      const word = data && wordAround(data.text, offset);
      return word ? { start: { block, offset: word.start }, end: { block, offset: word.end } } : null;
    },

    compare(a, b) {
      const pa = pdfPageIndexOf(a.block);
      const pb = pdfPageIndexOf(b.block);
      return pa === pb ? a.offset - b.offset : pa - pb;
    },

    rectsFor(start, end) {
      const rects: DOMRect[] = [];
      const from = pdfPageIndexOf(start.block);
      const to = pdfPageIndexOf(end.block);
      for (let index = from; index <= to; index++) {
        const data = pages.get(index);
        const el = pageEl(index);
        if (!data || !el) continue; // not loaded, or scrolled out of the DOM
        const { r, scale } = layoutOf(el, index);
        const s = index === from ? start.offset : 0;
        const e = index === to ? end.offset : data.boxes.length;
        for (const b of pdfRangeRects(data, s, e)) rects.push(new DOMRect(r.left + b.x * scale, r.top + b.y * scale, b.w * scale, b.h * scale));
      }
      return rects;
    },

    rangesFor(start, end) {
      const ranges: AnnotationRange[] = [];
      const from = pdfPageIndexOf(start.block);
      const to = pdfPageIndexOf(end.block);
      for (let index = from; index <= to; index++) {
        const data = pages.get(index);
        if (!data) continue;
        const s = index === from ? start.offset : 0;
        const e = index === to ? end.offset : data.text.length;
        const text = readableQuote(data.text.slice(s, e));
        if (e > s && text) ranges.push({ passageId: pdfBlockId(index), start: s, end: e, text });
      }
      return ranges;
    },
  };
}

/** A PDF's text keeps the page's own line breaks ("\r\n" wherever a line
 * wrapped), which read as ragged fragments once quoted in a note or the feed.
 * A word hyphenated across a line is rejoined (keeping the hyphen — it may be
 * a real one, "neo-colonialist"); every other line break becomes a space. The
 * offsets are untouched: this is only the quote. */
function readableQuote(text: string) {
  return text
    .replace(/-\r?\n\s*/g, "-")
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Rects (in page points) covering characters [start, end) of a loaded page —
 * one per stretch of consecutive characters on the same run (a line, or a piece
 * of one). The selection draws these (scaled to the screen), and a page's
 * highlight layer draws them as percentages of the page, so highlights follow
 * any zoom with no re-measuring. */
export function pdfRangeRects(data: PdfPageText, start: number, end: number) {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  let cur: { run: number; x0: number; x1: number; y0: number; y1: number } | null = null;
  const flush = () => {
    if (cur) out.push({ x: cur.x0, y: cur.y0, w: cur.x1 - cur.x0, h: cur.y1 - cur.y0 });
    cur = null;
  };
  for (let i = start; i < end; i++) {
    const b = data.boxes[i];
    if (!b) continue;
    if (cur && cur.run === b.run) {
      cur.x0 = Math.min(cur.x0, b.x);
      cur.x1 = Math.max(cur.x1, b.x + b.w);
      cur.y0 = Math.min(cur.y0, b.y);
      cur.y1 = Math.max(cur.y1, b.y + b.h);
    } else {
      flush();
      cur = { run: b.run, x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h };
    }
  }
  flush();
  return out;
}
