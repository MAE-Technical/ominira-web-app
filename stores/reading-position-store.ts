import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useSessionStore, isSessionValid } from "@/stores/session-store";
import { isLocator, isReaderMode, type Locator, type ReaderMode } from "@/lib/reader/locator";
import type { CurrentReadingEntry } from "@/lib/api/types";

/**
 * Resume position within one material, in any format — see
 * lib/reader/locator.ts for why `locator` is a tagged union rather than the
 * EPUB `{sectionId, passageIndex}` pair this used to be.
 *
 * `audioTimeMs` is only meaningful while `mode === "listen"`, and only set
 * once a clip has actually played; absent it, listen-mode resume falls back
 * to the locator's own start. `mode` is persisted explicitly rather than
 * inferred from `audioTimeMs`'s presence — a format that grows listening
 * support without a per-clip offset would otherwise be indistinguishable
 * from plain reading.
 *
 * `progressPercent` lives here too (not in a parallel map keyed by
 * materialId): it's derived from the locator at write time by whoever has
 * the material's `LocatorScale` in hand, and one record per material means
 * one write, one merge rule and one thing for consumers to select.
 *
 * This stays its own `persist`-backed store rather than TanStack Query state
 * (as highlights/notes are) because it needs instant, synchronous,
 * network-independent reads and writes on every scroll tick.
 */
export type Position = {
  locator: Locator;
  mode: ReaderMode;
  audioTimeMs?: number;
  /** 0-100, computed by the writer via `locatorPercent`. Never 100 on its own
   * — see `positionPercent`, which is what UI should display. */
  progressPercent: number;
  /** When this reader explicitly marked the material finished (ISO), or null.
   * Kept beside the position rather than replacing it, so un-finishing
   * restores the honest percentage and "Read again" still has a locator to
   * resume from. Only ever written by `setFinished`, never by `setPosition` —
   * the same separation the DB column has, for the same reason: a debounced
   * scroll write must not be able to clear a deliberate act. */
  finishedAt: string | null;
  /** This device's own clock, stamped on every local write — compared
   * against `reader_activities.updated_at` (the server's clock) by
   * `hydrateFromRemote` to decide which side genuinely has the more recent
   * position, rather than trusting whichever wrote here first. */
  updatedAt: string;
};

/** What `setPosition` is given: the record minus the bookkeeping it stamps
 * (`updatedAt`) and the completion it must never touch (`finishedAt`). */
export type PositionInput = Omit<Position, "updatedAt" | "finishedAt">;

// Debounced per materialId — the same cadence setPosition's callers
// (useProgressCommit's settle timer, the narration engine) already
// self-throttle at, so this is a second, coarser debounce specifically
// around the network write, not a replacement for those local ones.
// Module-level (not store state) since it's pure bookkeeping for the flush
// timer, never rendered.
const SYNC_DEBOUNCE_MS = 1500;
const pendingSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

const PERSIST_KEY = "ominira-reading-position";

/**
 * The actual network write, shared by the debounced path below and
 * `flushPendingSyncs`. Reads fresh from the store at call time, not
 * whatever value was current when the caller decided to sync — a rapid run
 * of scroll events can reschedule the debounce repeatedly, so only the last
 * position by the time this actually runs should ever go out.
 *
 * `keepalive` lets the request survive the page actually unloading
 * (`fetch`'s own teardown-safe flag, same thing `navigator.sendBeacon` is
 * for, but this needs a PUT with an Authorization header, not sendBeacon's
 * fire-and-forget POST) — used by the pagehide/hidden flush below, where
 * there's no guarantee an ordinary in-flight fetch gets to finish. Goes
 * straight through the browser's own `fetch`, not `apiFetch`: a page
 * that's already being torn down can't afford `apiFetch`'s
 * `ensureFreshSession` refresh round trip, and a request made with a
 * slightly stale token that 401s here is no worse than the request never
 * having been sent at all, which is the status quo this is replacing.
 */
