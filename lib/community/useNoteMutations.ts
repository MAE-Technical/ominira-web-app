"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { materialKeys } from "@/lib/materials/queryKeys";
import { communityKeys } from "@/lib/community/queryKeys";
import { bookmarkKeys } from "@/lib/bookmarks/useBookmarks";
import { makeTempId } from "@/lib/api/optimisticId";
import { useProfile } from "@/lib/auth/useProfile";
import { useSessionStore } from "@/stores/session-store";
import type { AnnotationRange, Note, NoteContent, NoteVisibility } from "@/lib/api/types";

/** A brand-new top-level note is the one write left to invalidate-and-
 * refetch on these two views (the book details page's community-notes tab —
 * every sort variant, see notesFeedPrefix — and every sort of the global
 * home feed): whether it newly qualifies, disqualifies, or where it sorts
 * to is a server call a client-side guess would get wrong often enough not
 * to bother. Everything else that touches a note already showing in these
 * feeds — a reply landing on an existing thread, an edit, a delete, a
 * reaction — is patched directly instead (see patch*InFeeds below), since
 * none of those carry that same qualify/sort uncertainty. This material's
 * own note list (materialKeys.notes) is always patched directly regardless
 * — see each mutation below. */
function invalidateFanoutQueries(queryClient: QueryClient, materialId: string | null) {
  if (materialId) queryClient.invalidateQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
  queryClient.invalidateQueries({ queryKey: communityKeys.feedPrefix });
}

type ReactableFeedItem = { note: Note; replies: Note[] };
type ReactableFeedPage = { items: ReactableFeedItem[]; nextCursor: string | null };

function flipReaction(note: Note): Note {
  return { ...note, reactedByMe: !note.reactedByMe, reactionCount: note.reactionCount + (note.reactedByMe ? -1 : 1) };
}

/** No counter to move alongside it, unlike flipReaction — a bookmark is
 * private, so the flag is the whole of its state. */
function flipBookmark(note: Note): Note {
  return { ...note, bookmarkedByMe: !note.bookmarkedByMe };
}

/** Shared plumbing for every direct feed patch below: runs `patchItem` over
 * every home-feed sort and every book-notes-tab sort for `materialId`.
 * Returning `null` from `patchItem` drops that item from the page (a
 * deleted root note); returning the item unchanged is a no-op for pages
 * that don't contain the note in question. */
function patchFeeds(
  queryClient: QueryClient,
  materialId: string | null,
  patchItem: (item: ReactableFeedItem) => ReactableFeedItem | null
) {
  const patchPage = (old: ReactableFeedPage | undefined) =>
    old && {
      ...old,
      items: old.items.flatMap((item) => {
        const patched = patchItem(item);
        return patched ? [patched] : [];
      }),
    };
  queryClient.setQueriesData<ReactableFeedPage>({ queryKey: communityKeys.feedPrefix }, patchPage);
  if (materialId) queryClient.setQueriesData<ReactableFeedPage>({ queryKey: materialKeys.notesFeedPrefix(materialId) }, patchPage);
}

/** A reply landing on a thread that's already present in these feeds (home
 * feed items ship their replies inline — lib/community/feed.ts) shows up in
 * both immediately, same as it does in materialKeys.notes. No-ops on pages
 * that don't have `rootNoteId` as one of their items (e.g. it isn't public,
 * or hasn't loaded on this page) — that's still covered by
 * invalidateFanoutQueries in onSuccess/onError. */
function addReplyToFeeds(queryClient: QueryClient, materialId: string | null, rootNoteId: string, reply: Note) {
  patchFeeds(queryClient, materialId, (item) =>
    item.note.id === rootNoteId && !item.replies.some((r) => r.id === reply.id)
      ? { ...item, replies: [...item.replies, reply] }
      : item
  );
}

/** Patches `noteId` (root or reply) in place wherever it appears. */
function updateNoteInFeeds(queryClient: QueryClient, materialId: string | null, noteId: string, patch: Partial<Note>) {
  const applyTo = (n: Note) => (n.id === noteId ? { ...n, ...patch } : n);
  patchFeeds(queryClient, materialId, (item) => ({ ...item, note: applyTo(item.note), replies: item.replies.map(applyTo) }));
}

