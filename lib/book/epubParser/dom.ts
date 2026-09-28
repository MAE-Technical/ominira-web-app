// HTML5/XML parsing front door — ported from
// ingestion-pipeline/src/ingestion/epubparser/_dom.py, adapted to cheerio.
//
// Content documents and nav documents are parsed in cheerio's default HTML
// mode, which uses parse5 (the WHATWG HTML5 tree-construction algorithm) —
// the closest browser-grade recovery available in JS, matching the Python
// pipeline's use of html5lib. Package/container/NCX documents are parsed
// with cheerio's xmlMode (htmlparser2), which correctly handles XML
// self-closing tags and arbitrary namespace-prefixed element/attribute
// names without needing to belong to the HTML vocabulary.
//
// cheerio/domhandler already interleaves text and element nodes as ordered
// children, unlike lxml.etree's text/tail split — so callers here can just
// walk `el.children` in document order.

import * as cheerio from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";

export type { AnyNode, Element };

export function isElementNode(node: AnyNode | null | undefined): node is Element {
  return !!node && node.type === "tag";
}

export function isTextNode(node: AnyNode | null | undefined): node is Text {
  return !!node && node.type === "text";
}

/** Local tag name — strips an XML namespace prefix ("opf:item" -> "item"),
 * matching etree.QName(el).localname. Tag names from cheerio are already
 * lowercase in HTML mode; xmlMode preserves source case. */
export function localName(el: Element): string {
  const name = el.name;
  const idx = name.indexOf(":");
  return (idx === -1 ? name : name.slice(idx + 1)).toLowerCase();
}

/** Attribute lookup by local name — matches `role`, `opf:role`, and a
 * literal namespaced key alike, mirroring package.py's `_attr()` (which
 * matched lxml's Clark-notation `{uri}name` suffix; cheerio keeps the
 * source prefix literally instead of expanding it, so the suffix check
 * here is `:name` rather than `}name`). */
export function attrLocal(el: Element, name: string): string | undefined {
  if (el.attribs[name] !== undefined) return el.attribs[name];
  for (const [key, value] of Object.entries(el.attribs)) {
    if (key === name || key.endsWith(":" + name)) return value;
  }
  return undefined;
}

export function attr(el: Element, name: string): string | undefined {
  return el.attribs[name];
}

export function children(el: Element): Element[] {
  return el.children.filter(isElementNode);
}

export function directChildrenNamed(el: Element, name: string): Element[] {
  return children(el).filter((c) => localName(c) === name);
}

export function findAllByLocalName(root: Element, name: string): Element[] {
  const out: Element[] = [];
  const visit = (el: Element) => {
    if (localName(el) === name) out.push(el);
    for (const child of children(el)) visit(child);
  };
  for (const child of children(root)) visit(child);
  return out;
}

export function findFirstByTag(root: Element, tag: string): Element | null {
  if (root.name.toLowerCase() === tag) return root;
  for (const child of children(root)) {
    const found = findFirstByTag(child, tag);
    if (found) return found;
  }
  return null;
}

export function findAllByTag(root: Element, tag: string): Element[] {
  const out: Element[] = [];
  const visit = (el: Element) => {
    if (el.name.toLowerCase() === tag) out.push(el);
    for (const child of children(el)) visit(child);
  };
  visit(root);
  return out;
}

/** Whitespace-collapsed text content of an element and all descendants. */
export function cleanText(el: Element): string {
  const parts: string[] = [];
  const visit = (node: AnyNode) => {
    if (isTextNode(node)) parts.push(node.data);
    else if (isElementNode(node)) for (const child of node.children) visit(child);
  };
  for (const child of el.children) visit(child);
  return parts.join("").split(/\s+/).filter(Boolean).join(" ");
}

const XML_DECL_ENCODING = /<\?xml[^>]*encoding=["']([A-Za-z0-9_.-]+)/;
const META_CHARSET = /<meta[^>]+charset=["']?\s*([A-Za-z0-9_.-]+)/i;

/** Decodes an EPUB content-document buffer per the OCF spec (UTF-8 unless
 * self-declared) — avoids the curly-quote mojibake that a default
 * windows-1252 fallback would produce on undeclared legacy encodings. */
export function decodeHtml(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    return new TextDecoder("utf-16").decode(bytes);
  }
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
  const match = XML_DECL_ENCODING.exec(head) ?? META_CHARSET.exec(head);
  const codec = match ? match[1].toLowerCase() : "utf-8";
  try {
    return new TextDecoder(codec as never).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Parses a content or nav document with parse5's WHATWG HTML5 algorithm
 * (foster-parenting, misnesting repair) — the JS-ecosystem match for
 * html5lib. Returns the root <html> element. */
export function parseDocument(data: ArrayBuffer | string): Element {
  const text = typeof data === "string" ? data : decodeHtml(data);
  const $ = cheerio.load(text);
  return $.root().children("html").get(0) as Element;
}

/** Parses a strict XML document (container.xml, OPF, NCX) leniently via
 * htmlparser2's XML mode — correct self-closing tags and namespace-prefixed
 * names without the HTML vocabulary or tree-repair rules. */
export function parseXml(data: ArrayBuffer | string): Element {
  const text = typeof data === "string" ? data : decodeHtml(data);
  const $ = cheerio.load(text, { xmlMode: true });
  const root = $.root().children().get(0) as Element | undefined;
  if (!root) throw new Error("Unparseable XML document");
  return root;
}

export function bodyOf(root: Element): Element {
  return findFirstByTag(root, "body") ?? root;
}
