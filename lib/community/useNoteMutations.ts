"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { materialKeys } from "@/lib/materials/queryKeys";
import { communityKeys } from "@/lib/community/queryKeys";
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
function invalidateFanoutQueries(queryClient: QueryClient, materialId: string) {
  queryClient.invalidateQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
  queryClient.invalidateQueries({ queryKey: communityKeys.feedPrefix });
}

type ReactableFeedItem = { note: Note; replies: Note[] };
type ReactableFeedPage = { items: ReactableFeedItem[]; nextCursor: string | null };

function flipReaction(note: Note): Note {
  return { ...note, reactedByMe: !note.reactedByMe, reactionCount: note.reactionCount + (note.reactedByMe ? -1 : 1) };
}

/** Shared plumbing for every direct feed patch below: runs `patchItem` over
 * every home-feed sort and every book-notes-tab sort for `materialId`.
 * Returning `null` from `patchItem` drops that item from the page (a
 * deleted root note); returning the item unchanged is a no-op for pages
 * that don't contain the note in question. */
function patchFeeds(queryClient: QueryClient, materialId: string, patchItem: (item: ReactableFeedItem) => ReactableFeedItem | null) {
  const patchPage = (old: ReactableFeedPage | undefined) =>
    old && {
      ...old,
      items: old.items.flatMap((item) => {
        const patched = patchItem(item);
        return patched ? [patched] : [];
      }),
    };
  queryClient.setQueriesData<ReactableFeedPage>({ queryKey: communityKeys.feedPrefix }, patchPage);
  queryClient.setQueriesData<ReactableFeedPage>({ queryKey: materialKeys.notesFeedPrefix(materialId) }, patchPage);
}

/** A reply landing on a thread that's already present in these feeds (home
 * feed items ship their replies inline — lib/community/feed.ts) shows up in
 * both immediately, same as it does in materialKeys.notes. No-ops on pages
 * that don't have `rootNoteId` as one of their items (e.g. it isn't public,
 * or hasn't loaded on this page) — that's still covered by
 * invalidateFanoutQueries in onSuccess/onError. */
function addReplyToFeeds(queryClient: QueryClient, materialId: string, rootNoteId: string, reply: Note) {
  patchFeeds(queryClient, materialId, (item) =>
    item.note.id === rootNoteId && !item.replies.some((r) => r.id === reply.id)
      ? { ...item, replies: [...item.replies, reply] }
      : item
  );
}

/** Patches `noteId` (root or reply) in place wherever it appears. */
function updateNoteInFeeds(queryClient: QueryClient, materialId: string, noteId: string, patch: Partial<Note>) {
  const applyTo = (n: Note) => (n.id === noteId ? { ...n, ...patch } : n);
  patchFeeds(queryClient, materialId, (item) => ({ ...item, note: applyTo(item.note), replies: item.replies.map(applyTo) }));
}

/** Removes `noteId` from these feeds — the whole item if it was a root
 * note (matching the server's own parent_id cascade, which means any of
 * its replies are gone too), or just the one reply. */
function removeNoteFromFeeds(queryClient: QueryClient, materialId: string, noteId: string) {
  patchFeeds(queryClient, materialId, (item) =>
    item.note.id === noteId ? null : { ...item, replies: item.replies.filter((r) => r.id !== noteId) }
  );
}

/** Patches `noteId` (root or reply) wherever it appears across every home
 * feed sort and every book-notes-tab sort for `materialId`. Home feed items
 * ship replies inline (lib/community/feed.ts), so a reaction on a reply
 * needs the same find-in-either-note-or-replies check useToggleReaction
 * already does for materialKeys.notes. */
function patchReactionInFeeds(queryClient: QueryClient, materialId: string, noteId: string) {
  patchFeeds(queryClient, materialId, (item) =>
    item.note.id === noteId
      ? { ...item, note: flipReaction(item.note) }
      : item.replies.some((r) => r.id === noteId)
        ? { ...item, replies: item.replies.map((r) => (r.id === noteId ? flipReaction(r) : r)) }
        : item
  );
}

