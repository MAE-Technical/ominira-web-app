// Assembles parsed files into a BookDocument — ported 1:1 from
// ingestion-pipeline/src/ingestion/epubparser/document.py.
//
// The core fix over a naive approach: each spine file is parsed **exactly
// once**, and TOC entries claim non-overlapping *slices* of its passages via
// their fragment anchors — sub-heading entries split the file instead of
// re-extracting it. Slice boundaries: an entry claims from its anchor's
// passage to the next TOC anchor in the same file; the file's first entry
// always starts at 0 so lead-in content is never lost; duplicate targets
// yield titled, passage-less nav sections rather than ghosts or copies.

import { collectStyles, StyleClasses } from "./css";
import { extractFile } from "./content";
import type { FileContent, Mark, Passage, Table, TableCell } from "./content";
import { resolveNotes } from "./notes";
import type { Note } from "./notes";
import { parsePackage, spineContent, cssPaths, contentMimes } from "./package";
import type { PackageDoc } from "./package";
import { parseToc, parseKinds, classifyKind } from "./toc";
import type { TocEntry } from "./toc";
import { ZipReader } from "./zip";
import { parseBookDocument } from "../schema";
import type { BookDocument } from "../schema";

const COMBINING = /[̀-ͯ]/g;
const NON_ALNUM = /[^a-z0-9]+/g;

export function slugify(text: string): string {
  const normalized = text.normalize("NFKD");
  const stripped = normalized.replace(COMBINING, "").toLowerCase();
  return stripped.replace(NON_ALNUM, "-").replace(/^-+|-+$/g, "");
}

class Section {
  id: string;
  title: string | null;
  kind: "front" | "body" | "back" | "unknown";
  path: string | null;
  start: number;
  end: number;
  children: Section[] = [];

  constructor(id: string, title: string | null, kind: Section["kind"], path: string | null = null, start = 0, end = 0) {
    this.id = id;
    this.title = title;
    this.kind = kind;
    this.path = path;
    this.start = start;
    this.end = end;
  }

  passages(files: Map<string, FileContent>): Passage[] {
    if (this.path === null || this.end <= this.start) return [];
    return files.get(this.path)!.passages.slice(this.start, this.end);
  }
}

export interface ParsedBook {
  book: BookDocument;
  imagePaths: string[];
  coverPath: string | null;
}

class Assembler {
  zip: ZipReader;
  pkg: PackageDoc;
  files = new Map<string, FileContent>();
  fileOrder = new Map<string, number>();
  private counter = 0;

  constructor(zip: ZipReader, pkg: PackageDoc) {
    this.zip = zip;
    this.pkg = pkg;
  }

  nextId(): string {
    this.counter += 1;
    return `sec-${this.counter}`;
  }

  async extract(styles: StyleClasses, tocPaths: Set<string>): Promise<void> {
    const linearPaths = spineContent(this.pkg).map((i) => i.path);
    const paths_ = [...linearPaths];
    for (const item of spineContent(this.pkg, true)) {
      if (!paths_.includes(item.path) && tocPaths.has(item.path)) paths_.push(item.path);
    }
    for (const path of tocPaths) {
      const item = this.pkg.byPath.get(path);
      if (item && contentMimes().has(item.mediaType) && !paths_.includes(path)) paths_.push(path);
    }
    for (const path of paths_) {
      const data = await this.zip.readArrayBuffer(path);
      if (data === null) continue;
      this.fileOrder.set(path, this.fileOrder.size);
      this.files.set(path, extractFile(data, path, styles));
    }
    const targets = new Set<string>();
    for (const content of this.files.values()) {
      for (const passage of content.passages) {
        for (const [, marks] of markHolders(passage)) {
          for (const mark of marks) {
            for (const target of [mark.noteTarget, mark.linkTarget]) {
              if (target && !this.files.has(target[0])) targets.add(target[0]);
            }
          }
        }
      }
    }
    for (const path of targets) {
      const item = this.pkg.byPath.get(path);
      if (!item || !contentMimes().has(item.mediaType)) continue;
      const data = await this.zip.readArrayBuffer(path);
      if (data === null) continue;
      if (!this.fileOrder.has(path)) this.fileOrder.set(path, this.fileOrder.size);
      this.files.set(path, extractFile(data, path, styles));
    }
  }
}

