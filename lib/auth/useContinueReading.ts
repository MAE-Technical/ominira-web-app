"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { authKeys } from "@/lib/auth/queryKeys";
import { useReadingPositionStore } from "@/stores/reading-position-store";
import type { CurrentReadingEntry, MaterialSummary } from "@/lib/api/types";

/** One `reader_activities` row with its material pre-joined — the shelf's own
 * shape. Everything but `material` is the row itself, so the position fields
 * can't drift from CurrentReadingEntry's definition. */
export type ContinueReadingItem = Omit<CurrentReadingEntry, "materialId"> & { material: MaterialSummary };

/** `GET /api/auth/me/continue-reading` — already sorted (`updatedAt` desc)
 * and enriched with each material's summary server-side, so
 * ContinueReadingRail renders straight off this with no extra per-book
 * lookups or local progress computation of its own. Unauthenticated: no
 * `readers` row to read a shelf from yet, so this simply never fires (the
 * rail renders nothing — see plan.md's "State-layer groundwork"). */
export function useContinueReading() {
  const isAuthenticated = useIsAuthenticated();
  const query = useQuery({
    queryKey: authKeys.continueReading,
    queryFn: () => apiFetch<{ items: ContinueReadingItem[] }>("/auth/me/continue-reading").then((r) => r.items),
    enabled: isAuthenticated,
  });

  // Seeds reading-position-store's local mirror (keyed by materialId) the
  // moment this shelf loads, so any reader who opens a book straight from
  // this rail — or from anywhere else that reads that store — resumes from
  // their real cross-device position, not just whatever this browser has
  // seen before. See reading-position-store.ts's own doc comment: remote
  // never overwrites a fresher local write.
  const items = query.data;
  useEffect(() => {
    if (!items) return;
    useReadingPositionStore.getState().hydrateFromRemote(
      items.map(({ material, ...position }) => ({ materialId: material.id, ...position }))
    );
  }, [items]);

  return query;
}

/**
 * `DELETE /api/auth/me/reading-position` — takes one material off this
 * reader's shelf, clearing both the server row and this device's local
 * mirror of it so the row can't be resurrected by a pending position sync
 * (see `clearPosition`).
 *
 * Deliberately does NOT touch the continue-reading cache. ShelfView keeps
 * the removed item on screen as an inline Undo strip standing exactly where
 * the row was, which it can only do while the item is still in the list it
 * renders from; dropping it here would make the strip's own data disappear
 * from under it. The list is correct again on the next fetch, by which point
 * the server genuinely no longer has the row.
 */
export function useRemoveFromShelf() {
  return useMutation({
    mutationFn: (item: ContinueReadingItem) =>
      apiFetch<void>(`/auth/me/reading-position?materialId=${encodeURIComponent(item.material.id)}`, { method: "DELETE" }),
    onMutate: (item) => {
      useReadingPositionStore.getState().clearPosition(item.material.id);
    },
    onError: (_err, item) => {
      // Put the local mirror back, so a failed delete leaves the reader's
      // progress intact on this device rather than quietly losing it while
      // the server still has the row.
      useReadingPositionStore
        .getState()
        .restorePosition(item.material.id, {
          locator: item.locator,
          mode: item.mode,
          audioTimeMs: item.audioTimeMs ?? undefined,
          progressPercent: item.progressPercent,
          finishedAt: item.finishedAt,
          updatedAt: item.updatedAt,
        });
    },
  });
}

/**
 * The inverse of `useRemoveFromShelf`, for its Undo — re-creates the whole
 * activity row from the item the shelf was already holding.
 *
 * Goes through `PUT /api/auth/me/finished` rather than a new restore route,
 * because `setReaderActivityFinished` already upserts *every* column this
 * needs (locator, mode, progress, finished_at) in one write — it's the only
 * existing endpoint that can re-create a finished row as finished, which a
 * position PUT can't (it never names `finished_at`, by design). The one
 * consequence is a fresh `updated_at`, so an undone book comes back at the
 * top of the shelf rather than in its old slot; that reads as recency, which
 * is what the shelf is sorted by anyway.
 */
export function useRestoreToShelf() {
  return useMutation({
    mutationFn: (item: ContinueReadingItem) =>
      apiFetch<void>("/auth/me/finished", {
        method: "PUT",
        json: {
          materialId: item.material.id,
          finished: Boolean(item.finishedAt),
          locator: item.locator,
          mode: item.mode,
          progressPercent: item.progressPercent,
        },
      }),
    onMutate: (item) => {
      useReadingPositionStore.getState().restorePosition(item.material.id, {
        locator: item.locator,
        mode: item.mode,
        audioTimeMs: item.audioTimeMs ?? undefined,
        progressPercent: item.progressPercent,
        finishedAt: item.finishedAt,
        updatedAt: item.updatedAt,
      });
    },
    onError: (_err, item) => {
      useReadingPositionStore.getState().clearPosition(item.material.id);
    },
  });
}
