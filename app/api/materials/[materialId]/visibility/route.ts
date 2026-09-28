import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { forbidden, notFound, unauthorized, validationError } from "@/lib/api/errors";
import { resolveMaterialRow } from "@/lib/materials/resolve";

/**
 * Personal <-> public toggle on a reader's own uploaded material
 * (reader-uploads-spec.md § 3). `publishedOnly: false` on the resolve below
 * — a `personal` upload is never `status: 'draft'` (reader uploads publish
 * immediately, see migrations/20260927_reader_uploads.sql), but resolving
 * with the published-only default would still wrongly 404 this route for
 * one that later got flipped back to `personal`, since RLS's own select
 * policy is a separate, defense-in-depth concern from this route's
 * ownership check.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { materialId } = await params;
  const row = await resolveMaterialRow(materialId, { publishedOnly: false });
  if (!row) return notFound();
  if (row.uploaded_by !== reader.readerId) return forbidden("You can only change visibility on your own uploads.");

  const body = await request.json().catch(() => null);
  const visibility = body?.visibility;
  if (visibility !== "personal" && visibility !== "public") {
    return validationError("visibility must be 'personal' or 'public'.", "visibility");
  }

  const { error } = await getSupabaseAdminClient().from("materials").update({ visibility }).eq("id", row.id);
  if (error) return validationError("Could not update visibility.");

  return NextResponse.json({ id: row.id, visibility });
}
