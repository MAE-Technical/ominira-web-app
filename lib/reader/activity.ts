import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import type { CurrentReaderSummary, CurrentReadingEntry } from "@/lib/api/types";
import { isLocator, type Locator, type ReaderMode } from "@/lib/reader/locator";
import { CURRENT_READERS_DISPLAY_CAP } from "./constants";
import { toAvatar } from "@/lib/avatar/avatar";

type ActivityInput = {
  materialId: string;
  locator: Locator;
  mode: ReaderMode;
  audioTimeMs: number | null;
  progressPercent: number;
};

/**
 * Upserts one reader's position in one material (`public.reader_activities`,
 * migrations/20260831_reader_activities.sql) — a single-row write, replacing the old
 * fetch-the-whole-map-then-write-it-back-with-one-key-changed against
 * readers.current_reading.
 */
export async function saveReaderActivity(readerId: string, entry: ActivityInput): Promise<boolean> {
  const { error } = await getSupabaseAdminClient()
    .from("reader_activities")
    .upsert(
      {
        reader_id: readerId,
        material_id: entry.materialId,
        locator: entry.locator,
        mode: entry.mode,
        audio_time_ms: entry.audioTimeMs,
        progress_percent: entry.progressPercent,
      },
      { onConflict: "reader_id,material_id" }
    );
  return !error;
}

/**
 * Marks one material finished for one reader, or un-marks it —
 * `PUT /api/auth/me/finished`'s only write.
 *
 * A full upsert rather than an update: a reader can finish a material with no
 * position row yet (a short article read in one screenful), so the locator
 * comes along to create it. Conversely `saveReaderActivity` above never names
 * `finished_at`, which is what keeps the two paths from clobbering each other —
 * a position write can't clear a finish, and this can't rewind a position.
 */
export async function setReaderActivityFinished(
  readerId: string,
  entry: { materialId: string; finished: boolean; locator: Locator; mode: ReaderMode; progressPercent: number }
): Promise<boolean> {
  const { error } = await getSupabaseAdminClient()
    .from("reader_activities")
    .upsert(
      {
        reader_id: readerId,
        material_id: entry.materialId,
        locator: entry.locator,
        mode: entry.mode,
        progress_percent: entry.progressPercent,
        finished_at: entry.finished ? new Date().toISOString() : null,
      },
      { onConflict: "reader_id,material_id" }
    );
  return !error;
}

/**
 * Drops one reader's activity in one material entirely — `DELETE
 * /api/auth/me/reading-position`, the Shelf page's per-row remove.
 *
 * A real delete, not a `dismissed_at` flag: position and finish live in the
 * same row, so hiding it while keeping progress would mean every read of
 * this table carrying a "is this one still on the shelf" filter, and the
 * row silently reappearing the next time the reader opened the material.
 * Removing means removing — the material itself is untouched and still in
 * the library, it just no longer claims a slot on their shelf.
 *
 * Scoped by `reader_id` as well as `material_id` (not just the composite
 * key's material half), so a forged materialId can only ever delete the
 * caller's own row. Absent-is-success: a repeated or raced delete is the
 * outcome the caller asked for either way.
 */
export async function deleteReaderActivity(readerId: string, materialId: string): Promise<boolean> {
  const { error } = await getSupabaseAdminClient()
    .from("reader_activities")
    .delete()
    .eq("reader_id", readerId)
    .eq("material_id", materialId);
  return !error;
}

/**
 * This reader's activity across every material, most recently updated first —
 * GET /api/auth/me/continue-reading's source, sorted by the DB (reader_activities_
 * reader_updated_idx) instead of an Object.values().sort() over the old jsonb map.
 */
export async function listReaderActivities(readerId: string): Promise<CurrentReadingEntry[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("reader_activities")
    .select("*")
    .eq("reader_id", readerId)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];

  // A row whose locator doesn't validate is dropped rather than surfaced as a
  // resume target nothing can act on — see isLocator's own comment on why every
  // jsonb boundary validates instead of casting.
  return data.flatMap((row) =>
    isLocator(row.locator)
      ? [{
          materialId: row.material_id,
          locator: row.locator,
          mode: row.mode,
          audioTimeMs: row.audio_time_ms,
          progressPercent: row.progress_percent,
          finishedAt: row.finished_at,
          updatedAt: row.updated_at,
        }]
      : []
  );
}

