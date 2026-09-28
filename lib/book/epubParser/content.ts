// One content document -> structured passages, in a single DOM walk —
// ported 1:1 from ingestion-pipeline/src/ingestion/epubparser/content.py.
//
// Besides passages, the walk produces two side tables the assembler needs:
// - `anchors`: element id -> passage index, so TOC fragments resolve.
// - `notes`: element id -> note body text, file-scoped.

import * as paths from "./paths";
import { attr, cleanText, children, isElementNode, isTextNode, localName, parseDocument } from "./dom";
import type { AnyNode, Element } from "./dom";
import { StyleClasses } from "./css";

export const BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "section", "article", "aside",
  "blockquote", "ul", "ol", "li", "table", "figure", "figcaption", "pre", "hr",
  "dl", "dt", "dd", "nav", "header", "footer", "main", "center", "address",
  "details", "summary", "fieldset", "form", "svg",
]);
const SKIP_TAGS = new Set(["script", "style", "template", "noscript", "head", "title", "meta", "link", "base"]);
const HEADING_TAGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
const EM_TAGS = new Set(["i", "em", "cite", "var", "dfn"]);
const STRONG_TAGS = new Set(["b", "strong"]);
const CODE_TAGS = new Set(["code", "kbd", "samp", "tt"]);

const NOTE_BODY_HINTS = ["footnote", "endnote", "rearnote", "note"];
const NOTE_REF_MARKERS = ["noteref", "footnoteref", "endnoteref", "fnref"];
const NOTE_BODY_TYPES = new Set(["footnote", "endnote", "rearnote", "note"]);
const CAPTION_HINT = "caption";
const ALIGNMENT_VALUES = ["left", "center", "right", "justify"] as const;
type Alignment = (typeof ALIGNMENT_VALUES)[number];

const FONT_WEIGHT_NUM = /font-weight:\s*[6-9]00/;
const TABLE_LABEL = /^table\s+[a-z0-9]{1,4}([.\-–][a-z0-9]{1,4})*\s*$/i;
const TABLE_LABELED_CAPTION = /^table\s+[a-z0-9]{1,4}([.\-–][a-z0-9]{1,4})*[\s.:–—-]+\S/i;
const MAX_CAPTION_LEN = 160;

export type MarkKind = "em" | "strong" | "underline" | "strike" | "code" | "sub" | "sup" | "link" | "note";

export interface Mark {
  start: number;
  end: number;
  kind: MarkKind;
  noteTarget?: [string, string | null]; // (path, fragment) pre-resolution
  linkTarget?: [string, string | null]; // internal link (path, fragment)
  href?: string | null; // external URL
  noteId?: string; // filled by resolveNotes
  sectionId?: string; // filled by document assembly
  fragmentId?: string;
  internal?: boolean;
}

export interface TableCell {
  text: string;
  marks?: Mark[];
  align?: Alignment;
  rowspan?: number;
  colspan?: number;
  _th?: boolean;
}

export interface Table {
  rows: TableCell[][];
  caption?: string;
  header?: TableCell[][];
  footer?: TableCell[][];
}

export interface Definition {
  term: string;
  definitions: string[];
}

export interface Passage {
  type: "paragraph" | "heading" | "blockquote" | "image" | "listItem" | "code" | "horizontalRule" | "table" | "definitionList";
  text: string;
  marks?: Mark[];
  level?: number;
  src?: string | null;
  caption?: string | null;
  align?: Alignment;
  listLevel?: number;
  listStyle?: "ordered" | "unordered";
  listStart?: number;
  language?: string;
  table?: Table;
  definitions?: Definition[];
}

export interface FileContent {
  path: string;
  passages: Passage[];
  anchors: Map<string, number>;
  notes: Map<string, string>;
}

function styleOf(el: Element): string {
  return (attr(el, "style") ?? "").toLowerCase().replace(/ /g, "");
}

function classesOf(el: Element): Set<string> {
  return new Set((attr(el, "class") ?? "").split(/\s+/).filter(Boolean));
}

function tokens(el: Element, name: string): Set<string> {
  return new Set((attr(el, name) ?? "").toLowerCase().split(/\s+/).filter(Boolean));
}

function combinedHints(el: Element): string {
  return `${(attr(el, "epub:type") ?? "").toLowerCase()} ${(attr(el, "class") ?? "").toLowerCase()}`;
}