/** Prepends a brand-new top-level post straight into every already-loaded
 * "recent"-sort feed page it actually belongs on — "top"/"trending" are
 * left to invalidateFanoutQueries (see that function's own doc comment for
 * why: an existing note's rank there is a server call, not a guess), but
 * "recent" for a just-created post is deterministic — it's newer than
 * everything else on the page, so it always sorts first. Matched against
 * each page's own `topicId` (communityKeys.feed's key shape) — the "All"
 * page (`topicId: null`) always gets it, a specific-topic page only if the
 * post was tagged under that topic. */
function addNewNoteToFeeds(queryClient: QueryClient, topicIds: string[], item: ReactableFeedItem) {
  for (const [key, data] of queryClient.getQueriesData<ReactableFeedPage>({ queryKey: communityKeys.feedPrefix })) {
    if (!data) continue;
    const [, , , sort, topicId] = key as [string, string, string, string, string | null];
    if (sort !== "recent") continue;
    if (topicId && !topicIds.includes(topicId)) continue;
    if (data.items.some((existing) => existing.note.id === item.note.id)) continue;
    queryClient.setQueryData<ReactableFeedPage>(key, { ...data, items: [item, ...data.items] });
  }
}

/** Removes `noteId` from these feeds — the whole item if it was a root
 * note (matching the server's own parent_id cascade, which means any of
 * its replies are gone too), or just the one reply. */
function removeNoteFromFeeds(queryClient: QueryClient, materialId: string | null, noteId: string) {
  patchFeeds(queryClient, materialId, (item) =>
    item.note.id === noteId ? null : { ...item, replies: item.replies.filter((r) => r.id !== noteId) }
  );
}

/** Patches `noteId` (root or reply) wherever it appears across every home
 * feed sort and every book-notes-tab sort for `materialId`. Home feed items
 * ship replies inline (lib/community/feed.ts), so a reaction on a reply
 * needs the same find-in-either-note-or-replies check useToggleReaction
 * already does for materialKeys.notes. */
function patchReactionInFeeds(queryClient: QueryClient, materialId: string | null, noteId: string) {
  patchFeeds(queryClient, materialId, (item) =>
    item.note.id === noteId
      ? { ...item, note: flipReaction(item.note) }
      : item.replies.some((r) => r.id === noteId)
        ? { ...item, replies: item.replies.map((r) => (r.id === noteId ? flipReaction(r) : r)) }
        : item
  );
}

/** patchReactionInFeeds' bookmark twin — same root-or-reply search across
 * every home-feed sort and every book-notes-tab sort. */
function patchBookmarkInFeeds(queryClient: QueryClient, materialId: string | null, noteId: string) {
  patchFeeds(queryClient, materialId, (item) =>
    item.note.id === noteId
      ? { ...item, note: flipBookmark(item.note) }
      : item.replies.some((r) => r.id === noteId)
        ? { ...item, replies: item.replies.map((r) => (r.id === noteId ? flipBookmark(r) : r)) }
        : item
  );
}

export type CreateNoteInput = {
  ranges: AnnotationRange[];
  content: NoteContent;
  parentId?: string;
  visibility?: NoteVisibility;
  /** A thread root's chosen topics — required for a discussion post
   * (ignored, like `threadType`, once `parentId` is set). */
  topicIds?: string[];
  /** "discussion" — HomeComposer's book-less (or book_share-attached)
   * top-level posts; see POST /api/community/notes' own doc comment. */
  threadType?: "discussion";
};

/** Reads/writes this material's own note list (materialKeys.notes) — a
 * no-op pair when `materialId` is null, since a book-less discussion post
 * has no such per-material list to sync (nothing else ever reads one for
 * it; the home/profile feeds below are patched separately, regardless of
 * `materialId`). Centralizes that null-guard so every mutation below stays
 * a straight-line read of it instead of repeating `if (materialId)` at
 * each of its own three or four touch points. */
function localNotesCache(queryClient: QueryClient, materialId: string | null) {
  const key = materialId ? materialKeys.notes(materialId) : null;
  return {
    cancel: () => (key ? queryClient.cancelQueries({ queryKey: key }) : Promise.resolve()),
    get: (): Note[] | undefined => (key ? queryClient.getQueryData<Note[]>(key) : undefined),
    set: (updater: (old: Note[]) => Note[]) => {
      if (key) queryClient.setQueryData<Note[]>(key, (old = []) => updater(old));
    },
    restore: (previous: Note[] | undefined) => {
      if (key && previous) queryClient.setQueryData(key, previous);
    },
  };
}

