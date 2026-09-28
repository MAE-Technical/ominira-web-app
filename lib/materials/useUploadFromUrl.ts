"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { UploadStage, UploadedBook } from "./useUploadBook";

/**
 * The "paste a link" counterpart to `useUploadBook` — same `{ upload, stage,
 * error, reset }` shape and same `UploadedBook` result, so both entry points
 * (HomeComposer's "add a book" file picker and this one) can share a single
 * post-creation attach step, per document-readers-spec.md § 4 ("no new
 * attach mechanism"). Unlike a file upload there's no client-side
 * parse/validate stage — the server does the entire fetch+Readability
 * extraction itself (§ 4), so this only ever reports "uploading" before
 * "done"/"error".
 */
export function useUploadFromUrl() {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (
      url: string,
      opts: { visibility?: "personal" | "public"; onStage?: (stage: UploadStage) => void } = {}
    ): Promise<UploadedBook> => {
      const report = (next: UploadStage) => {
        setStage(next);
        opts.onStage?.(next);
      };
      setError(null);
      report("uploading");
      try {
        const result = await apiFetch<UploadedBook>("/materials/from-url", {
          method: "POST",
          json: { url, visibility: opts.visibility ?? "personal" },
        });
        report("done");
        return result;
      } catch (err) {
        report("error");
        setError(err instanceof Error ? err.message : "Could not add this link.");
        throw err;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
  }, []);

  return { upload, stage, error, reset };
}
