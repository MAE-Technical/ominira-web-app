"use client";

/** A bare YouTube-URL note's own preview (NoteContent) — no fetched
 * metadata yet (a real thumbnail/title/duration needs a server-side
 * fetch), so this renders as just a source + generic title line, no image
 * slot. Self-contained — see LinkPreview's doc comment on why these don't
 * share scaffolding. */
export function VideoPreview() {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-sm border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2.5">
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-app-text-muted)]">
        YouTube
      </span>
      <span className="truncate text-[13px] font-bold text-[var(--color-app-text)]">YouTube video</span>
    </div>
  );
}