/** `POST /api/community/notes` — creates a top-level note or (with
 * `parentId`) a reply; the server resolves `parentId` to the thread's true
 * root and stamps `replyingToId` itself (api-spec.md), so callers never have
 * to enforce the two-tier-flat rule. Shows the note the instant it's saved:
 * `onMutate` inserts a temp row straight into this material's own note list
 * (materialKeys.notes(materialId), fed to useAnnotations/NotesSidebar/the
 * book-wide feed — see invalidateFanoutQueries above for the two views that
 * stay a refetch instead). The temp row resolves its own
 * parentId/replyingToId by checking whether the entry being replied to is
 * itself a reply, mirroring the server's own rule closely enough to render
 * in the right spot immediately; `onSuccess` swaps it for the real row. */
export function useCreateNote(materialId: string | null) {
  const queryClient = useQueryClient();
  const readerId = useSessionStore((s) => s.readerId);
  const { data: profile } = useProfile();
  const cache = localNotesCache(queryClient, materialId);
  return useMutation({
    mutationFn: (input: CreateNoteInput) => apiFetch<Note>("/community/notes", { json: { materialId, ...input } }),
    onMutate: async (input) => {
      await cache.cancel();
      const previous = cache.get();
      const tempId = makeTempId();
      const now = new Date().toISOString();
      const target = input.parentId ? previous?.find((n) => n.id === input.parentId) : undefined;
      const rootId = target?.parentId ?? input.parentId ?? null;
      const optimistic: Note = {
        id: tempId,
        materialId,
        author: {
          readerId: readerId ?? "",
          pseudonym: profile?.pseudonym ?? "",
          city: profile?.city ?? null,
          avatar: profile?.avatar ?? null,
        },
        ranges: input.ranges,
        parentId: rootId,
        replyingToId: target?.parentId ? input.parentId! : null,
        content: input.content,
        visibility: input.visibility ?? "public",
        reactionCount: 0,
        reactedByMe: false,
        bookmarkedByMe: false,
        topicName: target?.topicName ?? null,
        topicSlug: target?.topicSlug ?? null,
        topicNames: target?.topicNames ?? [],
        topics: target?.topics ?? [],
        createdAt: now,
        updatedAt: now,
      };
      cache.set((old) => [...old, optimistic]);
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      if (materialId) await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      if (rootId) {
        // A reply to a thread already present in these feeds shows up
        // there instantly too.
        addReplyToFeeds(queryClient, materialId, rootId, optimistic);
      } else {
        // A brand-new top-level post (HomeComposer, NotesFeedFab) shows up
        // at the top of the "recent" home feed right away too — see
        // addNewNoteToFeeds' own doc comment for why only "recent" and why
        // this is safe to guess, unlike an existing note's rank on "top"/
        // "trending". onSuccess still swaps this temp item for the real
        // one below, same as every other optimistic write here.
        addNewNoteToFeeds(queryClient, input.topicIds ?? [], { note: optimistic, replies: [] });
      }
      return { previous, tempId };
    },
    onError: (_err, _input, context) => {
      cache.restore(context?.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: (created, _input, context) => {
      cache.set((old) => old.map((n) => (context && n.id === context.tempId ? created : n)));
      invalidateFanoutQueries(queryClient, materialId);
    },
  });
}

/** `PATCH /api/community/notes/{noteId}` — patches the local row in place
 * immediately; a failure restores the pre-edit content (see
 * useCreateNote's doc comment for the same onMutate/onError shape). */
export function useUpdateNote(materialId: string | null) {
  const queryClient = useQueryClient();
  const cache = localNotesCache(queryClient, materialId);
  return useMutation({
    mutationFn: ({ noteId, ...input }: { noteId: string; content?: NoteContent; visibility?: NoteVisibility }) =>
      apiFetch<Note>(`/community/notes/${noteId}`, { method: "PATCH", json: input }),
    onMutate: async ({ noteId, ...input }) => {
      await cache.cancel();
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      if (materialId) await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      const previous = cache.get();
      const now = new Date().toISOString();
      cache.set((old) => old.map((n) => (n.id === noteId ? { ...n, ...input, updatedAt: now } : n)));
      updateNoteInFeeds(queryClient, materialId, noteId, { ...input, updatedAt: now });
      return { previous };
    },
    onError: (_err, _input, context) => {
      cache.restore(context?.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: (updated, { noteId }) => {
      cache.set((old) => old.map((n) => (n.id === noteId ? updated : n)));
      invalidateFanoutQueries(queryClient, materialId);
    },
  });
}

/** `DELETE /api/community/notes/{noteId}` — removes the row (and, matching
 * the server's own `parent_id` cascade, its locally-cached replies) from
 * the cache immediately; a failure restores all of it. */
export function useDeleteNote(materialId: string | null) {
  const queryClient = useQueryClient();
  const cache = localNotesCache(queryClient, materialId);
  return useMutation({
    mutationFn: (noteId: string) => apiFetch<void>(`/community/notes/${noteId}`, { method: "DELETE" }),
    onMutate: async (noteId) => {
      await cache.cancel();
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      if (materialId) await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      const previous = cache.get();
      cache.set((old) => old.filter((n) => n.id !== noteId && n.parentId !== noteId));
      removeNoteFromFeeds(queryClient, materialId, noteId);
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      cache.restore(context?.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: () => invalidateFanoutQueries(queryClient, materialId),
  });
}

/** `POST /api/community/notes/{noteId}/reactions` — toggle, not add-only.
 * Flips the local row immediately, in every view showing it (this
 * material's own note list, the home feed, and the book-notes tab — see
 * patchReactionInFeeds' doc comment for why reactions get this while
 * create/edit/delete don't); a failure flips materialKeys.notes back and
 * refetches the two feeds to discard whatever the optimistic patch did
 * there rather than trying to hand-compute the exact inverse in each one. */
export function useToggleReaction(materialId: string | null) {
  const queryClient = useQueryClient();
  const cache = localNotesCache(queryClient, materialId);
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<{ reactedByMe: boolean; reactionCount: number }>(`/community/notes/${noteId}/reactions`, {
        method: "POST",
      }),
    onMutate: async (noteId) => {
      await cache.cancel();
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      if (materialId) await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      const previous = cache.get();
      cache.set((old) => old.map((n) => (n.id === noteId ? flipReaction(n) : n)));
      patchReactionInFeeds(queryClient, materialId, noteId);
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      cache.restore(context?.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: (result, noteId) => {
      cache.set((old) => old.map((n) => (n.id === noteId ? { ...n, ...result } : n)));
      invalidateFanoutQueries(queryClient, materialId);
    },
  });
}

/** `POST /api/bookmarks` for a post — useToggleReaction's private twin,
 * and deliberately its exact shape (optimistic flip in this material's own
 * note list plus both feeds, invalidate-and-refetch on failure) rather
 * than anything cleverer: the two controls sit side by side in the same
 * action row, so they have to feel identical under the same flaky network.
 *
 * Unlike the reaction, this also invalidates the Saved shelf — a post
 * bookmarked here has to appear (or vanish) there, and reconstructing its
 * full FeedItem client-side to insert by hand isn't worth it for a list
 * the reader usually isn't looking at. */
export function useToggleNoteBookmark(materialId: string | null) {
  const queryClient = useQueryClient();
  const cache = localNotesCache(queryClient, materialId);
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<{ bookmarked: boolean }>("/bookmarks", { json: { targetType: "post", targetId: noteId } }),
    onMutate: async (noteId) => {
      await cache.cancel();
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      if (materialId) await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      const previous = cache.get();
      cache.set((old) => old.map((n) => (n.id === noteId ? flipBookmark(n) : n)));
      patchBookmarkInFeeds(queryClient, materialId, noteId);
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      cache.restore(context?.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: (result, noteId) => {
      const patch = { bookmarkedByMe: result.bookmarked };
      cache.set((old) => old.map((n) => (n.id === noteId ? { ...n, ...patch } : n)));
      updateNoteInFeeds(queryClient, materialId, noteId, patch);
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.saved("post") });
    },
  });
}
