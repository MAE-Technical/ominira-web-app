import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { toMaterialSummary } from "@/lib/materials/summary";
import {
  type AlphabeticalKeyset,
  encodeCursor,
  keysetAfterAlphabeticalFilter,
  keysetBeforeFilter,
  type Keyset,
} from "@/lib/api/cursor";
import type { MaterialSummary } from "@/lib/api/types";
import type { Database } from "@/lib/supabase/database.types";
import { listCurrentReaders } from "@/lib/reader/activity";
import { MATERIAL_SUMMARY_COLUMNS } from "./columns";

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

/**
 * `plainto_tsquery` (what this used before) matches whole lexemes only —
 * "bla" produces the lexeme `bla`, which never matches the stored `black`
 * lexeme no matter how the two relate, even though "black" itself matches
 * fine. That reads as broken for a live, as-you-type search box: typing
 * the first few letters of a real match should always narrow toward it,
 * never lose it partway through. Building the tsquery ourselves — each
 * token suffixed `:*` (Postgres's own prefix-match operator) and AND'd
 * together — fixes exactly that (`bla:*` matches `black`), while keeping
 * the tsvector's real benefits over a plain ILIKE scan (stemming,
 * multi-column weighting, the GIN index) for the multi-word case.
 * Passed to `.textSearch()` with no `type` option — that sends this
 * straight through as a raw `to_tsquery()` expression, per postgrest-js's
 * own textSearch(): `type` is what selects plainto_tsquery/phraseto_tsquery/
 * websearch_to_tsquery instead; omitting it is the one way to reach
 * to_tsquery, which is the only variant that understands `:*` at all.
 */
function toSearchTokens(input: string): string[] {
  const tokens = input
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  return tokens;
}

export type MaterialsSort = "alphabetical" | "recent" | "top";

/** Offset into the engagement-ranked pool `listByEngagement` builds below —
 * a distinct shape from `recent`'s {createdAt, id} keyset, since `top`'s
 * order (a computed score, not a real indexed column) can't be resumed
 * from a (createdAt, id) pair the way a column-ordered list can. Still an
 * opaque cursor as far as any caller is concerned — same encodeCursor
 * codec, just a different payload shape. */
export type OffsetCursor = { offset: number };

export type ListMaterialsOptions = {
  /** Include unpublished (database `draft`) materials in addition to the
   * published catalog. Public callers keep the published-only default. */
  includeUnpublished?: boolean;
  category?: string | null;
  search?: string | null;
  limit?: number;
  /** "alphabetical" (library default): `title` ascending, then `id`.
   * "recent": `createdAt` descending — every existing caller's behavior,
   * unchanged. "top": ranked by each material's own community engagement
   * (its public notes, each worth 1 + however many reactions it's gotten),
   * highest first. */
  sort?: MaterialsSort;
  cursor?: Keyset | AlphabeticalKeyset | OffsetCursor | null;
};

// Cap on how many published rows `top` pulls into memory to rank — plenty
// for today's catalog size (no denormalized per-material engagement column
// exists yet to sort on at the DB level instead — see models-spec.md's
// notes.reaction_count trigger for the equivalent pattern one table over,
// which this would mirror if the catalog ever grows past what's cheap to
// rank here in JS on every request).
const ENGAGEMENT_POOL_SIZE = 500;

function applyStatusFilter<T extends { in: (column: string, values: string[]) => T }>(query: T, includeUnpublished = false) {
  return query.in("status", includeUnpublished ? ["draft", "published"] : ["published"]);
}

function applyCategoryFilter<T extends { filter: (column: string, operator: string, value: string) => T }>(
  query: T,
  category: string
) {
  // `jsonb @> '["Category"]'` matches rows whose array contains the
  // selected category even if the row has other categories too.
  return query.filter("categories", "cs", JSON.stringify([category]));
}