function* markHolders(passage: Passage): Generator<[string, Mark[]]> {
  yield [passage.text, passage.marks ?? (passage.marks = [])];
  if (passage.table) {
    for (const group of ["header", "rows", "footer"] as const) {
      for (const row of passage.table[group] ?? []) {
        for (const cell of row) {
          if (cell.marks) yield [cell.text, cell.marks];
        }
      }
    }
  }
}

/** A spine file that no TOC entry ever addresses is usually not a distinct
 * page at all: a chapter silently split into several physical files at
 * internal page breaks, only the first keeping a nav entry. Fold such an
 * orphan into whichever claimed file precedes it in reading order. An
 * orphan the guide/landmarks *do* classify keeps its own section. */
function mergeOrphanContinuations(assembler: Assembler, claimedPaths: Set<string>, kinds: Map<string, string>): void {
  let ownerPath: string | null = null;
  for (const path of [...assembler.fileOrder.keys()]) {
    if (claimedPaths.has(path)) {
      ownerPath = path;
      continue;
    }
    if (ownerPath === null || classifyKind(kinds.get(path)) !== "unknown") continue;
    const owner = assembler.files.get(ownerPath)!;
    const orphan = assembler.files.get(path)!;
    assembler.files.delete(path);
    assembler.fileOrder.delete(path);
    const offset = owner.passages.length;
    owner.passages.push(...orphan.passages);
    for (const [anchorId, idx] of orphan.anchors) {
      if (!owner.anchors.has(anchorId)) owner.anchors.set(anchorId, idx + offset);
    }
    for (const [noteId, text] of orphan.notes) {
      if (!owner.notes.has(noteId)) owner.notes.set(noteId, text);
    }
    retargetPath(assembler.files.values(), path, ownerPath);
  }
}

function retargetPath(contents: IterableIterator<FileContent>, oldPath: string, newPath: string): void {
  for (const content of contents) {
    for (const passage of content.passages) {
      for (const [, marks] of markHolders(passage)) {
        for (const mark of marks) {
          if (mark.noteTarget && mark.noteTarget[0] === oldPath) mark.noteTarget = [newPath, mark.noteTarget[1]];
          if (mark.linkTarget && mark.linkTarget[0] === oldPath) mark.linkTarget = [newPath, mark.linkTarget[1]];
        }
      }
    }
  }
}

/** Books without any note-body markup still cite notes via sup-wrapped
 * links; the bodies are plain paragraphs at a file's end. When a note-kind
 * mark targets an anchor that wasn't harvested, and the anchored passage's
 * text begins with the citing marker, that passage IS the note body:
 * harvest it and remove it from the reading flow. Runs before slicing —
 * removals remap every anchor index. */
