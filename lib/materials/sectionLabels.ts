import type { TocSection } from "@/lib/api/types";
import { fetchMaterialManifest } from "./manifest";

/** Each material's section id -> label, from its small manifest (one cached
 * read per material) — what a note's excerpt shows as its location. A
 * material with no manifest (a PDF, a web article) or whose manifest can't
 * be read is left out; resolveExcerpt then shows no label. */
export async function loadSectionLabels(
  materials: { id: string; json_storage_path: string | null }[]
): Promise<Map<string, Map<string, string>>> {
  const byMaterial = new Map<string, Map<string, string>>();
  await Promise.all(
    materials.map(async (material) => {
      if (!material.json_storage_path) return;
      const manifest = await fetchMaterialManifest(material.json_storage_path).catch(() => null);
      if (!manifest) return;
      const labels = new Map<string, string>();
      const walk = (sections: TocSection[]) => {
        for (const s of sections) {
          if (s.label) labels.set(s.id, s.label);
          walk(s.children);
        }
      };
      walk(manifest.toc);
      byMaterial.set(material.id, labels);
    })
  );
  return byMaterial;
}
