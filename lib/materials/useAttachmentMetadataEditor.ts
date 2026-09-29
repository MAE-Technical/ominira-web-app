"use client";

import { useRef } from "react";
import { apiFetch } from "@/lib/api/client";
import type { CoverSource } from "@/lib/materials/image";

type MetadataEdit = {
  title?: string;
  author?: string;
  visibility?: "personal" | "public";
  categories?: string[];
  coverSource?: CoverSource;
};

/**
 * Shared save path behind the attachment preview's editable title/author
 * fields (HomeComposer and AddBookModal both use this — see
 * lib/materials/useUploadBook.ts's `onMetadata` doc comment for why editing
 * doesn't change what the in-flight upload itself sends). A reader can
 * start editing the moment the parsed guess appears, before `materialId`
 * even exists (upload is still "parsing"/"uploading") — an edit made then is
 * queued per-file and flushed the instant the caller reports the real
 * `materialId`, rather than the input being disabled until upload finishes.
 */
export function useAttachmentMetadataEditor() {
  const pendingRef = useRef(new Map<File, MetadataEdit>());

  function commit(file: File, materialId: string | undefined, edit: MetadataEdit) {
    if (!materialId) {
      pendingRef.current.set(file, { ...pendingRef.current.get(file), ...edit });
      return;
    }
    // Best-effort — the caller's own local state already reflects the edit
    // optimistically, same as every other field this hook commits. Logged
    // rather than fully silent, so a real failure (auth, validation, a
    // dropped connection) is at least visible in devtools instead of
    // looking like the edit was accepted but silently never persisted.
    apiFetch(`/materials/${materialId}`, { method: "PATCH", json: edit }).catch((err) =>
      console.error(`Could not save material ${materialId}:`, err)
    );
  }

  // Called once a still-in-flight attachment's upload resolves — applies
  // whatever the reader edited while `materialId` wasn't known yet.
  function flushPending(file: File, materialId: string) {
    const pending = pendingRef.current.get(file);
    if (!pending) return;
    pendingRef.current.delete(file);
    apiFetch(`/materials/${materialId}`, { method: "PATCH", json: pending }).catch((err) =>
      console.error(`Could not save material ${materialId}:`, err)
    );
  }

  function forget(file: File) {
    pendingRef.current.delete(file);
  }

  return { commit, flushPending, forget };
}
