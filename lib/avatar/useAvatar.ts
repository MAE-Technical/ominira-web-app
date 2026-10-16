"use client";

import { apiFetch } from "@/lib/api/client";
import { useProfileMutation } from "@/lib/auth/useUpdateProfile";
import type { ReaderProfile } from "@/lib/api/types";

/** Uploads the already-cropped image (cropToAvatar) straight to R2 — `POST
 * /api/auth/me/avatar` signs, `PUT` selects it. Picking a default color goes
 * through useUpdateProfile's `avatarColor`. */
export function useUploadAvatar() {
  return useProfileMutation(async (blob: Blob) => {
    const { key, uploadUrl } = await apiFetch<{ key: string; uploadUrl: string }>("/auth/me/avatar", {
      json: { contentType: blob.type, size: blob.size },
    });
    const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": blob.type } });
    if (!put.ok) throw new Error("Could not upload photo.");
    return apiFetch<{ reader: ReaderProfile }>("/auth/me/avatar", { method: "PUT", json: { key } });
  });
}