function syncPositionNow(materialId: string, opts: { keepalive?: boolean } = {}) {
  const session = useSessionStore.getState().session;
  if (!session || !isSessionValid(session)) return;
  const position = useReadingPositionStore.getState().positions[materialId];
  if (!position) return;

  const payload = {
    materialId,
    locator: position.locator,
    mode: position.mode,
    audioTimeMs: position.audioTimeMs,
    progressPercent: position.progressPercent,
  };

  if (opts.keepalive) {
    fetch("/api/auth/me/reading-position", {
      method: "PUT",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify(payload),
    }).catch(() => {}); // best-effort, and nothing can await this during teardown anyway
    return;
  }

  apiFetch<void>("/auth/me/reading-position", { method: "PUT", json: payload }).catch((err) => {
    // A dropped position sync isn't worth surfacing to the reader —
    // the local mirror (this store) already has it, so nothing is lost
    // on this device; it just won't have followed them anywhere else
    // yet. Logged for visibility, same as other best-effort syncs.
    if (!(err instanceof ApiError)) console.error("reading-position sync failed", err);
  });
}

function scheduleRemoteSync(materialId: string) {
  const session = useSessionStore.getState().session;
  if (!isSessionValid(session)) return; // no readers row to write to yet

  const existing = pendingSyncTimers.get(materialId);
  if (existing) clearTimeout(existing);
  pendingSyncTimers.set(
    materialId,
    setTimeout(() => {
      pendingSyncTimers.delete(materialId);
      syncPositionNow(materialId);
    }, SYNC_DEBOUNCE_MS)
  );
}

/**
 * Flushes every debounced write still waiting on its `SYNC_DEBOUNCE_MS`
 * timer, immediately and `keepalive`, instead of leaving it to fire later.
 *
 * Without this, `reader_activities` on the server routinely lagged behind
 * `localStorage`: a tab being backgrounded only ever wrote to *this* store,
 * which just restarts the same 1500ms debounce rather than syncing anything —
 * and a real tab close, or a mobile OS suspending a backgrounded tab's
 * timers, routinely won that race, permanently dropping the last write. The
 * DB row was then stuck at whatever *did* land last, which is exactly what
 * made a fresh session/device resume at the top of a chapter instead of
 * wherever the reader had actually got to.
 *
 * Registered once, at module scope, below — this store (localStorage reads/
 * writes, `window`/`document` listeners) is only ever imported client-side.
 */
export function flushPendingSyncs() {
  for (const materialId of pendingSyncTimers.keys()) {
    const timer = pendingSyncTimers.get(materialId);
    if (timer) clearTimeout(timer);
    pendingSyncTimers.delete(materialId);
    syncPositionNow(materialId, { keepalive: true });
  }
}

if (typeof window !== "undefined") {
  // pagehide: the real "reader is leaving" signal (tab close, real
  // navigation away, app backgrounded on iOS) — fires reliably where
  // beforeunload doesn't (bfcache navigations, mobile Safari).
  window.addEventListener("pagehide", flushPendingSyncs);
  // visibilitychange: catches the same "backgrounded" case *before* the
  // OS gets a chance to suspend this tab's timers entirely (the actual
  // failure mode on iOS — a background tab's own setTimeout can simply
  // never fire), which is earlier than pagehide is guaranteed to run.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingSyncs();
  });
}

/** The subset of a server-side activity row this store mirrors. */
export type RemotePosition = Pick<
  CurrentReadingEntry,
  "materialId" | "locator" | "mode" | "audioTimeMs" | "progressPercent" | "finishedAt" | "updatedAt"
>;