function isNoteRefEl(el: Element): boolean {
  const combined = combinedHints(el);
  if (NOTE_REF_MARKERS.some((marker) => combined.includes(marker))) return true;
  return tokens(el, "role").has("doc-noteref");
}

function isNoteBodyEl(el: Element): boolean {
  if (isNoteRefEl(el)) return false;
  const epubTypeTokens = tokens(el, "epub:type");
  if ([...epubTypeTokens].some((t) => NOTE_BODY_TYPES.has(t))) return true;
  const role = tokens(el, "role");
  if (role.has("doc-footnote") || role.has("doc-endnote")) return true;
  const classStr = (attr(el, "class") ?? "").toLowerCase();
  return NOTE_BODY_HINTS.some((hint) => classStr.includes(hint));
}

function hasNestedNoteBody(el: Element): boolean {
  for (const child of children(el)) {
    if (isNoteBodyEl(child) || hasNestedNoteBody(child)) return true;
  }
  return false;
}

function isCaptionEl(el: Element): boolean {
  return combinedHints(el).includes(CAPTION_HINT);
}

function isHidden(el: Element): boolean {
  if (attr(el, "hidden") !== undefined || attr(el, "aria-hidden") === "true") return true;
  return styleOf(el).includes("display:none");
}

function isPagebreak(el: Element): boolean {
  return tokens(el, "epub:type").has("pagebreak") || tokens(el, "role").has("doc-pagebreak");
}

function explicitAlign(el: Element): Alignment | undefined {
  if (localName(el) === "center") return "center";
  const style = styleOf(el);
  const found = ALIGNMENT_VALUES.find((v) => style.includes(`text-align:${v}`));
  if (found) return found;
  const a = (attr(el, "align") ?? "").toLowerCase();
  return (ALIGNMENT_VALUES as readonly string[]).includes(a) ? (a as Alignment) : undefined;
}

function spanEmphasis(el: Element, styles: StyleClasses): [boolean, boolean] {
  const style = styleOf(el);
  let italic = style.includes("font-style:italic") || style.includes("font-style:oblique");
  let bold = style.includes("font-weight:bold") || FONT_WEIGHT_NUM.test(style);
  const classes = classesOf(el);
  italic = italic || [...classes].some((c) => styles.italic.has(c));
  bold = bold || [...classes].some((c) => styles.bold.has(c));
  return [italic, bold];
}

function hasBlockChildren(el: Element): boolean {
  return children(el).some((c) => BLOCK_TAGS.has(localName(c)));
}

function intAttr(el: Element, name: string, fallback = 1): number {
  const raw = attr(el, name);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? Math.max(1, n) : fallback;
}

function cleanTextOfAlt(img: Element): string {
  return (attr(img, "alt") ?? "").split(/\s+/).filter(Boolean).join(" ");
}

function findLink(el: Element): Element | null {
  const stack = [...children(el)];
  while (stack.length) {
    const node = stack.shift()!;
    if (localName(node) === "a" && attr(node, "href")) return node;
    stack.unshift(...children(node));
  }
  return null;
}

class FileCtx {
  path: string;
  baseDir: string;
  styles: StyleClasses;
  out: FileContent;
  pendingIds: string[] = [];

  constructor(path: string, baseDir: string, styles: StyleClasses, out: FileContent) {
    this.path = path;
    this.baseDir = baseDir;
    this.styles = styles;
    this.out = out;
  }

  registerIds(el: Element): void {
    const id = attr(el, "id");
    if (id) this.pendingIds.push(id);
  }

  registerSubtreeIds(el: Element): void {
    const visit = (node: Element) => {
      const id = attr(node, "id");
      if (id) this.pendingIds.push(id);
      for (const child of children(node)) visit(child);
    };
    visit(el);
  }

  emit(passage: Passage): void {
    const index = this.out.passages.length;
    for (const pending of this.pendingIds) {
      if (!this.out.anchors.has(pending)) this.out.anchors.set(pending, index);
    }
    this.pendingIds = [];
    this.out.passages.push(passage);
  }

  flushTrailingIds(): void {
    const index = this.out.passages.length;
    for (const pending of this.pendingIds) {
      if (!this.out.anchors.has(pending)) this.out.anchors.set(pending, index);
    }
    this.pendingIds = [];
  }
}

