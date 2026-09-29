"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

/** `POST /api/materials/{materialId}/reactions` — the appreciation toggle
 * behind ReactionButton on the material details page. The page's `material`
 * comes from a server-rendered prop (getMaterialDetail), not a react-query
 * cache entry, so this is a bare mutation — MaterialDetailView owns the
 * optimistic count/reacted state itself (same as any other controlled
 * ReactionButton caller) rather than this hook patching a query cache that
 * was never populated to begin with. */
export function useMaterialReaction(materialId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ reactedByMe: boolean; reactionCount: number }>(`/materials/${materialId}/reactions`, {
        method: "POST",
      }),
  });
}