/** Alias for the API-contract shape (lib/api/types.ts) — kept as a local name
 * because this module is where the roster is actually assembled. */
export type CurrentReaderSnippet = CurrentReaderSummary;

/**
 * "Who's currently reading/listening to each of these materials" — a book
 * list row's presence line and the book-detail page's reading-room roster
 * (app/components/shared/CurrentReaders.tsx), batched: one reader_activities
 * query plus one readers query *total*, no matter how many materialIds are
 * passed in — the exact join the old readers.current_reading jsonb blob
 * couldn't serve without a full scan, which is what motivated splitting it
 * into this table in the first place.
 *
 * Every material's entry is capped at `cap`, most recently active first — a
 * book with hundreds of concurrent readers still costs one bounded readers
 * lookup, not one row per active reader. `totalCount` carries the real
 * number so the UI can render "+N more" without ever needing every
 * pseudonym. `cap` defaults to the list-row/library-page-safe
 * CURRENT_READERS_DISPLAY_CAP; a single book-detail page (one material, not
 * 24) can afford CURRENT_READERS_DETAIL_CAP instead, so its roster has real
 * pseudonyms to expand "+N more comrades" into.
 */
export async function listCurrentReaders(
  materialIds: string[],
  cap: number = CURRENT_READERS_DISPLAY_CAP
): Promise<Map<string, { readers: CurrentReaderSnippet[]; totalCount: number }>> {
  const result = new Map<string, { readers: CurrentReaderSnippet[]; totalCount: number }>();
  if (materialIds.length === 0) return result;

  const { data: activityRows, error } = await getSupabaseAdminClient()
    .from("reader_activities")
    .select("reader_id, material_id, mode, updated_at")
    .in("material_id", materialIds)
    // A reader who's finished a material isn't "currently" reading/listening
    // to it any more — their row otherwise lingers here forever (nothing else
    // ever deletes a reader_activities row), which is what let a finished
    // reader keep showing in the presence line/reading-room roster.
    .is("finished_at", null)
    .order("updated_at", { ascending: false });
  if (error || !activityRows || activityRows.length === 0) return result;

  // materialId -> every active reader's row, most recently updated first
  // (preserved from the query's own order() above).
  type ActivityRow = { readerId: string; mode: ReaderMode; updatedAt: string };
  const rowsByMaterial = new Map<string, ActivityRow[]>();
  for (const row of activityRows) {
    const entry: ActivityRow = { readerId: row.reader_id, mode: row.mode, updatedAt: row.updated_at };
    const list = rowsByMaterial.get(row.material_id);
    if (list) list.push(entry);
    else rowsByMaterial.set(row.material_id, [entry]);
  }

  // Only look up pseudonyms for readers actually within the cap — the rest
  // only ever surface as part of totalCount below.
  const neededReaderIds = new Set<string>();
  for (const rows of rowsByMaterial.values()) {
    for (const row of rows.slice(0, cap)) neededReaderIds.add(row.readerId);
  }

  const { data: readerRows } = await getSupabaseAdminClient()
    .from("readers")
    .select("id, pseudonym, avatar_color, avatar_url, city, country")
    .in("id", [...neededReaderIds]);
  const readerById = new Map((readerRows ?? []).map((r) => [r.id, r]));

  for (const [materialId, rows] of rowsByMaterial) {
    const readers = rows
      .slice(0, cap)
      .map((row) => {
        const reader = readerById.get(row.readerId);
        return reader
          ? {
              readerId: row.readerId,
              pseudonym: reader.pseudonym,
              avatar: toAvatar(reader),
              mode: row.mode,
              updatedAt: row.updatedAt,
              city: reader.city,
              country: reader.country,
            }
          : null;
      })
      // Guards a reader row deleted between the two queries above — the
      // same edge case the backfill's own `where exists` guarded for.
      .filter((r): r is CurrentReaderSnippet => r !== null);
    result.set(materialId, { readers, totalCount: rows.length });
  }
  return result;
}
