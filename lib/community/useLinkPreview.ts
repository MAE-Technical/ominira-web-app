"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { communityKeys } from "./queryKeys";
import type { LinkPreviewResult } from "@/app/api/link-preview/route";

export type { LinkPreviewResult };

/** `GET /api/link-preview` — one shared fetch behind both HomeComposer's
 * auto-detected link attachment and NoteContent's rendered note body (see
 * LinkPreviewCard, the shared display component both then render). Keyed by
 * URL and cached long (an hour) since a page's OG metadata essentially never
 * changes within a session; `retry: false` because a failed unfurl already
 * resolves server-side to a same-shape fallback response, never a thrown
 * error — nothing here is worth retrying. */
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: url ? communityKeys.linkPreview(url) : communityKeys.linkPreview(""),
    queryFn: () => apiFetch<LinkPreviewResult>(`/link-preview?url=${encodeURIComponent(url as string)}`),
    enabled: !!url,
    staleTime: 60 * 60_000,
    retry: false,
  });
}