async function listByEngagement(
  opts: ListMaterialsOptions,
  limit: number
): Promise<{ items: MaterialSummary[]; nextCursor: string | null }> {
  const admin = getSupabaseAdminClient();

  let materialsQuery = applyStatusFilter(
    admin.from("materials").select(MATERIAL_SUMMARY_COLUMNS).limit(ENGAGEMENT_POOL_SIZE),
    opts.includeUnpublished
  );

  // No search branch here: listPublishedMaterials routes any query straight
  // to listBySearch before `sort` is even inspected (see its own comment),
  // so this only ever runs in plain "top" browse mode.
  if (opts.category) materialsQuery = applyCategoryFilter(materialsQuery, opts.category);

  const { data: materialRows, error: materialsError } = await materialsQuery;
  if (materialsError || !materialRows || materialRows.length === 0) return { items: [], nextCursor: null };

  const ids = materialRows.map((row) => row.id);
  const { data: noteRows } = await admin
    .from("posts")
    .select("material_id, reaction_count")
    .eq("visibility", "public")
    .in("material_id", ids);

  // materialId -> engagement score. Each public note is worth 1 (the "a
  // note exists at all" signal) plus however many reactions it's drawn —
  // "notes + notes-reactions" per the product ask. Private notes never
  // count, same visibility rule the notes endpoints themselves enforce.
  // material_id is nullable on posts in general, but the `.in("material_id",
  // ids)` filter above guarantees every row back here has one.
  const engagement = new Map<string, number>();
  for (const note of noteRows ?? []) {
    if (!note.material_id) continue;
    engagement.set(note.material_id, (engagement.get(note.material_id) ?? 0) + 1 + note.reaction_count);
  }

  const ranked = [...materialRows].sort((a, b) => {
    const scoreDiff = (engagement.get(b.id) ?? 0) - (engagement.get(a.id) ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    // Stable tie-break for materials with equal (often zero) engagement —
    // newest first, same order `recent` uses as its own primary sort.
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

  const offset = opts.cursor && "offset" in opts.cursor ? opts.cursor.offset : 0;
  const page = ranked.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < ranked.length ? encodeCursor<OffsetCursor>({ offset: nextOffset }) : null;

  return { items: page.map(toMaterialSummary), nextCursor };
}

async function listAlphabetically(
  opts: ListMaterialsOptions,
  limit: number
): Promise<{ items: MaterialSummary[]; nextCursor: string | null }> {
  const admin = getSupabaseAdminClient();

  let query = applyStatusFilter(
    admin
      .from("materials")
      .select(MATERIAL_SUMMARY_COLUMNS)
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit + 1),
    opts.includeUnpublished
  );

  if (opts.category) query = applyCategoryFilter(query, opts.category);
  if (opts.cursor && "title" in opts.cursor) query = query.or(keysetAfterAlphabeticalFilter(opts.cursor));

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor<AlphabeticalKeyset>({ title: last.title, id: last.id }) : null;

  return { items: page.map(toMaterialSummary), nextCursor };
}

// Same tradeoff as ENGAGEMENT_POOL_SIZE above: rank in JS over a capped pool
// rather than pushing the ranking into Postgres, since there's no computed
// rank column (ts_rank needs the query text at rank time, which a plain
// stored/indexed column can't hold) to `.order()` by at the DB level.
const SEARCH_POOL_SIZE = 500;

/**
 * Relevance score for one matching row against the reader's (already
 * lowercased, whitespace-split) query tokens — mirrors search_vector's own
 * weighting (migration.sql: title A > author B > toc_titles C > description
 * D) so a title hit always outranks a description hit, plus a bonus for a
 * token starting the title (e.g. "capital" ranking *Capital* above a book
 * merely mentioning it in its blurb).
 */
function relevanceScore(row: Pick<MaterialRow, "title" | "author">, tokens: string[]): number {
  const title = row.title.toLowerCase();
  const author = row.author.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (title.startsWith(token)) score += 100;
    else if (title.includes(token)) score += 60;
    if (author.includes(token)) score += 40;
  }
  return score;
}

/**
 * Search branch of `listPublishedMaterials` — used instead of the plain
 * `created_at`-ordered path whenever a query is present, `sort` regardless
 * (a reader who typed a search wants the best match first, not just the
 * newest match first). Same textSearch prefix-match filter as before to
 * narrow the pool down at the DB level; relevanceScore then orders that
 * pool the way ts_rank would if there were a rank column to order by.
 */
async function listBySearch(
  opts: ListMaterialsOptions,
  limit: number
): Promise<{ items: MaterialSummary[]; nextCursor: string | null }> {
  const tokens = toSearchTokens(opts.search ?? "");
  if (tokens.length === 0) return { items: [], nextCursor: null };

  let query = applyStatusFilter(
    getSupabaseAdminClient()
      .from("materials")
      .select(MATERIAL_SUMMARY_COLUMNS)
      .limit(SEARCH_POOL_SIZE),
    opts.includeUnpublished
  );

  for (const token of tokens) {
    const safe = token.replace(/[(),]/g, "");
    query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`);
  }

  if (opts.category) query = applyCategoryFilter(query, opts.category);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return { items: [], nextCursor: null };

  const scored = data.map((row) => ({ row, score: relevanceScore(row, tokens.map((token) => token.toLowerCase())) }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // Stable tie-break for equal-relevance rows — newest first, same as
    // listByEngagement's own tie-break.
    if (a.row.created_at !== b.row.created_at) return a.row.created_at < b.row.created_at ? 1 : -1;
    return a.row.id < b.row.id ? 1 : -1;
  });

  const offset = opts.cursor && "offset" in opts.cursor ? opts.cursor.offset : 0;
  const page = scored.slice(offset, offset + limit).map((s) => s.row);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < scored.length ? encodeCursor<OffsetCursor>({ offset: nextOffset }) : null;

  return { items: page.map(toMaterialSummary), nextCursor };
}

/**
 * Fills in `currentReaders`/`currentReaderCount` (left at toMaterialSummary's
 * empty default) for a finished page of results — one batched
 * listCurrentReaders call regardless of how many items are on the page. The
 * single choke point every listPublishedMaterials branch returns through, so
 * "who's reading this" works the same whether the page came from plain
 * browse, alphabetical, top, or search.
 */
async function withCurrentReaders(
  page: { items: MaterialSummary[]; nextCursor: string | null }
): Promise<{ items: MaterialSummary[]; nextCursor: string | null }> {
  if (page.items.length === 0) return page;

  const byMaterial = await listCurrentReaders(page.items.map((item) => item.id));
  if (byMaterial.size === 0) return page;

  return {
    ...page,
    items: page.items.map((item) => {
      const entry = byMaterial.get(item.id);
      return entry ? { ...item, currentReaders: entry.readers, currentReaderCount: entry.totalCount } : item;
    }),
  };
}

/**
 * Shared query behind `GET /api/materials` — factored out so a server
 * component that needs the same published-materials list (the survey
 * wizard's "have you read any of these" picker, the library browse page)
 * can call straight into it instead of round-tripping an HTTP request to
 * this app's own API from within itself.
 */
export async function listPublishedMaterials(
  opts: ListMaterialsOptions = {}
): Promise<{ items: MaterialSummary[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

  // A query in flight always wins over `sort` — relevance-ranked (see
  // listBySearch/relevanceScore), never alphabetical/recent/top. `sort`
  // only matters once there's no query narrowing things down (plain
  // browse).
  if (opts.search) return withCurrentReaders(await listBySearch(opts, limit));
  if (opts.sort === "alphabetical") return withCurrentReaders(await listAlphabetically(opts, limit));
  if (opts.sort === "top") return withCurrentReaders(await listByEngagement(opts, limit));

  let query = applyStatusFilter(
    getSupabaseAdminClient()
      .from("materials")
      .select(MATERIAL_SUMMARY_COLUMNS)
      .order("created_at", { ascending: false })
    .order("id", { ascending: false })
      .limit(limit + 1),
    opts.includeUnpublished
  );

  if (opts.category) query = applyCategoryFilter(query, opts.category);
  if (opts.cursor && "createdAt" in opts.cursor) query = query.or(keysetBeforeFilter(opts.cursor));

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor<Keyset>({ createdAt: last.created_at, id: last.id }) : null;

  return withCurrentReaders({ items: page.map(toMaterialSummary), nextCursor });
}