interface BlockCtx {
  align?: Alignment;
  listLevel?: number;
  listStyle?: "ordered" | "unordered";
  listStart?: number;
  quote: boolean;
}

function withAlign(bctx: BlockCtx, align: Alignment | undefined): BlockCtx {
  return align ? { ...bctx, align } : bctx;
}

function runType(bctx: BlockCtx): "listItem" | "blockquote" | "paragraph" {
  if (bctx.listStyle) return "listItem";
  return bctx.quote ? "blockquote" : "paragraph";
}

// --- Inline walking ------------------------------------------------------

class InlineWalker {
  private ctx: FileCtx;
  private nbsp: boolean;
  private chunks: string[] = [];
  private length = 0;
  private marks: Mark[] = [];
  private suppressLinkMarks = false;

  constructor(ctx: FileCtx, nbspAsSpace = false) {
    this.ctx = ctx;
    this.nbsp = nbspAsSpace;
  }

  appendText(text: string | null | undefined): void {
    this.append(text);
  }

  private append(text: string | null | undefined): void {
    if (!text) return;
    if (this.nbsp) text = text.replace(/ /g, " ");
    text = text.replace(/[ \t\n\r\f\v]+/g, " ");
    const lastEndsWithSpace = this.chunks.length > 0 && this.chunks[this.chunks.length - 1].endsWith(" ");
    if (text === " " && (this.length === 0 || lastEndsWithSpace)) return;
    if (text.startsWith(" ") && (this.length === 0 || lastEndsWithSpace)) text = text.slice(1);
    if (text) {
      this.chunks.push(text);
      this.length += text.length;
    }
  }

  private addMark(start: number, kind: MarkKind, extra: Partial<Mark> = {}): void {
    if (this.length > start) this.marks.push({ start, end: this.length, kind, ...extra });
  }

  walkChildren(el: Element): void {
    for (const child of el.children) {
      if (isTextNode(child)) this.append(child.data);
      else if (isElementNode(child)) this.walk(child);
    }
  }

  walk(el: Element): void {
    const tag = localName(el);
    if (SKIP_TAGS.has(tag) || isHidden(el)) return;
    const id = attr(el, "id");
    if (id) this.ctx.pendingIds.push(id);
    if (isPagebreak(el)) return;
    if (tag === "br") {
      this.append(" ");
      this.walkChildren(el);
      return;
    }
    if (tag === "img") {
      this.append(cleanTextOfAlt(el));
      return;
    }
    const start = this.length;
    if (tag === "a" && attr(el, "href")) {
      this.walkChildren(el);
      this.emitLink(el, start);
      return;
    }
    if (tag === "sup") {
      const link = findLink(el);
      if (link !== null) {
        const prev = this.suppressLinkMarks;
        this.suppressLinkMarks = true;
        this.walkChildren(el);
        this.suppressLinkMarks = prev;
        this.emitLink(link, start, true);
      } else {
        this.walkChildren(el);
        this.addMark(start, "sup");
      }
      return;
    }
    if (tag === "span") {
      const [italic, bold] = spanEmphasis(el, this.ctx.styles);
      this.walkChildren(el);
      if (italic) this.addMark(start, "em");
      if (bold) this.addMark(start, "strong");
      return;
    }
    this.walkChildren(el);
    if (EM_TAGS.has(tag)) this.addMark(start, "em");
    else if (STRONG_TAGS.has(tag)) this.addMark(start, "strong");
    else if (tag === "u") this.addMark(start, "underline");
    else if (tag === "s" || tag === "strike" || tag === "del") this.addMark(start, "strike");
    else if (tag === "sub") this.addMark(start, "sub");
    else if (CODE_TAGS.has(tag)) this.addMark(start, "code");
  }

  private emitLink(el: Element, start: number, forceNote = false): void {
    if (this.length <= start) return;
    if (this.suppressLinkMarks && !forceNote) return;
    const href = attr(el, "href") ?? "";
    const [pathResolved, fragment] = paths.resolveHref(this.ctx.baseDir, href);
    if (pathResolved === null) {
      this.addMark(start, "link", { href });
      return;
    }
    const path = pathResolved === "" ? this.ctx.path : pathResolved;
    if (forceNote || isNoteRefEl(el)) {
      this.addMark(start, "note", { noteTarget: [path, fragment] });
    } else if (!this.suppressLinkMarks) {
      this.addMark(start, "link", { linkTarget: [path, fragment] });
    }
  }