function harvestReferencedNotes(files: Map<string, FileContent>): void {
  const candidates = new Map<string, Map<string, string>>();
  for (const content of files.values()) {
    for (const passage of content.passages) {
      for (const [text, marks] of markHolders(passage)) {
        for (const mark of marks) {
          if (mark.kind !== "note" || !mark.noteTarget) continue;
          const [path, fragment] = mark.noteTarget;
          const targetFile = files.get(path);
          if (!targetFile || !fragment || targetFile.notes.has(fragment)) continue;
          const marker = text.slice(mark.start, mark.end).trim();
          if (marker) {
            if (!candidates.has(path)) candidates.set(path, new Map());
            const forPath = candidates.get(path)!;
            if (!forPath.has(fragment)) forPath.set(fragment, marker);
          }
        }
      }
    }
  }

  for (const [path, fragments] of candidates) {
    const content = files.get(path)!;
    const remove = new Set<number>();
    for (const [fragment, marker] of fragments) {
      const index = content.anchors.get(fragment);
      if (index === undefined || index >= content.passages.length || remove.has(index)) continue;
      const body = content.passages[index];
      if (body.type !== "paragraph" && body.type !== "blockquote" && body.type !== "listItem") continue;
      const norm = marker.replace(/^[[(.:\]]+|[[(.:\]]+$/g, "").toLowerCase();
      if (!norm || !body.text.toLowerCase().startsWith(norm)) continue;
      const rest = body.text.slice(norm.length);
      if (/^\d/.test(rest)) continue; // citing "1" must not claim "12 ..."
      content.notes.set(fragment, body.text);
      remove.add(index);
    }
    if (remove.size) removePassages(content, remove);
  }
}

function removePassages(content: FileContent, remove: Set<number>): void {
  const removedSorted = [...remove].sort((a, b) => a - b);
  content.passages = content.passages.filter((_, i) => !remove.has(i));
  const shift = (index: number): number => {
    let count = 0;
    for (const r of removedSorted) if (r <= index - 1) count++;
    return index - count;
  };
  const shifted = new Map<string, number>();
  for (const [anchorId, idx] of content.anchors) shifted.set(anchorId, shift(idx));
  content.anchors = shifted;
}

function collectPaths(entries: TocEntry[]): Set<string> {
  const out = new Set<string>();
  const visit = (list: TocEntry[]) => {
    for (const e of list) {
      if (e.path) out.add(e.path);
      visit(e.children);
    }
  };
  visit(entries);
  return out;
}

function anchorPath(entry: TocEntry): string | null {
  if (entry.path) return entry.path;
  for (const child of entry.children) {
    const found = anchorPath(child);
    if (found) return found;
  }
  return null;
}

/** entry identity -> (start, end) slice of its file's passages. Entries are
 * visited in TOC order; per file, claims are sorted by anchor position, the
 * first claim is extended to the top of the file, and later claims at the
 * same position get empty slices (first one wins the content). */
function computeSlices(entries: TocEntry[], files: Map<string, FileContent>): Map<TocEntry, [number, number]> {
  const claimsByFile = new Map<string, [number, TocEntry][]>();

  const visit = (list: TocEntry[]) => {
    for (const entry of list) {
      if (entry.path && files.has(entry.path)) {
        const content = files.get(entry.path)!;
        const start = entry.fragment ? content.anchors.get(entry.fragment) ?? content.passages.length : 0;
        if (!claimsByFile.has(entry.path)) claimsByFile.set(entry.path, []);
        claimsByFile.get(entry.path)!.push([start, entry]);
      }
      visit(entry.children);
    }
  };
  visit(entries);

  const slices = new Map<TocEntry, [number, number]>();
  for (const [path, claims] of claimsByFile) {
    const total = files.get(path)!.passages.length;
    claims.sort((a, b) => a[0] - b[0]);
    const starts = claims.map((c) => c[0]);
    const taken = new Set<number>();
    for (let i = 0; i < claims.length; i++) {
      const [start, entry] = claims[i];
      if (taken.has(start)) {
        slices.set(entry, [start, start]);
        continue;
      }
      taken.add(start);
      const hasOtherTaken = [...taken].some((t) => t !== start);
      const effectiveStart = hasOtherTaken ? start : 0;
      const nextStart = starts.slice(i + 1).find((s) => s > start) ?? total;
      slices.set(entry, [effectiveStart, nextStart]);
    }
  }
  return slices;
}

function buildSections(
  assembler: Assembler,
  entries: TocEntry[],
  slices: Map<TocEntry, [number, number]>,
  kinds: Map<string, string>
): Section[] {
  const sections: Section[] = [];
  for (const entry of entries) {
    const [start, end] = slices.get(entry) ?? [0, 0];
    const section = new Section(
      assembler.nextId(),
      entry.title,
      entry.path ? classifyKind(kinds.get(entry.path)) : "unknown",
      entry.path && assembler.files.has(entry.path) ? entry.path : null,
      start,
      end
    );
    section.children = buildSections(assembler, entry.children, slices, kinds);
    sections.push(section);
  }
  return sections;
}

/** Drops sections that carry nothing at all — no title, no passages, no
 * surviving children. A *titled* empty section survives: it is a
 * legitimate nav label. */
function pruneEmpty(sections: Section[]): Section[] {
  const kept: Section[] = [];
  for (const s of sections) {
    s.children = pruneEmpty(s.children);
    if (s.title || s.children.length || s.end > s.start) kept.push(s);
  }
  return kept;
}

function flatten(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    out.push(s);
    out.push(...flatten(s.children));
  }
  return out;
}

function markToJson(m: Mark): Record<string, unknown> {
  const d: Record<string, unknown> = { start: m.start, end: m.end, kind: m.kind };
  if (m.kind === "note" && m.noteId) d.noteId = m.noteId;
  if (m.kind === "link") {
    if (m.href) d.href = m.href;
    if (m.internal) d.internal = true;
    if (m.sectionId) d.sectionId = m.sectionId;
    if (m.fragmentId) d.fragmentId = m.fragmentId;
  }
  return d;
}

function cellToJson(cell: TableCell): Record<string, unknown> {
  const d: Record<string, unknown> = { text: cell.text };
  if (cell.align) d.align = cell.align;
  if (cell.rowspan) d.rowspan = cell.rowspan;
  if (cell.colspan) d.colspan = cell.colspan;
  if (cell.marks?.length) d.marks = cell.marks.map(markToJson);
  return d;
}

function tableToJson(table: Table): Record<string, unknown> {
  const d: Record<string, unknown> = { rows: table.rows.map((row) => row.map(cellToJson)) };
  if (table.caption) d.caption = table.caption;
  for (const group of ["header", "footer"] as const) {
    if (table[group]?.length) d[group] = table[group]!.map((row) => row.map(cellToJson));
  }
  return d;
}

function passageToJson(p: Passage, passageId: string, index: number): Record<string, unknown> {
  const d: Record<string, unknown> = { id: passageId, index, type: p.type, text: p.text };
  if (p.level) d.level = p.level;
  if (p.marks?.length) d.marks = p.marks.map(markToJson);
  if (p.type === "image") {
    if (p.src) d.src = p.src;
    if (p.caption) d.caption = p.caption;
  }
  if (p.align) d.align = p.align;
  if (p.listLevel) d.listLevel = p.listLevel;
  if (p.listStyle) d.listStyle = p.listStyle;
  if (p.listStart) d.listStart = p.listStart;
  if (p.language) d.language = p.language;
  if (p.table) d.table = tableToJson(p.table);
  if (p.definitions?.length) d.definitions = p.definitions;
  return d;
}

function sectionToJson(s: Section, files: Map<string, FileContent>): Record<string, unknown> {
  const d: Record<string, unknown> = {
    id: s.id,
    kind: s.kind,
    passages: s.passages(files).map((p, j) => passageToJson(p, `${s.id}-p${j}`, j)),
    children: s.children.map((c) => sectionToJson(c, files)),
  };
  if (s.title) d.title = s.title;
  return d;
}

/** Ensure the guide/landmark-designated cover page shows the OPF-declared
 * cover asset even when its markup uses a CSS/JS proxy no parser can see.
 * Rewrites an existing image passage in place; when the cover page has no
 * image at all, returns the section id so the serialized document can have
 * one prepended. */
function attachCover(contentSections: Section[], files: Map<string, FileContent>, kinds: Map<string, string>, coverPath: string): string | null {
  let coverSections = contentSections.filter((s) => s.path && (kinds.get(s.path) ?? "").toLowerCase().includes("cover"));
  if (!coverSections.length) coverSections = contentSections.filter((s) => s.kind === "front").slice(0, 1);
  if (!coverSections.length) return null;
  const section = coverSections[0];
  const passages = section.passages(files);
  const image = passages.find((p) => p.type === "image");
  if (image) {
    image.src = coverPath;
    return null;
  }
  return section.id;
}

function prependCoverPassage(sections: Record<string, unknown>[], sectionId: string, coverPath: string): void {
  for (const s of sections) {
    if (s.id === sectionId) {
      const passages = s.passages as Record<string, unknown>[];
      passages.unshift({ type: "image", text: "", src: coverPath });
      passages.forEach((p, j) => {
        p.id = `${sectionId}-p${j}`;
        p.index = j;
      });
      return;
    }
    prependCoverPassage(s.children as Record<string, unknown>[], sectionId, coverPath);
  }
}

function resolveInternalLinks(contentSections: Section[], files: Map<string, FileContent>): void {
  const byFile = new Map<string, Section[]>();
  for (const s of contentSections) {
    if (!s.path) continue;
    if (!byFile.has(s.path)) byFile.set(s.path, []);
    byFile.get(s.path)!.push(s);
  }
  for (const sections of byFile.values()) sections.sort((a, b) => a.start - b.start);

  const owner = (path: string, fragment: string | null): [string | null, string | null] => {
    const sections = byFile.get(path);
    if (!sections) return [null, fragment];
    const content = files.get(path)!;
    const index = fragment ? content.anchors.get(fragment) ?? 0 : 0;
    let chosen = sections[0];
    for (const s of sections) {
      if (s.start <= index) chosen = s;
      else break;
    }
    return [chosen.id, fragment];
  };

  for (const section of contentSections) {
    for (const passage of section.passages(files)) {
      for (const [, marks] of markHolders(passage)) {
        for (const mark of marks) {
          if (mark.kind !== "link" || !mark.linkTarget) continue;
          const [path, fragment] = mark.linkTarget;
          const [sectionId, resolvedFragment] = owner(path, fragment);
          mark.internal = true;
          mark.fragmentId = resolvedFragment ?? undefined;
          if (sectionId) {
            mark.sectionId = sectionId;
            mark.href = undefined;
          } else {
            mark.href = resolvedFragment ? `${path}#${resolvedFragment}` : path;
          }
        }
      }
    }
  }
}

function checkInvariants(book: Record<string, unknown>): void {
  const walk = function* (sections: Record<string, unknown>[]): Generator<Record<string, unknown>> {
    for (const s of sections) {
      yield s;
      yield* walk(s.children as Record<string, unknown>[]);
    }
  };
  const contentIds = [...walk(book.sections as Record<string, unknown>[])]
    .filter((s) => (s.passages as unknown[]).length)
    .map((s) => s.id as string);
  const spine = book.spine as string[];
  if ([...spine].sort().join() !== [...contentIds].sort().join()) {
    throw new Error(`spine/sections mismatch: ${spine.length} spine ids vs ${contentIds.length} content sections`);
  }
  const noteIds = new Set((book.notes as { id: string }[]).map((n) => n.id));
  for (const s of walk(book.sections as Record<string, unknown>[])) {
    for (const p of s.passages as Record<string, unknown>[]) {
      for (const [holderText, marks] of dictMarkHolders(p)) {
        for (const m of marks) {
          const mm = m as { start: number; end: number; kind: string; noteId?: string };
          if (!(0 <= mm.start && mm.start <= mm.end && mm.end <= holderText.length)) {
            throw new Error(`mark out of bounds in passage ${p.id}`);
          }
          if (mm.kind === "note" && !noteIds.has(mm.noteId ?? "")) {
            throw new Error(`unresolved note mark in passage ${p.id}`);
          }
        }
      }
    }
  }
}

function* dictMarkHolders(p: Record<string, unknown>): Generator<[string, Record<string, unknown>[]]> {
  yield [p.text as string, (p.marks as Record<string, unknown>[] | undefined) ?? []];
  const table = p.table as Record<string, unknown> | undefined;
  if (table) {
    for (const group of ["header", "rows", "footer"]) {
      for (const row of (table[group] as Record<string, unknown>[][] | undefined) ?? []) {
        for (const cell of row) {
          yield [cell.text as string, (cell.marks as Record<string, unknown>[] | undefined) ?? []];
        }
      }
    }
  }
}

export interface ParseEpubOptions {
  /** Filename or user-chosen slug hint — used only to derive `slug` when the OPF has no usable title. */
  slugHint?: string;
}

export async function parseEpub(data: ArrayBuffer | Blob | Uint8Array, options: ParseEpubOptions = {}): Promise<ParsedBook> {
  const zip = await ZipReader.open(data);
  const pkg = await parsePackage(zip);
  const tocEntries = await parseToc(zip, pkg);
  const kinds = await parseKinds(zip, pkg);
  const styles = await collectStyles((path) => zip.readText(path), cssPaths(pkg));

  const slugSource = pkg.title || options.slugHint || "";
  const bookSlug = slugify(slugSource);
  if (!bookSlug) throw new Error("Could not derive a slug — the EPUB has no title and no filename hint was given.");

  const assembler = new Assembler(zip, pkg);
  const claimedPaths = collectPaths(tocEntries);
  await assembler.extract(styles, claimedPaths);
  if (!assembler.files.size) throw new Error("No readable content documents found in this EPUB.");

  mergeOrphanContinuations(assembler, claimedPaths, kinds);
  harvestReferencedNotes(assembler.files);
  const slices = computeSlices(tocEntries, assembler.files);

  const topByAnchor = new Map<string, TocEntry[]>();
  for (const entry of tocEntries) {
    const anchor = anchorPath(entry);
    if (anchor) {
      if (!topByAnchor.has(anchor)) topByAnchor.set(anchor, []);
      topByAnchor.get(anchor)!.push(entry);
    }
  }

  let sections: Section[] = [];
  for (const path of assembler.fileOrder.keys()) {
    if (topByAnchor.has(path)) {
      sections.push(...buildSections(assembler, topByAnchor.get(path)!, slices, kinds));
      topByAnchor.delete(path);
    } else if (claimedPaths.has(path)) {
      continue;
    } else {
      const content = assembler.files.get(path)!;
      sections.push(new Section(assembler.nextId(), null, classifyKind(kinds.get(path)), path, 0, content.passages.length));
    }
  }
  for (const leftovers of topByAnchor.values()) {
    sections.push(...buildSections(assembler, leftovers, slices, kinds));
  }

  sections = pruneEmpty(sections);
  const allSections = flatten(sections);
  let contentSections = allSections.filter((s) => s.path && s.end > s.start);
  if (!contentSections.length) throw new Error("No sections with text content were found in this EPUB.");

  contentSections = [...contentSections].sort((a, b) => {
    const orderA = assembler.fileOrder.get(a.path!) ?? 1 << 30;
    const orderB = assembler.fileOrder.get(b.path!) ?? 1 << 30;
    return orderA - orderB || a.start - b.start;
  });

  let coverInsertSection: string | null = null;
  if (pkg.coverPath) {
    coverInsertSection = attachCover(contentSections, assembler.files, kinds, pkg.coverPath);
  }
  const notes: Note[] = resolveNotes(
    contentSections.map((s) => [s.id, s.passages(assembler.files)] as [string, Passage[]]),
    assembler.files
  );
  resolveInternalLinks(contentSections, assembler.files);

  const imagePaths: string[] = [];
  for (const s of contentSections) {
    for (const p of s.passages(assembler.files)) {
      if (p.type === "image" && p.src && !imagePaths.includes(p.src)) imagePaths.push(p.src);
    }
  }

  let totalWords = 0;
  for (const s of contentSections) {
    for (const p of s.passages(assembler.files)) totalWords += p.text.split(/\s+/).filter(Boolean).length;
  }
  const pageCount = pkg.pageCountHint || Math.max(1, Math.round(totalWords / 250));

  const book: Record<string, unknown> = {
    schemaVersion: 4,
    id: bookSlug,
    slug: bookSlug,
    metadata: {
      title: pkg.title || bookSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      author: pkg.authors.join(", "),
      description: pkg.description,
      cover: pkg.coverPath || "",
      language: pkg.language,
      pageCountEstimate: pageCount,
      ...(pkg.publishedYear ? { publishedYear: pkg.publishedYear } : {}),
    },
    narrators: [],
    sections: sections.map((s) => sectionToJson(s, assembler.files)),
    spine: contentSections.map((s) => s.id),
    notes: notes.map((n) => ({ id: n.id, sectionId: n.sectionId, marker: n.marker, text: n.text })),
  };

  if (coverInsertSection && pkg.coverPath) {
    prependCoverPassage(book.sections as Record<string, unknown>[], coverInsertSection, pkg.coverPath);
  }

  checkInvariants(book);
  const result = parseBookDocument(book);
  if (!result.ok) {
    throw new Error(`Parsed EPUB failed schema validation: ${result.error.message}`);
  }

  return { book: result.data, imagePaths, coverPath: pkg.coverPath };
}
