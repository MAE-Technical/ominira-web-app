"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import type { FeedItem } from "@/lib/community/feed";
import type { MaterialSummary } from "@/lib/api/types";

// Module-level constant, not `new Set()` inline at the call site: this is
// the identity every signed-out / pre-load render returns, and a fresh Set
// each time would be a new dependency value on every render for anything
// memoizing on it.
const EMPTY: ReadonlySet<string> = new Set();

export const bookmarkKeys = {
  materialIds: ["bookmarks", "material-ids"] as const,
  saved: (type: "material" | "post") => ["bookmarks", "saved", type] as const,
};

/**
 * Every material id this reader has saved, as a Set — one fetch for the
 * whole session, shared by every BookmarkButton on every book row in the
 * app (see the ids route's own doc comment for why materials get a set and
 * notes get a per-row flag instead).
 *
 * Signed-out readers never fire this: the button gates itself behind
 * MembersOnlyPrompt before it could ever need the answer, and an empty set
 * is the correct render until then.
 */
export function useBookmarkedMaterialIds() {
  const isAuthenticated = useIsAuthenticated();
  const { data } = useQuery({
    queryKey: bookmarkKeys.materialIds,
    queryFn: () => apiFetch<{ materialIds: string[] }>("/auth/me/bookmarks/ids").then((r) => new Set(r.materialIds)),
    enabled: isAuthenticated,
  });
  return data ?? EMPTY;
}

/**
 * `POST /api/bookmarks` for a book. Flips the cached id set immediately
 * (the button is the kind of control that has to feel instant) and rolls
 * that exact flip back on failure; the Saved shelf itself is invalidated
 * rather than patched, since inserting into it would mean reconstructing a
 * full MaterialSummary the client may not be holding.
 */
export function useToggleMaterialBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (materialId: string) =>
      apiFetch<{ bookmarked: boolean }>("/bookmarks", {
        json: { targetType: "material", targetId: materialId },
      }),
    onMutate: async (materialId) => {
      await queryClient.cancelQueries({ queryKey: bookmarkKeys.materialIds });
      const previous = queryClient.getQueryData<ReadonlySet<string>>(bookmarkKeys.materialIds);
      queryClient.setQueryData<ReadonlySet<string>>(bookmarkKeys.materialIds, (old) => {
        const next = new Set(old ?? []);
        if (next.has(materialId)) next.delete(materialId);
        else next.add(materialId);
        return next;
      });
      return { previous };
    },
    onError: (_err, _materialId, context) => {
      if (context?.previous) queryClient.setQueryData(bookmarkKeys.materialIds, context.previous);
    },
    onSuccess: (result, materialId) => {
      // Reconcile against what the server actually landed on, rather than
      // trusting the optimistic flip — two devices toggling the same book
      // can otherwise leave this set inverted until the next cold load.
      queryClient.setQueryData<ReadonlySet<string>>(bookmarkKeys.materialIds, (old) => {
        const next = new Set(old ?? []);
        if (result.bookmarked) next.add(materialId);
        else next.delete(materialId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.saved("material") });
    },
  });
}

/** `GET /api/auth/me/bookmarks?type=material` — the Saved tab's books. */
export function useSavedMaterials() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: bookmarkKeys.saved("material"),
    queryFn: () => apiFetch<{ items: MaterialSummary[] }>("/auth/me/bookmarks?type=material").then((r) => r.items),
    enabled: isAuthenticated,
  });
}

/** `GET /api/auth/me/bookmarks?type=post` — the Saved tab's posts, in the
 * same FeedItem shape the home feed renders, so NoteCard takes them
 * unchanged. */
export function useSavedNotes() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: bookmarkKeys.saved("post"),
    queryFn: () => apiFetch<{ items: FeedItem[] }>("/auth/me/bookmarks?type=post").then((r) => r.items),
    enabled: isAuthenticated,
  });
}
