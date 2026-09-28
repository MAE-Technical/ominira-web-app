"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type Topic = { id: string; slug: string; name: string; post_count: number };

/** `GET /api/community/topics` — curated, active topics ordered by
 * `post_count` descending. Backs Home's CategoryPills filter and the
 * composer's required topic-select. Rarely changes, so a longer staleTime
 * than the feed itself is fine. */
export function useTopics() {
  return useQuery({
    queryKey: ["community", "topics"],
    queryFn: () => apiFetch<{ topics: Topic[] }>("/community/topics").then((r) => r.topics),
    staleTime: 5 * 60_000,
  });
}
