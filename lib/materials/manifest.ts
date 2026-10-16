import { readStorageText } from "@/lib/storage/r2";
import { sectionLabel } from "@/lib/reader/sectionHeading";
import type { BookDocument, Section } from "@/lib/book/schema";
import type { TocSection } from "@/lib/api/types";

export type MaterialManifest = {
  schemaVersion: 1;
  slug: string;
  toc: TocSection[];
  spine: string[];
};

/** A book's manifest sits beside its JSON, in the same version folder:
 * books/<slug>/v<n>/{book.json, manifest.json}. */
export function manifestKey(jsonKey: string): string {
  return jsonKey.replace(/book\.json$/, "manifest.json");
}

function buildToc(sections: Section[]): TocSection[] {
  return sections.map((section) => {
    const tracks = section.audio?.narratorTracks ?? [];
    const firstTrack = tracks[0];
    return {
      id: section.id,
      label: sectionLabel(section),
      kind: section.kind,
      passageCount: section.passages.length,
      children: buildToc(section.children),
      ...(firstTrack ? { audioDurationMs: firstTrack.durationMs } : {}),
      ...(tracks.length ? { narratorIds: tracks.map((track) => track.narratorId) } : {}),
    };
  });
}

/** Builds the compact navigation manifest a parsed/validated BookDocument
 * gets beside its JSON (`manifestKey`). `slug` defaults to the document's own,
 * but the upload route passes the materials row's final slug: that one is
 * generated server-side from the title and de-duplicated (uniqueSlug), so it
 * can differ from the document's. */
export function buildMaterialManifest(book: BookDocument, slug: string = book.slug): MaterialManifest {
  return { schemaVersion: 1, slug, toc: buildToc(book.sections), spine: book.spine };
}

/** The manifest beside a material's `json_storage_path`. */
export async function fetchMaterialManifest(jsonKey: string): Promise<MaterialManifest> {
  const text = await readStorageText(manifestKey(jsonKey)).catch((err: Error) => {
    throw new Error(`Could not fetch material manifest at ${manifestKey(jsonKey)} (${err.message})`);
  });
  const value = JSON.parse(text) as Partial<MaterialManifest>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.toc) || !Array.isArray(value.spine)) {
    throw new Error(`Invalid material manifest at ${manifestKey(jsonKey)}`);
  }
  return value as MaterialManifest;
}
