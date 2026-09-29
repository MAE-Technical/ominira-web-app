"use client";

import { apiFetch } from "@/lib/api/client";
import { useProfileMutation } from "@/lib/auth/useUpdateProfile";
import type { ReaderProfile } from "@/lib/api/types";

/** `POST /api/auth/me/avatar` — the already-cropped image (cropToAvatar).
 * Picking a default color goes through useUpdateProfile's `avatarColor`. */
export function useUploadAvatar() {
  return useProfileMutation((blob: Blob) =>
    apiFetch<{ reader: ReaderProfile }>("/auth/me/avatar", {
      method: "POST",
      body: blob,
      headers: { "Content-Type": blob.type },
    })
  );
}
