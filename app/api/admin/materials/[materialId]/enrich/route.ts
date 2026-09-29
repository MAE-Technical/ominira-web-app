import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { parseGoogleMetaData, parseOpenLibraryMetaData } from "@/lib/materials/providerMeta";
import { enrichMaterial } from "@/lib/materials/enrichMaterial";

/**
 * Admin's manual "Look up cover & description" trigger (LibraryAdminView's
 * edit panel) — the same Google Books -> OpenLibrary lookup
 * `app/api/materials/upload/route.ts` already kicks off automatically
 * right after a reader's own upload, just callable on demand for a book
 * that predates that (never got a first pass) or whose first pass found
 * nothing. Always `force: true`: an admin clicking this button is
 * explicitly asking for a fresh lookup, not relying on the "only once"
 * guard enrichMaterial applies to its own automatic call.
 *
 * Runs synchronously (unlike the upload route's `after()`) and returns the
 * refreshed cover/description fields directly, so the edit panel can
 * update its cover picker immediately — there's no equivalent to "the
 * reader doesn't need to see this happen" here, the whole point is the
 * admin watching it happen.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;

  const result = await enrichMaterial(materialId, { force: true });

  const admin = getSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("materials")
    .select("id, title, author, description, updated_at, google_meta_data, openlibrary_meta_data")
    .eq("id", materialId)
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "This book no longer exists." }, { status: 404 });

  const google = parseGoogleMetaData(row.google_meta_data);
  const openlibrary = parseOpenLibraryMetaData(row.openlibrary_meta_data);

  return NextResponse.json({
    ran: result.ran,
    foundGoogle: result.foundGoogle,
    foundOpenLibrary: result.foundOpenLibrary,
    item: {
      title: row.title,
      author: row.author,
      description: row.description,
      updated_at: row.updated_at,
      googleCoverUrl: google.coverUrl,
      googleThumbnailUrl: google.thumbnailUrl,
      openlibraryCoverUrl: openlibrary.coverUrl,
      openlibraryThumbnailUrl: openlibrary.thumbnailUrl,
    },
  });
}
