"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { notificationKeys } from "@/lib/notifications/queryKeys";

/** `POST /api/notifications/read` — no `id` marks everything read (the
 * /notifications page's "opened it, badge clears" case); an `id` marks one
 * (tapping a single unread item). Both invalidate the same two queries so
 * the bell badge and the feed's read/unread state never drift apart. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) => apiFetch<{ ok: true }>("/notifications/read", { json: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
}
