import type { AnnotationRange } from "@/lib/api/types";

/**
 * A place in a surface's text: a block (an EPUB passage, a PDF page, a
 * paragraph of an article) and a character offset into that block's own text.
 * The same `{ passageId, start, end }` ranges every highlight and note is saved
 * with are made of these, so a block id is exactly what ends up in
 * `AnnotationRange.passageId` — that's what lets one set of tables, mutations,
 * queries and feed code serve every format unchanged.
 */
export type TextPoint = { block: string; offset: number };

/**
 * Everything the shared selection engine needs to know about one kind of
 * content — the geometry of its text, and nothing about highlights, notes,
 * menus or gestures, which are the engine's (lib/annotations/useTextSelection).
 * Implemented once for DOM text (EPUB, web articles, DOCX — createDomSurface
 * below) and once for PDF pages (PDFium's glyph geometry).
 */
export interface SelectionSurface {
  /** The text position nearest a viewport point, or null when the point isn't
   * over (or near) any text. */
  pointAt(clientX: number, clientY: number): TextPoint | null;
  /** The word containing a position — long-press and double-click select it. */
  wordAt(point: TextPoint): { start: TextPoint; end: TextPoint } | null;
  /** Reading-order comparison: negative when `a` comes first. */
  compare(a: TextPoint, b: TextPoint): number;
  /** Viewport rects covering the text from `start` to `end` (start ≤ end) —
   * what the engine draws the selection with. */
  rectsFor(start: TextPoint, end: TextPoint): DOMRect[];
  /** The saved form of start..end: one range per block it touches, in reading
   * order, each carrying its own slice of text (the quote). */
  rangesFor(start: TextPoint, end: TextPoint): AnnotationRange[];
}

/** Marks UI inside a text block that isn't the text itself — a note glyph's
 * count, a play button — so it's never counted in offsets or selected. */
export const SELECTION_IGNORE_ATTR = "data-selection-ignore";

type DomSurfaceOptions =
  | {
      /** The attribute naming each block's id — `data-passage-id` for EPUB. */
      blockAttribute: string;
      /** Blocks that hold no selectable text (images, rules). Default: all do. */
      isTextBlock?: (el: HTMLElement) => boolean;
    }
  | {
      /** The blocks in reading order, ids `b{index}` — for HTML the reader
       * doesn't own (web articles, DOCX), where there's nowhere stable to
       * write an id attribute: React may replace it at any render. Read fresh
       * on every call, so a replaced DOM is picked up as it is. */
      listBlocks: () => HTMLElement[];
    };

/** The block id of an indexed block (DomSurfaceOptions.listBlocks). */
export const indexedBlockId = (index: number) => `b${index}`;
export const indexOfBlockId =(id: string) => (/^b\d+$/.test(id) ? Number(id.slice(1)) : -1);

/** How a DOM surface finds its blocks and names them. */
type BlockModel = {
  list(): HTMLElement[];
  id(el: HTMLElement): string;
  el(id: string): HTMLElement | null;
  /** The (innermost) block containing an element. */
  containing(el: Element): HTMLElement | null;
  /** Reading-order index of a block id, -1 if gone. */
  index(id: string): number;
};

function attributeBlocks(root: HTMLElement, attribute: string, isTextBlock: (el: HTMLElement) => boolean): BlockModel {
  const selector = `[${attribute}]`;
  const isLeaf = (el: HTMLElement) => isTextBlock(el) && !el.querySelector(selector);
  const list = () => Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isLeaf);
  const id = (el: HTMLElement) => el.getAttribute(attribute)!;
  const order = new Map<string, number>();
  return {
    list,
    id,
    el: (blockId) => root.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(blockId)}"]`),
    containing(el) {
      const block = el.closest<HTMLElement>(selector);
      return block && root.contains(block) && isLeaf(block) ? block : null;
    },
    index(blockId) {
      if (!order.has(blockId)) {
        order.clear();
        list().forEach((el, i) => order.set(id(el), i));
      }
      return order.get(blockId) ?? -1;
    },
  };
}

function indexedBlocks(listBlocks: () => HTMLElement[]): BlockModel {
  return {
    list: listBlocks,
    id: (el) => indexedBlockId(listBlocks().indexOf(el)),
    el: (blockId) => listBlocks()[indexOfBlockId(blockId)] ?? null,
    containing: (el) => listBlocks().find((b) => b.contains(el)) ?? null,
    index: (blockId) => (indexOfBlockId(blockId) < listBlocks().length ? indexOfBlockId(blockId) : -1),
  };
}

const WORD_SEGMENTER =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

/** The word around `offset` in a block's text, as [start, end) — null when
 * the offset sits on whitespace or punctuation (nothing worth selecting).
 * Shared by every surface, so "a word" means the same thing on every format. */