export type CreateNoteInput = {
  ranges: AnnotationRange[];
  content: NoteContent;
  parentId?: string;
  visibility?: NoteVisibility;
};

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
export function useCreateNote(materialId: string) {
  const queryClient = useQueryClient();
  const readerId = useSessionStore((s) => s.readerId);
  const { data: profile } = useProfile();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => apiFetch<Note>("/community/notes", { json: { materialId, ...input } }),
    onMutate: async (input) => {
      const key = materialKeys.notes(materialId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Note[]>(key);
      const tempId = makeTempId();
      const now = new Date().toISOString();
      const target = input.parentId ? previous?.find((n) => n.id === input.parentId) : undefined;
      const rootId = target?.parentId ?? input.parentId ?? null;
      const optimistic: Note = {
        id: tempId,
        materialId,
        author: { readerId: readerId ?? "", pseudonym: profile?.pseudonym ?? "", city: profile?.city ?? null },
        ranges: input.ranges,
        parentId: rootId,
        replyingToId: target?.parentId ? input.parentId! : null,
        content: input.content,
        visibility: input.visibility ?? "public",
        reactionCount: 0,
        reactedByMe: false,
        topicName: target?.topicName ?? null,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<Note[]>(key, (old = []) => [...old, optimistic]);
      // A reply to a thread already present in these feeds shows up there
      // instantly too — a brand-new top-level note still waits for
      // invalidateFanoutQueries (see its doc comment for why).
      if (rootId) {
        await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
        await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
        addReplyToFeeds(queryClient, materialId, rootId, optimistic);
      }
      return { previous, tempId };
    },
    onError: (_err, _input, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: (created, _input, context) => {
      queryClient.setQueryData<Note[]>(materialKeys.notes(materialId), (old = []) =>
        old.map((n) => (context && n.id === context.tempId ? created : n))
      );
      invalidateFanoutQueries(queryClient, materialId);
    },
  });
}

/** `PATCH /api/community/notes/{noteId}` — patches the local row in place
 * immediately; a failure restores the pre-edit content (see
 * useCreateNote's doc comment for the same onMutate/onError shape). */
export function useUpdateNote(materialId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, ...input }: { noteId: string; content?: NoteContent; visibility?: NoteVisibility }) =>
      apiFetch<Note>(`/community/notes/${noteId}`, { method: "PATCH", json: input }),
    onMutate: async ({ noteId, ...input }) => {
      const key = materialKeys.notes(materialId);
      await queryClient.cancelQueries({ queryKey: key });
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      const previous = queryClient.getQueryData<Note[]>(key);
      const now = new Date().toISOString();
      queryClient.setQueryData<Note[]>(key, (old = []) =>
        old.map((n) => (n.id === noteId ? { ...n, ...input, updatedAt: now } : n))
      );
      updateNoteInFeeds(queryClient, materialId, noteId, { ...input, updatedAt: now });
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: (updated, { noteId }) => {
      queryClient.setQueryData<Note[]>(materialKeys.notes(materialId), (old = []) =>
        old.map((n) => (n.id === noteId ? updated : n))
      );
      invalidateFanoutQueries(queryClient, materialId);
    },
  });
}

/** `DELETE /api/community/notes/{noteId}` — removes the row (and, matching
 * the server's own `parent_id` cascade, its locally-cached replies) from
 * the cache immediately; a failure restores all of it. */
export function useDeleteNote(materialId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => apiFetch<void>(`/community/notes/${noteId}`, { method: "DELETE" }),
    onMutate: async (noteId) => {
      const key = materialKeys.notes(materialId);
      await queryClient.cancelQueries({ queryKey: key });
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      const previous = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (old = []) => old.filter((n) => n.id !== noteId && n.parentId !== noteId));
      removeNoteFromFeeds(queryClient, materialId, noteId);
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
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
export function useToggleReaction(materialId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<{ reactedByMe: boolean; reactionCount: number }>(`/community/notes/${noteId}/reactions`, {
        method: "POST",
      }),
    onMutate: async (noteId) => {
      const key = materialKeys.notes(materialId);
      await queryClient.cancelQueries({ queryKey: key });
      await queryClient.cancelQueries({ queryKey: communityKeys.feedPrefix });
      await queryClient.cancelQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
      const previous = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (old = []) => old.map((n) => (n.id === noteId ? flipReaction(n) : n)));
      patchReactionInFeeds(queryClient, materialId, noteId);
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
      invalidateFanoutQueries(queryClient, materialId);
    },
    onSuccess: (result, noteId) => {
      queryClient.setQueryData<Note[]>(materialKeys.notes(materialId), (old = []) =>
        old.map((n) => (n.id === noteId ? { ...n, ...result } : n))
      );
      invalidateFanoutQueries(queryClient, materialId);
    },
  });
}
