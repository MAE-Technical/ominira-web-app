"use client";

import { useCurrentReaders } from "@/lib/materials/useCurrentReaders";
import { useSessionStore } from "@/stores/session-store";

// The social rail's (NotesFeedFab) presence language — who's here and how.

export type Live = "read" | "listen";

const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const compact = (n: number) => compactFormat.format(n);

export const notesLabel = (n: number) => `${compact(n)} ${n === 1 ? "note" : "notes"}`;

/** Everyone else in this material right now, as of opening it. The display
 * list is capped server-side; `count` is the real number. */
export function usePresence(materialId: string) {
  const readerId = useSessionStore((s) => s.readerId);
  const { data, isFetched } = useCurrentReaders(materialId);
  const all = data?.readers ?? [];
  const others = all.filter((r) => r.readerId !== readerId);
  const count = Math.max(others.length, (data?.totalCount ?? 0) - (all.length - others.length));
  return { others, count, anyReading: others.some((r) => r.mode === "read"), isFetched };
}

/** The brand "live" dot with a ping ripple behind it — positioned by the
 * caller (always `absolute` on an avatar). */
export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex h-2.5 w-2.5 ${className}`}>
      <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
      <span className="relative h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-[var(--reader-surface)]" />
    </span>
  );
}

/** Sits on an avatar: a pinging dot for reading, an equaliser for listening. */
export function LiveBadge({ live, className = "" }: { live: Live; className?: string }) {
  if (live === "read") return <LiveDot className={className} />;
  return (
    <span
      aria-hidden="true"
      className={`flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-500 text-white ring-2 ring-[var(--reader-surface)] ${className}`}
    >
      <Equalizer />
    </span>
  );
}

/** Inline beside text — the same signal as LiveBadge, unringed. */
export function LiveMark({ live }: { live: Live }) {
  if (live === "listen")
    return (
      <span aria-hidden="true" className="flex-none text-brand-500">
        <Equalizer />
      </span>
    );
  return (
    <span aria-hidden="true" className="relative flex h-2 w-2 flex-none">
      <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
      <span className="relative h-2 w-2 rounded-full bg-brand-500" />
    </span>
  );
}

function Equalizer() {
  return (
    <span className="reader-eq">
      <i />
      <i />
      <i />
    </span>
  );
}

