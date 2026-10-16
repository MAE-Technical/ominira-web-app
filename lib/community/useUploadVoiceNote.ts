"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

/** Uploads a just-recorded draft straight to R2 (`POST
 * /api/community/voice-notes` signs) and hands back the public URL that
 * should be saved as the note's `content.audioUrl` — never the recorder's own
 * `blob:` URL, which only resolves for this tab's lifetime. */
export function useUploadVoiceNote() {
  return useMutation({
    mutationFn: async (blob: Blob) => {
      const contentType = blob.type || "audio/webm";
      const { uploadUrl, url } = await apiFetch<{ uploadUrl: string; url: string }>("/community/voice-notes", {
        json: { contentType: contentType.split(";")[0], size: blob.size },
      });
      const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
      if (!put.ok) throw new Error("Could not upload voice note.");
      return url;
    },
  });
}
