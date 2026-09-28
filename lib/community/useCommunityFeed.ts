"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { communityKeys } from "@/lib/community/queryKeys";
import { rangesKey } from "@/stores/library-store";
import type { FeedItem } from "@/lib/community/feed";

/** The deep link into the book at the exact passage a feed item's note is
 * anchored to — shared by every surface that renders a `FeedItem` (the home
 * feed, the profile page's public-notes list), so this one bit of
 * URL-building logic exists in exactly one place. Reader.tsx's own
 * annotation ids are deterministic, derived from an annotation's exact
 * ranges (see `rangesKey`) — recomputing it here from the same note's own
 * ranges is what makes `?note=` actually match the Annotation the reader
 * lands on once inside the book (Reader.tsx's useTextAnnotations/
 * useAnnotations builds that same key from the same ranges), rather than
 * the note's own (unrelated) row id. Null for a book-less discussion post —
 * there's no book to deep-link into, so callers render without a
 * `bookContext` at all rather than passing this. */
export function communityFeedItemHref(item: FeedItem): string | null {
  if (!item.material) return null;
  // A book-*attached* general note (no highlighted passage, so no
  // sectionId) still has somewhere to go: straight into the reader at the
  // material's own start, same as a highlighted note's deep link, just
  // without the passage query params. PDF/DOCX/webpage notes are *always*
  // this branch — all three are whole-document-only attachment, so they
  // never have a sectionId either (see document-readers-spec.md's
  // Decisions).
  const WHOLE_DOCUMENT_LINKABLE = new Set(["book", "pdf", "docx", "webpage"]);
  if (!item.sectionId) {
    return WHOLE_DOCUMENT_LINKABLE.has(item.material.materialType) ? `/read/${item.material.slug}` : null;
  }
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
 * per-book thread view. `topicId` narrows it to one topic (Home's
 * CategoryPills filter) — omitted/null means every topic. */
export function useCommunityFeed(sort: CommunityFeedSort, topicId: string | null = null) {
  return useQuery({
    queryKey: communityKeys.feed(sort, topicId),
    queryFn: () =>
      apiFetch<{ items: FeedItem[]; nextCursor: string | null }>(
        `/community/notes?sort=${sort}&limit=20${topicId ? `&topicId=${topicId}` : ""}`
      ),
  });
}
