// container.xml + OPF package document: metadata, manifest, spine, guide,
// cover — ported 1:1 from ingestion-pipeline/src/ingestion/epubparser/package.py.
// Every href is normalized (see paths.ts) and every XML lookup is done by
// *local name*, so namespace-prefix games (`opf:`, `dc:`, or none at all)
// never break parsing.

import * as paths from "./paths";
import { attrLocal, children, directChildrenNamed, findAllByLocalName, localName, parseXml, cleanText } from "./dom";
import type { Element } from "./dom";
import type { ZipReader } from "./zip";

const OPF_MIME = "application/oebps-package+xml";
const CONTENT_MIMES = new Set(["application/xhtml+xml", "text/html"]);
const IMAGE_MIME = /^image\//;
const YEAR_RE = /\b(1[0-9]{3}|20[0-9]{2})\b/;
const PAGES_RE = /(\d+)\s*p(ages)?\b/i;

export interface ManifestItem {
  id: string;
  path: string;
  mediaType: string;
  properties: Set<string>;
}

export interface SpineRef {
  item: ManifestItem;
  linear: boolean;
}

export interface PackageDoc {
  opfDir: string;
  title: string;
  authors: string[];
  description: string;
  language: string;
  publishedYear: number | null;
  pageCountHint: number | null;
  manifest: Map<string, ManifestItem>;
  byPath: Map<string, ManifestItem>;
  spine: SpineRef[];
  guide: Map<string, string>;
  coverPath: string | null;
  navPath: string | null;
  ncxPath: string | null;
}

export function cssPaths(pkg: PackageDoc): string[] {
  return [...pkg.manifest.values()].filter((i) => i.mediaType === "text/css").map((i) => i.path);
}

/** Reading-order content documents: parseable media types, nav doc excluded,
 * linear="no" excluded unless asked for, duplicate spine refs collapsed. */
export function spineContent(pkg: PackageDoc, includeNonlinear = false): ManifestItem[] {
  const seen = new Set<string>();
  const result: ManifestItem[] = [];
  for (const ref of pkg.spine) {
    const item = ref.item;
    if (!ref.linear && !includeNonlinear) continue;
    if (!CONTENT_MIMES.has(item.mediaType)) continue;
    if (item.properties.has("nav")) continue;
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    result.push(item);
  }
  return result;
}

function attrText(el: Element, name: string): string | undefined {
  return attrLocal(el, name);
}

function textOf(el: Element): string {
  return cleanText(el);
}

function readContainer(container: string): string {
  const root = parseXml(container);
  const rootfiles = findAllByLocalName(root, "rootfile");
  const chosen = rootfiles.find((r) => (attrText(r, "media-type") ?? "") === OPF_MIME) ?? rootfiles[0] ?? null;
  const fullPath = chosen ? attrText(chosen, "full-path") : undefined;
  if (!fullPath) throw new Error("Not a valid EPUB: container.xml declares no OPF rootfile");
  return paths.normalize(fullPath);
}