export function wordAround(text: string, offset: number): { start: number; end: number } | null {
  if (!text) return null;
  const at = Math.max(0, Math.min(offset, text.length - 1));
  let start = at;
  let end = at + 1;
  if (WORD_SEGMENTER) {
    for (const seg of WORD_SEGMENTER.segment(text)) {
      if (at >= seg.index && at < seg.index + seg.segment.length) {
        start = seg.index;
        end = seg.index + seg.segment.length;
        break;
      }
    }
  } else {
    const isWord = (c: string) => /[\p{L}\p{N}'’-]/u.test(c);
    while (start > 0 && isWord(text[start - 1])) start--;
    while (end < text.length && isWord(text[end])) end++;
  }
  return text.slice(start, end).trim() ? { start, end } : null;
}

/**
 * A SelectionSurface over DOM text inside `root`, divided into blocks by
 * `blockAttribute` or, for HTML the reader doesn't own, by `listBlocks`.
 *
 * Hit-testing is done from text geometry (Range client rects) rather than
 * the browser's caret-from-point APIs: the engine turns native selection off
 * on reading content (user-select: none — the only way to keep the OS's own
 * Copy/Look Up menu away on iOS), and caret hit-testing is exactly the part
 * browsers are allowed to answer differently for non-selectable text.
 */
export function createDomSurface(root: HTMLElement, options: DomSurfaceOptions): SelectionSurface {
  const model =
    "listBlocks" in options
      ? indexedBlocks(options.listBlocks)
      : attributeBlocks(root, options.blockAttribute, options.isTextBlock ?? (() => true));
  const blocks = model.list;
  const blockEl = model.el;
  const blockId = model.id;
  const indexOf = model.index;

  /** The block's own text nodes, in order, minus any ignored UI. */
  const textNodes = (block: HTMLElement): Text[] => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest(`[${SELECTION_IGNORE_ATTR}]`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    return nodes;
  };

  const blockText = (block: HTMLElement) => textNodes(block).map((n) => n.data).join("");

  const charRect = (node: Text, i: number) => {
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + 1);
    return r.getBoundingClientRect();
  };

  /** The character offset nearest (x, y) within one block. Characters run in
   * reading order line by line, so a binary search over "is this character
   * before the point?" finds it in log time. */
  const offsetInBlock = (block: HTMLElement, x: number, y: number): number => {
    const nodes = textNodes(block);
    // Characters as (node, index) in reading order, found lazily by global index.
    const lengths = nodes.map((n) => n.length);
    const total = lengths.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    const at = (g: number) => {
      let i = 0;
      while (g >= lengths[i]) g -= lengths[i++];
      return charRect(nodes[i], g);
    };
    const before = (r: DOMRect) => {
      if (r.width === 0 && r.height === 0) return true; // collapsed (e.g. a trailing newline)
      if (r.bottom <= y) return true; // an earlier line
      if (r.top > y) return false; // a later line
      return r.left + r.width / 2 <= x; // same line: left of the point
    };
    let lo = 0;
    let hi = total; // first index not before the point
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (before(at(mid))) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** The block under a point — or, from the gaps between and around blocks
   * (margins, the space between paragraphs), the nearest one vertically, so a
   * drag that strays off the text keeps extending the selection sensibly. */
  const blockAt = (x: number, y: number): HTMLElement | null => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    if (hit && !root.contains(hit)) return null;
    const direct = hit && model.containing(hit);
    if (direct) return direct;
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const el of blocks()) {
      const r = el.getBoundingClientRect();
      const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (dist < bestDist) {
        best = el;
        bestDist = dist;
        if (dist === 0) break;
      }
    }
    return best;
  };

  return {
    pointAt(x, y) {
      const block = blockAt(x, y);
      if (!block) return null;
      return { block: blockId(block), offset: offsetInBlock(block, x, y) };
    },

    wordAt({ block, offset }) {
      const el = blockEl(block);
      if (!el) return null;
      const word = wordAround(blockText(el), offset);
      return word && { start: { block, offset: word.start }, end: { block, offset: word.end } };
    },

    compare(a, b) {
      return a.block === b.block ? a.offset - b.offset : indexOf(a.block) - indexOf(b.block);
    },

    rectsFor(start, end) {
      const rects: DOMRect[] = [];
      const from = indexOf(start.block);
      const to = indexOf(end.block);
      const all = blocks();
      for (let i = from; i <= to && i >= 0; i++) {
        const el = all[i];
        if (!el) continue;
        const s = i === from ? start.offset : 0;
        const e = i === to ? end.offset : Infinity;
        // Per text node, so ignored UI inside the block is never painted over.
        let acc = 0;
        for (const node of textNodes(el)) {
          const ns = Math.max(s - acc, 0);
          const ne = Math.min(e - acc, node.length);
          if (ns < ne) {
            const r = document.createRange();
            r.setStart(node, ns);
            r.setEnd(node, ne);
            for (const rect of r.getClientRects()) if (rect.width > 0.5 && rect.height > 0.5) rects.push(rect);
          }
          acc += node.length;
          if (acc >= e) break;
        }
      }
      return rects;
    },

    rangesFor(start, end) {
      const ranges: AnnotationRange[] = [];
      const from = indexOf(start.block);
      const to = indexOf(end.block);
      const all = blocks();
      for (let i = from; i <= to && i >= 0; i++) {
        const el = all[i];
        if (!el) continue;
        const text = blockText(el);
        const s = i === from ? start.offset : 0;
        const e = i === to ? end.offset : text.length;
        if (e > s && text.slice(s, e).trim()) ranges.push({ passageId: blockId(el), start: s, end: e, text: text.slice(s, e) });
      }
      return ranges;
    },
  };
}

