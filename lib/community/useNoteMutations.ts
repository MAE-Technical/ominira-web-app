"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { materialKeys } from "@/lib/materials/queryKeys";
import { communityKeys } from "@/lib/community/queryKeys";
import { makeTempId } from "@/lib/api/optimisticId";
import { useProfile } from "@/lib/auth/useProfile";
import { useSessionStore } from "@/stores/session-store";
import type { AnnotationRange, Note, NoteContent, NoteVisibility } from "@/lib/api/types";

/** A write can also change two views this material's own note list doesn't
 * cover: the book details page's community-notes tab (every sort variant —
 * see notesFeedPrefix) and every sort of the global home feed (a public
 * top-level note may newly qualify, disqualify, or just reorder). Those two
 * stay invalidate-and-refetch rather than optimistically patched — a
 * client-side guess at re-sorting/re-qualifying would get it wrong often
 * enough not to bother, and neither is what the reader who just wrote this
 * note is looking at. This material's own note list (materialKeys.notes) is
 * patched directly instead — see each mutation below. */
function invalidateFanoutQueries(queryClient: QueryClient, materialId: string) {
  queryClient.invalidateQueries({ queryKey: materialKeys.notesFeedPrefix(materialId) });
  queryClient.invalidateQueries({ queryKey: communityKeys.feedPrefix });
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
      const optimistic: Note = {
        id: tempId,
        materialId,
        author: { readerId: readerId ?? "", pseudonym: profile?.pseudonym ?? "" },
        ranges: input.ranges,
        parentId: target?.parentId ?? input.parentId ?? null,
        replyingToId: target?.parentId ? input.parentId! : null,
        content: input.content,
        visibility: input.visibility ?? "public",
        reactionCount: 0,
        reactedByMe: false,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<Note[]>(key, (old = []) => [...old, optimistic]);
      return { previous, tempId };
    },
    onError: (_err, _input, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
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
      const previous = queryClient.getQueryData<Note[]>(key);
      const now = new Date().toISOString();
      queryClient.setQueryData<Note[]>(key, (old = []) =>
        old.map((n) => (n.id === noteId ? { ...n, ...input, updatedAt: now } : n))
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
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
      const previous = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (old = []) => old.filter((n) => n.id !== noteId && n.parentId !== noteId));
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
    },
    onSuccess: () => invalidateFanoutQueries(queryClient, materialId),
  });
}

/** `POST /api/community/notes/{noteId}/reactions` — toggle, not add-only.
 * Flips the local row immediately; a failure flips it back. */
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
      const previous = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (old = []) =>
        old.map((n) =>
          n.id === noteId
            ? { ...n, reactedByMe: !n.reactedByMe, reactionCount: n.reactionCount + (n.reactedByMe ? -1 : 1) }
            : n
        )
      );
      return { previous };
    },
    onError: (_err, _noteId, context) => {
      if (context) queryClient.setQueryData(materialKeys.notes(materialId), context.previous);
    },
    onSuccess: (result, noteId) => {
      queryClient.setQueryData<Note[]>(materialKeys.notes(materialId), (old = []) =>
        old.map((n) => (n.id === noteId ? { ...n, ...result } : n))
      );
      invalidateFanoutQueries(queryClient, materialId);
    },
  });
}
