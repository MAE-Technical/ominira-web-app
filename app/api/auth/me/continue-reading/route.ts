import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";
import { listReaderActivities } from "@/lib/reader/activity";
import { toMaterialSummary } from "@/lib/materials/summary";
import { MATERIAL_SUMMARY_COLUMNS } from "@/lib/materials/columns";

export async function GET(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const entries = await listReaderActivities(reader.readerId);
  if (entries.length === 0) return NextResponse.json({ items: [] });

  const { data: materials } = await getSupabaseAdminClient()
    .from("materials")
    .select(MATERIAL_SUMMARY_COLUMNS)
    .in(
      "id",
      entries.map((e) => e.materialId)
    );
  const materialsById = new Map((materials ?? []).map((m) => [m.id, m]));

  const items = entries
    .map((entry) => {
      const material = materialsById.get(entry.materialId);
      if (!material) return null;
      return {
        material: toMaterialSummary(material),
        locator: entry.locator,
        mode: entry.mode,
        audioTimeMs: entry.audioTimeMs,
        progressPercent: entry.progressPercent,
        finishedAt: entry.finishedAt,
        updatedAt: entry.updatedAt,
      };
    })
    .filter((item) => item !== null);

  return NextResponse.json({ items });
}
