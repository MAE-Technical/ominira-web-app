import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api/errors";
import { toMaterialSummary } from "@/lib/materials/summary";
import { MATERIAL_SUMMARY_COLUMNS } from "@/lib/materials/columns";

/**
 * "My uploads" — a reader's own personal-library materials (reader-uploads-
 * spec.md § 3's `uploaded_by = me` filter), regardless of `visibility`
 * (this is the one place a `personal` upload is meant to be findable by
 * anyone other than a direct link). Deliberately not folded into
 * `listPublishedMaterials`/`GET /api/materials`: that endpoint's whole
 * shape (category filter, alphabetical/recent/top sort, published-only by
 * default) is about browsing the shared catalog, not "everything one
 * reader has ever uploaded" — a separate, much simpler query.
 */
export async function GET(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { data, error } = await getSupabaseAdminClient()
    .from("materials")
    .select(MATERIAL_SUMMARY_COLUMNS)
    .eq("uploaded_by", reader.readerId)
    .in("material_type", ["book", "pdf", "docx"])
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: (data ?? []).map(toMaterialSummary) });
}
