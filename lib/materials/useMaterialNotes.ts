"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { materialKeys } from "@/lib/materials/queryKeys";
import type { Note, NoteThread } from "@/lib/api/types";

// Fetched once per material at a generous flat limit rather than truly
// paginated — the reader needs every note up front to group by passage for
// inline markers/the book-wide feed, not a paged list. A book with more
// than this many top-level community notes will silently miss the oldest
// ones from inline rendering — an acceptable simplification for this pass
// (same "fetch a generous page, tune later" tradeoff as
// lib/materials/list.ts's survey-picker call), not a hard product limit.
const NOTES_FETCH_LIMIT = 200;

/** `GET /api/materials/{materialId}/notes` — every community note anchored
 * anywhere in this material, flattened (root + replies) rather than nested
 * `NoteThread[]`, since `buildAnnotationsForPassage` groups by shared
 * `ranges` regardless of nesting (see stores/library-store.ts). No auth
 * required — public notes always visible; the caller's own private notes
 * too, once authenticated, resolved server-side from the Bearer token.
 *
 * The flattening happens inside `queryFn` itself — not a `select` — so the
 * cache entry under `materialKeys.notes(materialId)` is the flat `Note[]`
 * directly. useNoteMutations.ts's optimistic writes (`setQueryData<Note[]>`
 * on this same key) read and write that raw cache entry; if it were left
 * as the API's nested `{ items: NoteThread[], nextCursor }` shape instead,
 * every optimistic `old` would actually be that object, `[...old, x]` would
 * throw (not iterable), and the mutation would reject into onError before
 * ever reaching the network — surfacing as a spurious "check your
 * connection" failure with no optimistic row ever shown. nextCursor is
 * dropped here since this is a single generous fetch, never paginated. */
export function useMaterialNotes(materialId: string) {
  const query = useQuery({
    queryKey: materialKeys.notes(materialId),
    queryFn: async () => {
      const { items } = await apiFetch<{ items: NoteThread[]; nextCursor: string | null }>(
        `/materials/${materialId}/notes?limit=${NOTES_FETCH_LIMIT}`
      );
      return items.flatMap((thread) => [thread.note, ...thread.replies]);
    },
    enabled: Boolean(materialId),
  });
  return { data: query.data ?? (EMPTY as Note[]), isLoading: query.isLoading, isError: query.isError };
}

const EMPTY: never[] = [];
