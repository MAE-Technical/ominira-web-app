import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { toMaterialSummary } from "@/lib/materials/summary";
import { MATERIAL_SUMMARY_COLUMNS } from "@/lib/materials/columns";
import type { MaterialSummary } from "@/lib/api/types";

const CONFIG_PATH = path.join(process.cwd(), "config", "featured.json");

type RawFeaturedConfig = { books: { id: string; blurb: string }[] };

let cached: RawFeaturedConfig | undefined;

async function loadRawConfig(): Promise<RawFeaturedConfig> {
  if (!cached) {
    cached = JSON.parse(await readFile(CONFIG_PATH, "utf-8")) as RawFeaturedConfig;
  }
  return cached;
}

export type FeaturedBook = { material: MaterialSummary; blurb: string };

/**
 * Resolves the Library page's "Featured this week" rail against the real
 * `materials` table — same shape as lib/survey/config.ts's
 * getSurveyBooks(): the JSON config only ever stores `materials.id` UUIDs
 * (plus the hand-written curatorial line for each), so title/author/cover
 * always come live from the DB and this can never drift from what's
 * actually published. Config order is preserved (it's the curation, not
 * whatever order the DB happens to return); an id the config lists that
 * isn't a published material (typo, unpublished, deleted) is silently
 * dropped rather than rendering a broken card.
 */
export async function getFeaturedBooks(): Promise<FeaturedBook[]> {
  const { books } = await loadRawConfig();
  if (books.length === 0) return [];

  const ids = books.map((b) => b.id);
  const { data } = await getSupabaseAdminClient()
    .from("materials")
    .select(MATERIAL_SUMMARY_COLUMNS)
    .eq("status", "published")
    .in("material_type", ["book", "pdf", "docx"])
    .in("id", ids);

  const bySummaryId = new Map((data ?? []).map((row) => [row.id, toMaterialSummary(row)]));
  return books
    .map(({ id, blurb }) => {
      const material = bySummaryId.get(id);
      return material ? { material, blurb } : undefined;
    })
    .filter((book): book is FeaturedBook => book !== undefined);
}
