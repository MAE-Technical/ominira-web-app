"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { communityKeys } from "@/lib/community/queryKeys";
import { rangesKey } from "@/stores/library-store";
import type { MaterialSummary, Note } from "@/lib/api/types";

export type CommunityFeedItem = {
  note: Note;
  material: Pick<
    MaterialSummary,
    | "id" | "slug" | "title" | "author" | "cover" | "thumbnail"
    | "googleCoverUrl" | "googleThumbnailUrl" | "openlibraryCoverUrl" | "openlibraryThumbnailUrl" | "coverSource"
  >;
  sectionId: string;
  label: string;
  /** The actual quoted passage text, resolved server-side — replaces the
   * old DUMMY_EXCERPT_PLACEHOLDER stand-in now that this feed reads from
   * the real API. */
  excerpt: string;
  /** Every visible reply, hydrated and chronological — shipped inline so a
   * card's reply count and thread are accurate immediately, no click or
   * separate fetch required. */
  replies: Note[];
};

/** The deep link into the book at the exact passage a feed item's note is
 * anchored to — shared by every surface that renders a `CommunityFeedItem`
 * (the home feed, the profile page's public-notes list), so this one bit of
 * URL-building logic exists in exactly one place. Reader.tsx's own
 * annotation ids are deterministic, derived from an annotation's exact
 * ranges (see `rangesKey`) — recomputing it here from the same note's own
 * ranges is what makes `?note=` actually match the Annotation the reader
 * lands on once inside the book (Reader.tsx's useTextAnnotations/
 * useAnnotations builds that same key from the same ranges), rather than
 * the note's own (unrelated) row id. */
export function communityFeedItemHref(item: CommunityFeedItem): string {
  const passageId = item.note.ranges[0]?.passageId;
  return `/read/${item.material.slug}?${new URLSearchParams({
    section: item.sectionId,
    ...(passageId ? { passage: passageId } : {}),
    note: rangesKey(item.note.ranges),
  }).toString()}`;
}

/** The two sorts CommunityFeedSortToggle's UI exposes — `GET
 * /api/community/notes` also supports `trending`, not wired to any control
 * yet (out of scope for this pass, same as it was before this feed had a
 * real backend at all). */
export type CommunityFeedSort = "recent" | "top";

/** `GET /api/community/notes` — the home community feed. Only top-level,
 * public notes (api-spec.md) — this is the discovery surface, not a
 * per-book thread view. */
export function useCommunityFeed(sort: CommunityFeedSort) {
  return useQuery({
    queryKey: communityKeys.feed(sort),
    queryFn: () =>
      apiFetch<{ items: CommunityFeedItem[]; nextCursor: string | null }>(`/community/notes?sort=${sort}&limit=20`),
  });
}