  result(): [string, Mark[]] {
    const text = this.chunks.join("");
    const trimmed = text.trim();
    const trimStart = text.length - text.trimStart().length;
    const marks: Mark[] = [];
    for (const m of this.marks) {
      const start = m.start - trimStart;
      const end = m.end - trimStart;
      if (end <= 0 || start >= trimmed.length) continue;
      marks.push({ ...m, start: Math.max(0, start), end: Math.min(trimmed.length, end) });
    }
    marks.sort((a, b) => a.start - b.start || a.end - b.end);
    return [trimmed, marks];
  }
}

// --- Block walking ---------------------------------------------------------

function soleImage(el: Element): Element | null {
  const imgs = findAllImgs(el);
  if (imgs.length !== 1) return null;
  if (cleanText(el)) return null;
  return imgs[0];
}

function findAllImgs(el: Element): Element[] {
  const out: Element[] = [];
  const visit = (node: Element) => {
    if (localName(node) === "img") out.push(node);
    for (const child of children(node)) visit(child);
  };
  visit(el);
  return out;
}

function imageSrcAttr(img: Element): string | null {
  const src = attr(img, "src");
  if (src) return src;
  for (const [key, value] of Object.entries(img.attribs)) {
    if (key === "href" || key.endsWith("href")) return value;
  }
  return null;
}

function emitImage(img: Element, ctx: FileCtx, bctx: BlockCtx, caption?: string | null): void {
  const src = imageSrcAttr(img);
  let path: string | null = null;
  if (src) {
    const [resolved] = paths.resolveHref(ctx.baseDir, src);
    path = resolved === null ? src : resolved || null;
  }
  ctx.emit({ type: "image", text: cleanTextOfAlt(img), src: path ?? undefined, caption: caption ?? undefined, align: bctx.align });
}