type ReadingPositionState = {
  positions: Record<string, Position>;
  hasHydrated: boolean;

  getPosition: (materialId: string) => Position | undefined;
  /** Local write (instant) + a debounced `PUT /api/auth/me/reading-position`
   * (skipped entirely while unauthenticated — see scheduleRemoteSync). */
  setPosition: (materialId: string, position: PositionInput) => void;
  /** Marks a material finished (or un-marks it), locally and on the server.
   * Not debounced and not merged into the position sync: this is a deliberate,
   * one-off act by the reader, and pooling it with scroll writes is exactly
   * how it would get lost or undone. `current` is what to write alongside it
   * when this device has no saved position for the material yet (a reader who
   * opened straight onto the end of a short article, say) — the material still
   * needs a locator for the row to exist at all. A no-op when neither a stored
   * position nor `current` can say where the reader is; nothing sensible could
   * be recorded in that case, and the viewer will have committed one within a
   * scroll or two. */
  setFinished: (materialId: string, finished: boolean, current?: PositionInput) => void;
  /** Forgets this device's position for one material and returns the record
   * it dropped, so a caller offering Undo can hand it straight back to
   * `restorePosition`. Local only — the server row is the caller's to delete
   * (`DELETE /api/auth/me/reading-position`), because only the caller knows
   * whether the reader meant "off my shelf" or just "clear this device". */
  clearPosition: (materialId: string) => Position | undefined;
  /** Puts a record `clearPosition` returned back verbatim — same
   * `updatedAt`, so this loses an Undo race against a genuinely newer
   * position from another device rather than resurrecting a stale one. */
  restorePosition: (materialId: string, position: Position) => void;
  /** Seeds this device's mirror from `GET /api/auth/me/continue-reading` on
   * login/app load — remote wins for any materialId whose own `updatedAt`
   * is newer than this device's local write (or where this device has no
   * local write at all); a materialId this device has written to *more*
   * recently (scrolling just now, before the remote sync round-tripped, or
   * genuinely ahead of another device that hasn't caught up yet) is left
   * alone rather than being stomped back by a now-stale server read. */
  hydrateFromRemote: (entries: RemotePosition[]) => void;
};

/** Shared by `hydrateFromRemote` and `persist`'s own `merge` (see its
 * comment) — the one rule for "which of these two records wins". */
const isNewer = (candidate: { updatedAt: string }, existing: Position | undefined) =>
  !existing || candidate.updatedAt > existing.updatedAt;

/**
 * Reads this device's last-known position for one material straight out of
 * localStorage, synchronously — deliberately bypassing the store's own
 * `persist.rehydrate()` (async even against synchronous localStorage; see
 * `skipHydration`'s own comment) and the network round trip
 * `hasHydrated`/`serverPositionReady` otherwise gate on.
 *
 * This is what lets a viewer mount directly at the *correct* position on
 * first render instead of starting at the beginning and jumping a moment
 * later — both a visible flash and a real race (a state update against a
 * `requestAnimationFrame` scroll, over whatever the DOM had actually
 * committed by then). Reading localStorage directly, before the first paint,
 * has no such race — there's nothing async to wait on.
 *
 * Only ever a same-device optimization: this never sees a fresher position
 * saved from another device (that still needs the real `GET
 * /continue-reading` round trip), so callers that use it for the *initial*
 * render still reconcile against the server once it answers. Best-effort:
 * returns undefined on anything from a disabled/unavailable localStorage
 * (private browsing, SSR), unparsable JSON, or a record whose locator
 * doesn't validate — never throws.
 */
