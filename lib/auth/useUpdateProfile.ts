"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { authKeys } from "@/lib/auth/queryKeys";
import type { ReaderProfile } from "@/lib/api/types";
import type { AvatarColor } from "@/lib/avatar/avatar";

export type ProfileUpdate = Partial<Pick<ReaderProfile, "pseudonym" | "city" | "country" | "emailAnnouncements">> & {
  /** A default avatar color, or `null` to switch back to the uploaded photo. */
  avatarColor?: AvatarColor | null;
};

/** Any `/me` write that answers with the updated profile: seeds it straight
 * into useProfile's cache (same as every other /me mutation), and drops
 * cached reader-profile pages, since a pseudonym or avatar change shows on
 * the reader's own `/@slug`. */
export function useProfileMutation<T>(request: (input: T) => Promise<{ reader: ReaderProfile }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: ({ reader }) => {
      queryClient.setQueryData(authKeys.me, reader);
      queryClient.invalidateQueries({ queryKey: ["readers"] });
    },
  });
}

/** `PATCH /api/auth/me` — account settings' Save and avatar picker. A taken
 * pseudonym comes back as a 409 with `field: "pseudonym"` — read it with
 * fieldError. */
export function useUpdateProfile() {
  return useProfileMutation((update: ProfileUpdate) =>
    apiFetch<{ reader: ReaderProfile }>("/auth/me", { method: "PATCH", json: update })
  );
}
