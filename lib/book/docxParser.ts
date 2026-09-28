// DOCX -> metadata-only extraction, same shape as pdfParser.ts. No
// structured content extraction, no BookDocument — a reader-uploaded DOCX
// is stored as a plain source file (viewer to come later, same as PDF
// today), not parsed into the reader's chapter/passage model.
//
// Unlike EPUB, DOCX has no manifest/spine telling a parser where chapters
// start — inferring one would mean guessing from heading styles, which
// isn't reliable enough to build on yet (see reader-uploads-spec.md's EPUB
// vs. PDF split). So this only pulls what core.xml's document properties
// reliably carry: title and author, if the file has them set at all — most
// don't. No cover either: DOCX has no manifest-declared cover image the
// way EPUB does, so there's nothing here for HomeComposer's file preview
// to show a thumbnail for.
import { ZipReader } from "./epubParser/zip";

export interface DocxMetadata {
  title: string | null;
  author: string | null;
}

function firstTagText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  const text = match?.[1]?.trim();
  return text ? text : null;
}

export async function parseDocx(data: ArrayBuffer | Uint8Array): Promise<DocxMetadata> {
  const zip = await ZipReader.open(data);
  const coreXml = await zip.readText("docProps/core.xml");
  if (!coreXml) return { title: null, author: null };
  return {
    title: firstTagText(coreXml, "dc:title"),
    author: firstTagText(coreXml, "dc:creator"),
  };
}