function emitSvgImage(el: Element, ctx: FileCtx, bctx: BlockCtx): void {
  const stack = [...children(el)];
  const visit = (node: Element): Element | null => {
    if (localName(node) === "image" || localName(node) === "img") return node;
    for (const child of children(node)) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  for (const child of stack) {
    const found = visit(child);
    if (found) {
      emitImage(found, ctx, bctx);
      return;
    }
  }
}

function emitCode(pre: Element, ctx: FileCtx): void {
  const codeEl = children(pre).find((c) => localName(c) === "code") ?? null;
  const source = codeEl ?? pre;
  const classes = new Set([...classesOf(source), ...classesOf(pre)]);
  const languageClass = [...classes].find((c) => c.startsWith("language-"));
  const language = languageClass ? languageClass.slice("language-".length) : undefined;
  const text = cleanText(source).trim();
  if (text) ctx.emit({ type: "code", text, language });
}

function emitDefinitionList(dl: Element, ctx: FileCtx): void {
  const definitions: Definition[] = [];
  let current: Definition | null = null;
  for (const child of children(dl)) {
    ctx.registerIds(child);
    const tag = localName(child);
    if (tag === "dt") {
      current = { term: cleanText(child), definitions: [] };
      definitions.push(current);
    } else if (tag === "dd") {
      if (current === null) {
        current = { term: "", definitions: [] };
        definitions.push(current);
      }
      current.definitions.push(cleanText(child));
    }
  }
  const kept = definitions.filter((d) => d.term || d.definitions.some(Boolean));
  if (kept.length) {
    const text = kept.map((d) => `${d.term} ${d.definitions.join(" ")}`.trim()).join(" ");
    ctx.emit({ type: "definitionList", text, definitions: kept });
  }
}

function harvestNote(el: Element, ctx: FileCtx): void {
  const body = cleanText(el);
  const ids: string[] = [];
  const selfId = attr(el, "id");
  if (selfId) ids.push(selfId);
  const visit = (node: Element) => {
    const id = attr(node, "id");
    if (id && node !== el) ids.push(id);
    for (const child of children(node)) visit(child);
  };
  visit(el);
  for (const id of ids) {
    if (!ctx.out.notes.has(id)) ctx.out.notes.set(id, body);
  }
  for (const id of ids) ctx.pendingIds.push(id);
}

function walkFigure(el: Element, ctx: FileCtx, bctx: BlockCtx): void {
  const captionEl = findAllByTagLocal(el, "figcaption")[0] ?? null;
  const caption = captionEl ? cleanText(captionEl) : undefined;
  const img = findAllImgs(el)[0] ?? null;
  if (img) {
    ctx.registerSubtreeIds(el);
    emitImage(img, ctx, bctx, caption);
    return;
  }
  const svg = findAllByTagLocal(el, "svg")[0] ?? null;
  if (svg) {
    emitSvgImage(svg, ctx, bctx);
    return;
  }
  for (const child of children(el)) {
    if (localName(child) !== "figcaption") walkBlock(child, ctx, bctx);
  }
}

function findAllByTagLocal(root: Element, tag: string): Element[] {
  const out: Element[] = [];
  const visit = (node: Element) => {
    if (localName(node) === tag) out.push(node);
    for (const child of children(node)) visit(child);
  };
  visit(root);
  return out;
}

// --- Tables ------------------------------------------------------------

function tableRow(tr: Element, ctx: FileCtx): TableCell[] {
  ctx.registerIds(tr);
  const cells: TableCell[] = [];
  for (const cellEl of children(tr)) {
    const tag = localName(cellEl);
    if (tag !== "td" && tag !== "th") continue;
    ctx.registerIds(cellEl);
    const walker = new InlineWalker(ctx, true);
    walker.walkChildren(cellEl);
    const [text, marks] = walker.result();
    const cell: TableCell = { text, _th: tag === "th" };
    if (marks.length) cell.marks = marks;
    const align = explicitAlign(cellEl);
    if (align) cell.align = align;
    const rowspan = intAttr(cellEl, "rowspan");
    const colspan = intAttr(cellEl, "colspan");
    if (rowspan !== 1) cell.rowspan = rowspan;
    if (colspan !== 1) cell.colspan = colspan;
    cells.push(cell);
  }
  return cells;
}

function rowIsEmphasized(row: TableCell[]): boolean {
  let sawText = false;
  for (const cell of row) {
    const text = cell.text;
    const stripped = text.replace(/[\s ]/g, "");
    if (!stripped) continue;
    sawText = true;
    const covered = new Array(text.length).fill(false);
    for (const m of cell.marks ?? []) {
      if (m.kind === "em" || m.kind === "strong" || m.kind === "sup") {
        for (let i = m.start; i < Math.min(m.end, text.length); i++) covered[i] = true;
      }
    }
    for (let i = 0; i < text.length; i++) {
      if (!covered[i] && !/\s/.test(text[i]) && text[i] !== " ") return false;
    }
  }
  return sawText;
}

function absorbPrecedingCaption(ctx: FileCtx, table: Table): void {
  const p = ctx.out.passages;
  if (!p.length || p[p.length - 1].type !== "paragraph") return;
  const last = p[p.length - 1].text;
  if (TABLE_LABEL.test(last)) {
    table.caption = last;
    p.pop();
  } else if (
    p.length >= 2 &&
    p[p.length - 2].type === "paragraph" &&
    TABLE_LABEL.test(p[p.length - 2].text) &&
    last.length <= MAX_CAPTION_LEN
  ) {
    table.caption = `${p[p.length - 2].text.replace(/\.+$/, "")}. ${last}`;
    p.splice(p.length - 2, 2);
  } else if (TABLE_LABELED_CAPTION.test(last) && last.length <= MAX_CAPTION_LEN) {
    table.caption = last;
    p.pop();
  }
}

function tableText(table: Table): string {
  const cells: string[] = [];
  for (const group of ["header", "rows", "footer"] as const) {
    for (const row of table[group] ?? []) {
      for (const cell of row) if (cell.text) cells.push(cell.text);
    }
  }
  return [...(table.caption ? [table.caption] : []), ...cells].join(" ");
}

function walkTable(el: Element, ctx: FileCtx, bctx: BlockCtx): void {
  const role = tokens(el, "role");
  if (role.has("presentation") || role.has("none")) {
    for (const cell of findAllByTagLocal(el, "td").concat(findAllByTagLocal(el, "th"))) {
      walkChildrenDom(cell, ctx, bctx);
    }
    return;
  }

  const captionEl = findAllByTagLocal(el, "caption")[0] ?? null;
  const caption = captionEl ? cleanText(captionEl).replace(/ /g, " ").trim() : undefined;

  const header: TableCell[][] = [];
  const rows: TableCell[][] = [];
  const footer: TableCell[][] = [];
  const groups: [string, TableCell[][]][] = [
    ["thead", header],
    ["tbody", rows],
    ["tfoot", footer],
  ];
  for (const [groupTag, target] of groups) {
    for (const section of children(el).filter((c) => localName(c) === groupTag)) {
      for (const tr of children(section).filter((c) => localName(c) === "tr")) target.push(tableRow(tr, ctx));
    }
  }
  for (const tr of children(el).filter((c) => localName(c) === "tr")) rows.push(tableRow(tr, ctx));

  if (!header.length && rows.length) {
    const firstAllTh = rows[0].length > 0 && rows[0].every((c) => c._th);
    for (const row of [...header, ...rows, ...footer]) for (const c of row) delete c._th;
    if (firstAllTh) {
      header.push(rows.shift()!);
    } else if (rows.length >= 2 && rowIsEmphasized(rows[0]) && !rowIsEmphasized(rows[1])) {
      header.push(rows.shift()!);
    }
  } else {
    for (const rowGroup of [header, rows, footer]) for (const row of rowGroup) for (const c of row) delete c._th;
  }

  const nonEmptyRows = rows.filter((r) => r.length);
  if (!nonEmptyRows.length && !header.length) return;

  const table: Table = { rows: nonEmptyRows };
  if (caption) table.caption = caption;
  if (header.length) table.header = header;
  if (footer.length) table.footer = footer;
  if (!table.caption) absorbPrecedingCaption(ctx, table);
  ctx.emit({ type: "table", text: tableText(table), table, align: bctx.align });
}

// --- List walking --------------------------------------------------------

function walkList(el: Element, ctx: FileCtx, bctx: BlockCtx): void {
  const style: "ordered" | "unordered" = localName(el) === "ol" ? "ordered" : "unordered";
  const level = (bctx.listLevel ?? 0) + 1;
  const start = localName(el) === "ol" ? intAttr(el, "start", 1) : 1;
  let first = true;
  for (const li of children(el).filter((c) => localName(c) === "li")) {
    ctx.registerIds(li);
    if (isNoteBodyEl(li) && !hasNestedNoteBody(li)) {
      harvestNote(li, ctx);
      first = false;
      continue;
    }
    const itemCtx: BlockCtx = {
      align: bctx.align,
      listLevel: level,
      listStyle: style,
      listStart: first && start !== 1 ? start : undefined,
      quote: bctx.quote,
    };
    if (hasBlockChildren(li)) {
      walkChildrenDom(li, ctx, itemCtx);
    } else {
      const walker = new InlineWalker(ctx);
      walker.walkChildren(li);
      const [text, marks] = walker.result();
      if (text) {
        ctx.emit({
          type: "listItem",
          text,
          marks,
          align: itemCtx.align,
          listLevel: level,
          listStyle: style,
          listStart: itemCtx.listStart,
        });
      }
    }
    first = false;
  }
}

// --- Paragraph / generic block walking ------------------------------------

function walkParagraph(el: Element, ctx: FileCtx, bctx: BlockCtx): void {
  const img = soleImage(el);
  if (img) {
    ctx.registerSubtreeIds(el);
    emitImage(img, ctx, withAlign(bctx, explicitAlign(el)));
    return;
  }
  const walker = new InlineWalker(ctx);
  walker.walkChildren(el);
  const [text, marks] = walker.result();
  if (text) {
    ctx.emit({
      type: runType(bctx),
      text,
      marks,
      align: explicitAlign(el) ?? bctx.align,
      listLevel: bctx.listLevel,
      listStyle: bctx.listStyle,
      listStart: bctx.listStart,
    });
  }
}

function walkBlock(el: Element, ctx: FileCtx, bctx: BlockCtx): void {
  const tag = localName(el);
  if (isHidden(el)) return;
  ctx.registerIds(el);

  if (isNoteBodyEl(el) && !hasNestedNoteBody(el)) {
    harvestNote(el, ctx);
    return;
  }

  if (tag in HEADING_TAGS) {
    const walker = new InlineWalker(ctx);
    walker.walkChildren(el);
    const [text, marks] = walker.result();
    if (text) ctx.emit({ type: "heading", text, marks, level: HEADING_TAGS[tag], align: bctx.align });
    return;
  }

  if (tag === "p") {
    walkParagraph(el, ctx, bctx);
    return;
  }

  if (tag === "blockquote") {
    walkChildrenDom(el, ctx, { ...bctx, quote: true, align: explicitAlign(el) ?? bctx.align });
    return;
  }

  if (tag === "ul" || tag === "ol") {
    walkList(el, ctx, bctx);
    return;
  }

  if (tag === "table") {
    walkTable(el, ctx, bctx);
    return;
  }

  if (tag === "figure") {
    walkFigure(el, ctx, bctx);
    return;
  }

  if (tag === "pre") {
    emitCode(el, ctx);
    return;
  }

  if (tag === "hr") {
    ctx.emit({ type: "horizontalRule", text: "" });
    return;
  }

  if (tag === "dl") {
    emitDefinitionList(el, ctx);
    return;
  }

  if (tag === "svg") {
    emitSvgImage(el, ctx, bctx);
    return;
  }

  if (tag === "figcaption") return;

  if (isCaptionEl(el) && tag !== "section" && tag !== "article") {
    ctx.registerSubtreeIds(el);
    return;
  }

  const align = explicitAlign(el);
  const inner = withAlign(bctx, align);
  if (hasBlockChildren(el)) {
    walkChildrenDom(el, ctx, inner);
  } else {
    const img = soleImage(el);
    if (img) {
      emitImage(img, ctx, inner);
      return;
    }
    const walker = new InlineWalker(ctx);
    walker.walkChildren(el);
    const [text, marks] = walker.result();
    if (text) {
      ctx.emit({
        type: runType(inner),
        text,
        marks,
        align: inner.align,
        listLevel: inner.listLevel,
        listStyle: inner.listStyle,
        listStart: inner.listStart,
      });
    }
  }
}

function walkChildrenDom(el: Element, ctx: FileCtx, bctx: BlockCtx): void {
  let run: AnyNode[] = [];

  const flushRun = () => {
    if (!run.length) return;
    const nodes = run;
    run = [];
    emitInlineRun(nodes, ctx, bctx);
  };

  for (const child of el.children) {
    if (isTextNode(child)) {
      if (child.data.trim()) run.push(child);
      continue;
    }
    if (!isElementNode(child)) continue;
    const tag = localName(child);
    if (SKIP_TAGS.has(tag)) continue;
    if (BLOCK_TAGS.has(tag)) {
      flushRun();
      walkBlock(child, ctx, bctx);
    } else {
      run.push(child);
    }
  }
  flushRun();
}

function emitInlineRun(nodes: AnyNode[], ctx: FileCtx, bctx: BlockCtx): void {
  const elements = nodes.filter(isElementNode);
  const hasText = nodes.some(isTextNode);
  if (elements.length === 1 && !hasText && localName(elements[0]) === "img") {
    emitImage(elements[0], ctx, bctx);
    return;
  }
  const walker = new InlineWalker(ctx);
  for (const node of nodes) {
    if (isTextNode(node)) walker.appendText(node.data);
    else if (isElementNode(node)) walker.walk(node);
  }
  const [text, marks] = walker.result();
  if (text) {
    ctx.emit({
      type: runType(bctx),
      text,
      marks,
      align: bctx.align,
      listLevel: bctx.listLevel,
      listStyle: bctx.listStyle,
      listStart: bctx.listStart,
    });
  }
}

export function extractFile(data: ArrayBuffer | string, path: string, styles: StyleClasses = new StyleClasses()): FileContent {
  const root = parseDocument(data);
  const inlineCss = findAllByTagLocal(root, "style")
    .map((s) => cleanTextRaw(s))
    .filter(Boolean);
  const fileStyles = inlineCss.length ? styles.mergedWithInline(inlineCss) : styles;
  const out: FileContent = { path, passages: [], anchors: new Map(), notes: new Map() };
  const ctx = new FileCtx(path, paths.dirOf(path), fileStyles, out);
  const body = findFirstBody(root) ?? root;
  walkChildrenDom(body, ctx, { quote: false });
  ctx.flushTrailingIds();
  return out;
}

function findFirstBody(root: Element): Element | null {
  return findAllByTagLocal(root, "body")[0] ?? null;
}

function cleanTextRaw(el: Element): string {
  // <style> contents are raw text nodes, not markup — collapse without the
  // whitespace normalization cleanText applies (CSS needs its own chars).
  const parts: string[] = [];
  for (const child of el.children) if (isTextNode(child)) parts.push(child.data);
  return parts.join("");
}
