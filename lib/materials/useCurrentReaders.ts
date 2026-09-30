"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { materialKeys } from "@/lib/materials/queryKeys";
import type { CurrentReaderSummary } from "@/lib/api/types";

/** `GET /api/materials/{materialId}/readers` — who else is reading this
 * material, as of opening it. Fetched once per visit, never polled: the rail
 * it feeds is social proof, not a live roster. */
export function useCurrentReaders(materialId: string) {
  return useQuery({
    queryKey: materialKeys.currentReaders(materialId),
    queryFn: () => apiFetch<{ readers: CurrentReaderSummary[]; totalCount: number }>(`/materials/${materialId}/readers`),
    enabled: Boolean(materialId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
