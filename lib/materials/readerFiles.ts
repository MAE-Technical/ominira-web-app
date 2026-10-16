import type { BookDocument, Passage, Section } from "@/lib/book/schema";

/** What the reader downloads from the CDN, beside a book's JSON in its
 * version folder (books/<slug>/v<n>/):
 *   reader.json  the document with its prose blanked (every section's
 *                structure stays real: ids, passage counts and types,
 *                audio), plus which sections each chunk holds
 *   s/<i>.json   chunk i: the full passages of a run of sections in spine
 *                order, about CHUNK_BYTES each
 * The reader fetches reader.json, then the chunk it opens on, then the rest. */
export type ReaderBook = BookDocument & { chunks: string[][] };
export type ReaderChunk = Record<string, Passage[]>;

const CHUNK_BYTES = 256 * 1024;

/** The version folder's CDN-relative base for a material's JSON key. */
export const contentFolder = (jsonKey: string) => jsonKey.replace(/book\.json$/, "");

function stripProse(sections: Section[]): Section[] {
  return sections.map((s) => ({
    ...s,
    children: stripProse(s.children),
    // An image's `text` is short alt copy; it stays.
    passages: s.passages.map((p) => (p.type === "image" ? p : ({ ...p, text: "", marks: undefined } as Passage))),
  }));
}

/** reader.json and its chunks for `book`, as key -> JSON text under `folder`
 * (the version folder, ending in "/"). */
export function readerObjects(book: BookDocument, folder: string): { key: string; body: string }[] {
  // Spine order first, so a chunk holds sections read one after another;
  // then any section with passages the spine leaves out.
  const ordered: Section[] = [];
  const byId = new Map<string, Section>();
  const walk = (sections: Section[]) => {
    for (const s of sections) {
      byId.set(s.id, s);
      walk(s.children);
    }
  };
  walk(book.sections);
  const seen = new Set<string>();
  for (const id of [...book.spine, ...byId.keys()]) {
    const section = byId.get(id);
    if (!section || seen.has(id) || section.passages.length === 0) continue;
    seen.add(id);
    ordered.push(section);
  }

  const chunks: ReaderChunk[] = [];
  const ids: string[][] = [];
  let size = 0;
  for (const section of ordered) {
    const bytes = JSON.stringify(section.passages).length;
    if (chunks.length === 0 || (size > 0 && size + bytes > CHUNK_BYTES)) {
      chunks.push({});
      ids.push([]);
      size = 0;
    }
    chunks[chunks.length - 1][section.id] = section.passages;
    ids[ids.length - 1].push(section.id);
    size += bytes;
  }

  const reader: ReaderBook = { ...book, sections: stripProse(book.sections), chunks: ids };
  return [
    { key: `${folder}reader.json`, body: JSON.stringify(reader) },
    ...chunks.map((chunk, i) => ({ key: `${folder}s/${i}.json`, body: JSON.stringify(chunk) })),
  ];
}