export function readLocalPositionSync(materialId: string): Position | undefined {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { state?: { positions?: Record<string, unknown> } };
    const candidate = parsed.state?.positions?.[materialId];
    return isPosition(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/** Validates a persisted record — `readLocalPositionSync` parses raw JSON
 * itself, and `persist`'s rehydrate can hand back anything a previous
 * release (or a hand-edited profile) left behind. */
function isPosition(value: unknown): value is Position {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isLocator(v.locator) &&
    isReaderMode(v.mode) &&
    typeof v.progressPercent === "number" &&
    (v.finishedAt === null || typeof v.finishedAt === "string") &&
    typeof v.updatedAt === "string"
  );
}

export const useReadingPositionStore = create<ReadingPositionState>()(
  persist(
    (set, get) => ({
      positions: {},
      hasHydrated: false,

      getPosition: (materialId) => get().positions[materialId],
      setPosition: (materialId, position) => {
        set((s) => ({
          positions: {
            ...s.positions,
            // `finishedAt` is carried over rather than taken from the caller —
            // position writers have no business in it (see Position's own
            // comment), and re-reading a finished material shouldn't un-finish
            // it.
            [materialId]: {
              ...position,
              finishedAt: s.positions[materialId]?.finishedAt ?? null,
              updatedAt: new Date().toISOString(),
            },
          },
        }));
        scheduleRemoteSync(materialId);
      },
      setFinished: (materialId, finished, current) => {
        const finishedAt = finished ? new Date().toISOString() : null;
        const existing = get().positions[materialId];
        const base = existing ?? current;
        if (!base) return;
        const position: Position = {
          ...base,
          finishedAt,
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ positions: { ...s.positions, [materialId]: position } }));
        // Straight out, no debounce — and the whole record goes, so the row
        // exists even if nothing had committed a position for this material
        // yet. A failure leaves the local mirror marked and the server not;
        // the next `GET /continue-reading` then un-marks it, which is the
        // honest outcome (nothing was persisted) rather than a silent lie.
        apiFetch<void>("/auth/me/finished", {
          method: "PUT",
          json: {
            materialId,
            finished,
            locator: position.locator,
            mode: position.mode,
            progressPercent: position.progressPercent,
          },
        }).catch((err) => {
          if (!(err instanceof ApiError)) console.error("finished sync failed", err);
        });
      },
      clearPosition: (materialId) => {
        const removed = get().positions[materialId];
        // Kill any debounced write still pending for this material first —
        // otherwise its timer fires a moment later and re-creates the very
        // row the caller is about to DELETE, silently putting the material
        // back on the shelf. (syncPositionNow would in fact bail on the now-
        // missing local record, but only by luck of ordering; cancelling is
        // the guarantee.)
        const timer = pendingSyncTimers.get(materialId);
        if (timer) clearTimeout(timer);
        pendingSyncTimers.delete(materialId);

        if (!removed) return undefined;
        set((s) => {
          const positions = { ...s.positions };
          delete positions[materialId];
          return { positions };
        });
        return removed;
      },
      restorePosition: (materialId, position) => {
        set((s) => (isNewer(position, s.positions[materialId]) ? { positions: { ...s.positions, [materialId]: position } } : s));
      },
      hydrateFromRemote: (entries) =>
        set((s) => {
          const positions = { ...s.positions };
          for (const entry of entries) {
            if (!isNewer(entry, positions[entry.materialId])) continue;
            positions[entry.materialId] = {
              locator: entry.locator,
              mode: entry.mode,
              audioTimeMs: entry.audioTimeMs ?? undefined,
              progressPercent: entry.progressPercent,
              finishedAt: entry.finishedAt,
              updatedAt: entry.updatedAt,
            };
          }
          return { positions };
        }),
    }),
    {
      name: PERSIST_KEY,
      // Bumped when Position stopped being an EPUB-only
      // {sectionId, passageIndex} record (lib/reader/locator.ts), and again
      // when `finishedAt` joined it. Nothing on disk under an older shape is
      // worth translating — a position is
      // re-established by the next few seconds of reading, and the server's
      // own row (migrated properly) re-seeds this mirror on the next
      // `GET /continue-reading` regardless.
      version: 3,
      migrate: () => ({ positions: {} }),
      // Same SSR-hydration-mismatch reasoning as every other client store
      // here — resume and listen mode render on first paint, so they can't
      // read localStorage before the server and the client's first render
      // agree. Rehydrated explicitly post-mount.
      skipHydration: true,
      // Deep-merges rather than the default shallow "persisted state
      // replaces current state": `hydrateFromRemote` (useContinueReading)
      // can populate `positions` in memory *before* this store's own
      // localStorage rehydrate runs (there's no fixed ordering between "the
      // continue-reading response arrived" and "persist.rehydrate()
      // resolved"), and a shallow merge would wipe out any remote-seeded
      // materialId this device's localStorage happens not to have. Per
      // materialId, whichever side has the newer `updatedAt` wins — the
      // common case is localStorage resolving first with hydrateFromRemote
      // correcting it once the network lands, but on the reverse ordering
      // this is what stops a stale on-disk position from stomping a
      // just-arrived, genuinely fresher remote one.
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as { positions?: Record<string, unknown> } | undefined)?.positions ?? {};
        const positions = { ...currentState.positions };
        for (const [materialId, candidate] of Object.entries(persisted)) {
          if (!isPosition(candidate)) continue;
          if (!isNewer(candidate, positions[materialId])) continue;
          positions[materialId] = candidate;
        }
        return { ...currentState, positions };
      },
      onRehydrateStorage: () => () => {
        useReadingPositionStore.setState({ hasHydrated: true });
      },
    }
  )
);
