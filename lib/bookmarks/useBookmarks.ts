"use client";

import { showToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { serialized } from "@/lib/bookmarks/serialize";
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

const MATERIAL_MUTATION_KEY = ["bookmarks", "toggle-material"] as const;

/**
 * Saves/unsaves a book. Fully optimistic: the id set (and, on removal, the
 * Bookmarks tab list) change and the toast shows the instant it's tapped —
 * nothing waits on the network.
 *
 * Race safety: the request carries the *desired* state (idempotent on the
 * server, see setBookmark) rather than "flip", and requests for one book are
 * serialized in click order (serialize.ts), so rapid taps can never invert
 * or reorder the result — the last tap always wins. A failure undoes just
 * that tap's flip; once the last in-flight request settles, the cache is
 * re-read from the server so any drift is corrected.
 *
 * `mutate(materialId)` decides the desired state from the cache at call
 * time, so callers still just say "toggle this".
 */
export function useToggleMaterialBookmark() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: MATERIAL_MUTATION_KEY,
    mutationFn: ({ materialId, bookmarked }: { materialId: string; bookmarked: boolean }) =>
      serialized(`material:${materialId}`, () =>
        apiFetch<{ bookmarked: boolean }>("/bookmarks", { json: { targetType: "material", targetId: materialId, bookmarked } })
      ),
    onMutate: async ({ materialId, bookmarked }) => {
      showToast(bookmarked ? "Saved to bookmark" : "Removed from bookmark");
      await queryClient.cancelQueries({ queryKey: bookmarkKeys.materialIds });
      queryClient.setQueryData<ReadonlySet<string>>(bookmarkKeys.materialIds, (old) => {
        const next = new Set(old ?? []);
        if (bookmarked) next.add(materialId);
        else next.delete(materialId);
        return next;
      });
      if (!bookmarked) {
        queryClient.setQueryData<MaterialSummary[]>(bookmarkKeys.saved("material"), (old) => old?.filter((m) => m.id !== materialId));
      }
    },
    onError: (_err, { materialId, bookmarked }) => {
      showToast("Couldn't update bookmark");
      queryClient.setQueryData<ReadonlySet<string>>(bookmarkKeys.materialIds, (old) => {
        const next = new Set(old ?? []);
        if (bookmarked) next.delete(materialId);
        else next.add(materialId);
        return next;
      });
    },
    onSettled: () => {
      // Only the last in-flight request reconciles (this one still counts
      // as mutating), so an early response can't overwrite a later tap.
      if (queryClient.isMutating({ mutationKey: MATERIAL_MUTATION_KEY }) > 1) return;
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.materialIds });
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.saved("material") });
    },
  });

  return {
    mutate: (materialId: string) => {
      const saved = queryClient.getQueryData<ReadonlySet<string>>(bookmarkKeys.materialIds)?.has(materialId) ?? false;
      mutation.mutate({ materialId, bookmarked: !saved });
    },
  };
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
