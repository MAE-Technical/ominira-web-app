// Background metadata enrichment for a single material — wired into
// `app/api/materials/upload/route.ts` via next/server's `after()`, so it
// runs once the upload's own response has already gone out and never adds
// latency to it. Also callable directly, with `force: true`, from
// `app/api/admin/materials/[materialId]/enrich/route.ts` — the admin
// edit panel's own "Look up cover & description" trigger, for a book that
// was never enriched (e.g. added before this existed) or whose first pass
// found nothing worth keeping. Same two-step discovery chain as the batch
// CLI backfills (scripts/generate-material-*-metadata.ts), just scoped to
// one material instead of every row missing metadata: Google Books search
// first (title+author -> best match, including its ISBN), then, if an ISBN
// came back, a deterministic OpenLibrary lookup keyed on it. Best-effort
// throughout — the material this runs against has already been created by
// the time this runs, so nothing here should ever surface as an error to a
// reader; failures just mean it keeps whatever it had.
//
// What this does and doesn't touch:
// - Runs for every material type (book/pdf/docx) — all of them can carry a
//   real title/author a Google Books search can key on, not just EPUBs.
// - `google_meta_data`/`openlibrary_meta_data` (JSONB) always get written
//   when a lookup succeeds — these are what lib/materials/image.ts's
//   resolveBookCoverSrc/resolveBookThumbnailSrc already fall through to
//   when the material's own cover_url/thumbnail_url is null (a cover-less
//   EPUB, or one whose declared cover asset couldn't be read — see
//   useUploadBook.ts's own best-effort comment). So a cover can appear
//   here with no other change needed.
// - `cover_source` is never touched — "own" stays preferred whenever an
//   own cover exists; a reader (or admin) picks a different source
//   explicitly via AddBookModal's (edit mode)/LibraryAdminView's own cover picker.
// - `title`/`author`/`description` are only backfilled when the material's
//   own value is empty — the upload's own canonical guess (or a later
//   manual edit) always wins; a provider match is a fallback, never an
//   override.
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import type { Database, Json } from "@/lib/supabase/database.types";
import { searchGoogleBooks } from "@/lib/materials/providers/googleBooks";
import { lookupOpenLibrary } from "@/lib/materials/providers/openLibrary";

type MaterialRow = Pick<
  Database["public"]["Tables"]["materials"]["Row"],
  "id" | "title" | "author" | "description" | "google_meta_data"
>;

export type EnrichMaterialResult = {
  ran: boolean;
  foundGoogle: boolean;
  foundOpenLibrary: boolean;
};

export async function enrichMaterial(materialId: string, opts: { force?: boolean } = {}): Promise<EnrichMaterialResult> {
  const notRun: EnrichMaterialResult = { ran: false, foundGoogle: false, foundOpenLibrary: false };
  try {
    const admin = getSupabaseAdminClient();
    const { data: row, error } = await admin
      .from("materials")
      .select("id, title, author, description, google_meta_data")
      .eq("id", materialId)
      .maybeSingle<MaterialRow>();
    if (error || !row) return notRun;
    // Every material type carries a real title/author a Google Books search
    // can key on — PDFs and DOCX uploads are just as often real published
    // books as EPUBs are, they just arrived as a different file format.
    // PDFs already get a real client-rasterized cover, but that's cover
    // only: description/author (and OpenLibrary's own cover alternative)
    // are still worth looking up regardless of format.
    // Idempotent by default: a material only ever gets this once on its
    // own (e.g. a retried `after()` invocation is a no-op once
    // google_meta_data exists), same "already populated rows are left
    // alone" rule the CLI backfill scripts use. `force` (the admin
    // trigger) deliberately bypasses this — an admin re-running it is
    // explicitly asking for a fresh lookup, not relying on it happening
    // automatically once.
    if (row.google_meta_data !== null && !opts.force) return notRun;

    let author = row.author?.trim() || "";
    let description = row.description?.trim() || "";

    const google = await searchGoogleBooks(row.title, author);
    const update: Database["public"]["Tables"]["materials"]["Update"] = {};

    if (google) {
      update.google_meta_data = google as unknown as Json;
      if (!author && google.author) author = google.author;
      if (!description && google.description) description = google.description;
    }

    // Isolated from the Google step above on purpose: OpenLibrary having no
    // record for this ISBN (or erroring outright) must never cost the
    // Google metadata already found — that write still needs to land below
    // either way. lookupOpenLibrary itself already treats "no record" as a
    // normal null result rather than throwing; this catch is only for a
    // genuinely unexpected failure (network blip, etc.).
    if (google?.isbn) {
      try {
        const openLibrary = await lookupOpenLibrary(google.isbn);
        if (openLibrary) {
          update.openlibrary_meta_data = openLibrary as unknown as Json;
          if (!author && openLibrary.author) author = openLibrary.author;
          if (!description && openLibrary.description) description = openLibrary.description;
        }
      } catch (err) {
        console.error(`enrichMaterial(${materialId}): OpenLibrary lookup failed:`, err);
      }
    }

    if (author && author !== row.author) update.author = author;
    if (description && description !== (row.description ?? "")) update.description = description;

    const result: EnrichMaterialResult = { ran: true, foundGoogle: !!google, foundOpenLibrary: !!update.openlibrary_meta_data };
    if (Object.keys(update).length === 0) return result;
    await admin.from("materials").update(update).eq("id", materialId);
    return result;
  } catch (err) {
    // Best-effort background pass — log for visibility, never throw back
    // into an `after()` callback (an uncaught rejection there is only ever
    // noise, the upload it followed already succeeded and responded) or
    // the admin trigger route (which reports failure via its own response,
    // not by letting this throw).
    console.error(`enrichMaterial(${materialId}) failed:`, err);
    return notRun;
  }
}
