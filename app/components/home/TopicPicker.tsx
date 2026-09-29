"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Tag, X } from "lucide-react";

/**
 * The minimal shape either caller needs — community topics
 * (lib/community/useTopics.ts's `Topic`, which also carries `slug`/
 * `post_count`) or the library composer's plain category strings
 * (AddBookModal maps each one to `{ id: category, name: category }`, a
 * category being its own identifier). Both structurally satisfy this, so
 * one picker UI serves two different underlying concepts without either
 * caller reimplementing the chips/popover interaction — see AddBookModal's
 * own doc comment for why topics and categories stay separate data even
 * though they now share this one picker.
 */
export type PickableItem = { id: string; name: string };

/**
 * `selectedIds`'s own order is the only place "which topic is the default"
 * lives — the first id is it, full stop, mirroring how post_topics rows are
 * inserted (see lib/community/notes.ts's insertPostTopics) and read back
 * (getTopicNamesForPosts orders by created_at). Toggling a topic on always
 * appends it to the end (never disturbs the existing default); removing
 * the current default promotes whichever was picked next. That's what the
 * "Default" badge on the first chip is for — it has to stay legible which
 * one a reader is about to bump into that role before they remove it.
 *
 * Callers with no such default concept (the category picker) just never
 * read anything into that ordering — it's harmless, not meaningful, for
 * them.
 */
function resolveSelectedTopics(topics: PickableItem[], selectedIds: string[]): PickableItem[] {
  return selectedIds.map((id) => topics.find((t) => t.id === id)).filter((t): t is PickableItem => Boolean(t));
}

/**
 * The selected topics themselves — rendered inline in the write area
 * (alongside the link/book attachment previews), same "what you attached
 * shows where you're writing, not buried in the toolbar" placement those
 * get. TopicPickerTrigger (below) is the separate toolbar button that
 * opens the picker to add to this list.
 */
export function TopicChips({
  topics,
  selectedIds,
  onChange,
}: {
  topics: PickableItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selectedTopics = resolveSelectedTopics(topics, selectedIds);
  if (selectedTopics.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedTopics.map((topic, i) => (
        <span
          key={topic.id}
          className={`flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1.5 text-[12px] font-bold ${
            i === 0
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-[var(--reader-border)] bg-[var(--reader-surface-hover)] text-[var(--reader-text)]"
          }`}
        >
          {/* {i === 0 && <span className="text-[9px] font-bold uppercase tracking-wide text-brand-500">Current ·</span>} */}
          {topic.name}
          <button
            type="button"
            onClick={() => onChange(selectedIds.filter((id) => id !== topic.id))}
            aria-label={`Remove ${topic.name}`}
            className="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full text-current opacity-60 hover:opacity-100"
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * The trigger that opens the row-list popover — rendered inline in the
 * same row as TopicChips (see HomeComposer's topicTagRow) so it reads as
 * a tag input's own "+" affordance, not a disconnected toolbar button.
 * Selected topics don't render here at all (see TopicChips) — this is
 * purely the affordance to add more, so it never grows to reflect how many
 * are already picked.
 */
export default function TopicPickerTrigger({
  topics,
  selectedIds,
  onChange,
}: {
  topics: PickableItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  // Where to put the portaled popover (see below) — captured from the
  // trigger's own position when it opens. The trigger lives in the
  // composer's toolbar row, which never scrolls independently while the
  // popover is open, so a one-time measurement is enough; no scroll
  // listener needed to keep it glued to the button.
  const [popoverPos, setPopoverPos] = useState<{ left: number; bottom: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  function openPopover() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPopoverPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
    setOpen(true);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openPopover())}
        className="flex h-[26px] flex-none cursor-pointer items-center gap-1 rounded-full border border-dashed border-[var(--reader-border)] px-2.5 text-[12px] font-bold text-[var(--reader-text-muted)] hover:bg-[var(--reader-surface-hover)]"
      >
        <Tag size={13} />
        {selectedIds.length === 0 ? "Add tags" : "Add more"}
      </button>

      {open &&
        popoverPos &&
        typeof document !== "undefined" &&
        createPortal(
          // Portaled straight to <body> with `position: fixed` — the
          // composer modal's own card clips overflow to keep its rounded
          // corners, which was cutting this off (including its own header)
          // when it rendered as a plain absolutely-positioned child of the
          // trigger instead.
          <div
            ref={popoverRef}
            style={{ left: popoverPos.left, bottom: popoverPos.bottom }}
            className="fixed z-[200] flex max-h-[min(360px,60vh)] w-[min(320px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-sm)] border border-[var(--reader-border)] bg-[var(--reader-surface)] shadow-lg"
          >
            <div className="flex flex-none items-start justify-end border-b border-[var(--reader-border)] px-1 py-2.5">
              {/* <p className="text-[11px] font-medium text-[var(--reader-text-muted)]">
                Tag every topic this fits — the first one picked is the default it posts under.
              </p> */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-5 w-5 flex-none cursor-pointer items-center justify-center rounded-full text-[var(--reader-text-subtle)] hover:bg-[var(--reader-surface-hover)]"
              >
                <X size={13} />
              </button>
            </div>
            <div className="om-scroll flex-1 overflow-y-auto">
              {topics.map((topic) => {
                const active = selectedIds.includes(topic.id);
                return (
                  <button
                    type="button"
                    key={topic.id}
                    onClick={() => toggle(topic.id)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 border-b border-[var(--reader-border)] px-3.5 py-2.5 text-left text-[12px] font-bold text-[var(--reader-text)] last:border-b-0 hover:bg-[var(--reader-surface-hover)]"
                  >
                    {topic.name}
                    {active && <Check size={15} className="flex-none text-brand-500" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