function refinements(metadataEl: Element): Map<string, Map<string, string>> {
  const refined = new Map<string, Map<string, string>>();
  for (const meta of directChildrenNamed(metadataEl, "meta")) {
    const target = (attrText(meta, "refines") ?? "").replace(/^#/, "");
    const prop = attrText(meta, "property");
    if (target && prop) {
      if (!refined.has(target)) refined.set(target, new Map());
      refined.get(target)!.set(prop.trim(), textOf(meta));
    }
  }
  return refined;
}

function pickTitle(metadataEl: Element, refined: Map<string, Map<string, string>>): string {
  const titles = directChildrenNamed(metadataEl, "title");
  if (!titles.length) return "";
  for (const el of titles) {
    const id = attrText(el, "id");
    if (id && refined.get(id)?.get("title-type") === "main") return textOf(el);
  }
  return textOf(titles[0]);
}

function pickAuthors(metadataEl: Element, refined: Map<string, Map<string, string>>): string[] {
  type Creator = { seqKey: number | null; role: string; name: string };
  const creators: Creator[] = [];
  let anyRoleKnown = false;
  for (const el of directChildrenNamed(metadataEl, "creator")) {
    let role = (attrText(el, "role") ?? "").trim().toLowerCase();
    const id = attrText(el, "id");
    if (!role && id) role = (refined.get(id)?.get("role") ?? "").trim().toLowerCase();
    const seq = id ? refined.get(id)?.get("display-seq") : undefined;
    const seqKey = seq && /^-?\d+$/.test(seq) ? parseInt(seq, 10) : null;
    if (role) anyRoleKnown = true;
    creators.push({ seqKey, role, name: textOf(el) });
  }
  let filtered = creators;
  if (anyRoleKnown) {
    const onlyAuthors = creators.filter((c) => c.role === "aut" || c.role === "");
    filtered = onlyAuthors.length ? onlyAuthors : creators;
  }
  filtered = [...filtered].sort((a, b) => {
    const aNull = a.seqKey === null ? 1 : 0;
    const bNull = b.seqKey === null ? 1 : 0;
    if (aNull !== bNull) return aNull - bNull;
    return (a.seqKey ?? 0) - (b.seqKey ?? 0);
  });
  const seen = new Set<string>();
  const authors: string[] = [];
  for (const { name } of filtered) {
    if (name && !seen.has(name)) {
      seen.add(name);
      authors.push(name);
    }
  }
  return authors;
}

function pickYear(metadataEl: Element): number | null {
  const dates = directChildrenNamed(metadataEl, "date");
  const current = new Date().getFullYear();
  const preferred: number[] = [];
  const others: number[] = [];
  for (const el of dates) {
    const event = (attrText(el, "event") ?? "").trim().toLowerCase();
    const m = YEAR_RE.exec(textOf(el));
    if (!m) continue;
    const year = parseInt(m[0], 10);
    if (year > current + 1) continue;
    if (event === "original-publication" || event === "publication") preferred.push(year);
    else if (event === "modification" || event === "creation" || event === "conversion") continue;
    else others.push(year);
  }
  if (preferred.length) return Math.min(...preferred);
  return others.length ? Math.min(...others) : null;
}

function pickCover(metadataEl: Element | null, manifest: Map<string, ManifestItem>): string | null {
  for (const item of manifest.values()) {
    if (item.properties.has("cover-image")) return item.path;
  }
  if (metadataEl) {
    for (const meta of directChildrenNamed(metadataEl, "meta")) {
      if ((attrText(meta, "name") ?? "").trim().toLowerCase() === "cover") {
        const content = (attrText(meta, "content") ?? "").trim();
        const byId = manifest.get(content);
        if (byId) return byId.path;
        const byPath = [...manifest.values()].find((i) => i.path.endsWith(content));
        if (byPath) return byPath.path;
      }
    }
  }
  const images = [...manifest.values()].filter((i) => IMAGE_MIME.test(i.mediaType));
  for (const item of images) {
    const basename = item.path.split("/").pop() ?? "";
    if (item.id.toLowerCase() === "cover" || basename.toLowerCase().includes("cover")) return item.path;
  }
  return null;
}

export async function parsePackage(zip: ZipReader): Promise<PackageDoc> {
  const containerData = await zip.readText("META-INF/container.xml");
  if (containerData === null) throw new Error("Not a valid EPUB: missing META-INF/container.xml");
  const opfPath = readContainer(containerData);

  const opfData = await zip.readText(opfPath);
  if (opfData === null) throw new Error(`container.xml points at missing OPF: ${opfPath}`);
  const root = parseXml(opfData);
  const opfDir = paths.dirOf(opfPath);

  const manifest = new Map<string, ManifestItem>();
  const byPath = new Map<string, ManifestItem>();
  const manifestEl = findAllByLocalName(root, "manifest")[0] ?? null;
  for (const itemEl of manifestEl ? directChildrenNamed(manifestEl, "item") : []) {
    const itemId = attrText(itemEl, "id");
    const href = attrText(itemEl, "href");
    if (!itemId || !href || paths.isExternal(href)) continue;
    const [resolvedPath] = paths.resolveHref(opfDir, href);
    const item: ManifestItem = {
      id: itemId,
      path: resolvedPath ?? "",
      mediaType: (attrText(itemEl, "media-type") ?? "").trim(),
      properties: new Set((attrText(itemEl, "properties") ?? "").toLowerCase().split(/\s+/).filter(Boolean)),
    };
    manifest.set(itemId, item);
    if (!byPath.has(item.path)) byPath.set(item.path, item);
  }

  const spine: SpineRef[] = [];
  let ncxId: string | undefined;
  const spineEl = findAllByLocalName(root, "spine")[0] ?? null;
  if (spineEl) {
    ncxId = attrText(spineEl, "toc");
    for (const itemref of directChildrenNamed(spineEl, "itemref")) {
      const item = manifest.get(attrText(itemref, "idref") ?? "");
      if (item) spine.push({ item, linear: (attrText(itemref, "linear") ?? "").toLowerCase() !== "no" });
    }
  }

  const guide = new Map<string, string>();
  const guideEl = findAllByLocalName(root, "guide")[0] ?? null;
  for (const ref of guideEl ? directChildrenNamed(guideEl, "reference") : []) {
    const href = attrText(ref, "href");
    const refType = attrText(ref, "type");
    if (!href || !refType || paths.isExternal(href)) continue;
    const [resolvedPath] = paths.resolveHref(opfDir, href);
    if (resolvedPath && !guide.has(resolvedPath)) guide.set(resolvedPath, refType.trim());
  }

  const metadataEl = findAllByLocalName(root, "metadata")[0] ?? null;
  let title = "";
  let authors: string[] = [];
  let description = "";
  let language = "";
  let year: number | null = null;
  let pages: number | null = null;
  let coverPath: string | null;
  if (metadataEl === null) {
    coverPath = pickCover(null, manifest);
  } else {
    const refined = refinements(metadataEl);
    title = pickTitle(metadataEl, refined);
    authors = pickAuthors(metadataEl, refined);
    const descriptions = directChildrenNamed(metadataEl, "description");
    description = descriptions.length ? textOf(descriptions[0]) : "";
    const languages = directChildrenNamed(metadataEl, "language");
    language = languages.length ? textOf(languages[0]) : "";
    year = pickYear(metadataEl);
    for (const el of directChildrenNamed(metadataEl, "format")) {
      const m = PAGES_RE.exec(textOf(el));
      if (m) {
        pages = parseInt(m[1], 10);
        break;
      }
    }
    coverPath = pickCover(metadataEl, manifest);
  }

  const navPath = [...manifest.values()].find((i) => i.properties.has("nav"))?.path ?? null;
  let ncxPath: string | null = null;
  if (ncxId && manifest.has(ncxId)) ncxPath = manifest.get(ncxId)!.path;
  if (ncxPath === null) {
    ncxPath = [...manifest.values()].find((i) => i.mediaType === "application/x-dtbncx+xml")?.path ?? null;
  }

  return {
    opfDir,
    title,
    authors,
    description,
    language,
    publishedYear: year,
    pageCountHint: pages,
    manifest,
    byPath,
    spine,
    guide,
    coverPath,
    navPath,
    ncxPath,
  };
}

export function contentMimes(): Set<string> {
  return CONTENT_MIMES;
}

export { localName, children };
