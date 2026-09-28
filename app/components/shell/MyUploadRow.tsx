"use client";

import { useState } from "react";
import BookListRow from "./BookListRow";
import type { MaterialSummary } from "@/lib/api/types";
import { apiFetch } from "@/lib/api/client";

/**
 * Wraps BookListRow with the personal <-> public toggle from
 * reader-uploads-spec.md § 3 — the toggle button is a sibling of the row's
 * own `<Link>`, never nested inside it (an interactive element inside an
 * `<a>` is invalid HTML and would double-fire on click).
 */
export default function MyUploadRow({
  material,
  onVisibilityChange,
}: {
  material: MaterialSummary;
  onVisibilityChange: (id: string, visibility: "personal" | "public") => void;
}) {
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = material.visibility === "public" ? "personal" : "public";
    setPending(true);
    try {
      await apiFetch(`/materials/${material.id}/visibility`, { method: "PATCH", json: { visibility: next } });
      onVisibilityChange(material.id, next);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <BookListRow material={material} />
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Toggle whether other readers can find this in the catalog"
        className="flex-none cursor-pointer rounded-full border border-[var(--reader-border)] bg-[var(--reader-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {material.visibility === "public" ? "Public" : "Personal"}
      </button>
    </div>
  );
}
