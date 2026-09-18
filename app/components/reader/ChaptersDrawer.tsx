"use client";

import { useMemo } from "react";
import type { BookDocument } from "@/lib/book/schema";
import { buildOutlineRows } from "@/lib/reader/outline";
import { sectionLabel } from "@/lib/reader/sectionHeading";
import PanelShell from "./notes/PanelShell";
import PulseDot from "@/app/components/shared/PulseDot";

type Props = {
  book: BookDocument;
  scrollPct: number;
  activeSectionId: string;
  isMobile: boolean;
  open: boolean;
  // No header-height offset anymore — the drawer is always full height.
  // Reader.tsx hides the floating header for as long as the outline is
  // open instead, so there's nothing above the drawer to reserve space
  // for in the first place (the previous fixed marginTop-for-the-header
  // approach left a dead gap whenever scroll had hidden the header out
  // from under that reservation).
  onNavigate: (sectionId: string) => void;
  onClose: () => void;
};

/**
 * Same panel shell the notes panel and book-wide feed use (PanelShell) —
 * docked left (`side="left"`) instead of their right, so it keeps pushing
 * in from the same side it already occupied as a flex sibling below. Gets
 * the mobile drag-to-near-full-page sheet behavior for free from the shell
 * rather than the old bespoke full-screen slide.
 */
export default function ChaptersDrawer({
  book,
  scrollPct,
  activeSectionId,
  isMobile,
  open,
  onNavigate,
  onClose,
}: Props) {
  const sidebarRows = useMemo(() => buildOutlineRows(book.sections), [book.sections]);

  // Mobile vs desktop layout is decided in pure CSS (the shell: breakpoint
  // below, matching useSectionCarousel's isMobile threshold) — deliberately
  // NOT branched on the isMobile prop for the outer wrapper's own show/hide,
  // for the same SSR-safety reason this file has always used it: isMobile
  // starts false on every render (SSR-safe) and only flips to its real
  // value in an effect after mount, so a JS-gated className swap here would
  // flash the wrong layout for a frame. PanelShell's own panelType prop
  // (isMobile-gated below) is fine to compute from the JS value, though —
  // it only ever matters once this is actually open, which can't happen
  // before hydration (open starts false and only flips via a user click).
  return (
    <div
      // pointer-events-none is unconditional here (not just while closed) —
      // on mobile this box is `fixed inset-0`, but PanelShell's own "sheet"
      // variant only visually covers 50-96% of that height (see PanelShell's
      // own pointer-events comment); leaving this wrapper at the default
      // pointer-events:auto when open meant it silently ate every touch/
      // scroll across the *entire* screen, including the reader content
      // still visible above the sheet, blocking scroll there entirely.
      // PanelShell's inner panel box carries its own pointer-events-auto,
      // same as the notes panel's equivalent wrapper in Reader.tsx already
      // does — this now matches that.
      className={`fixed inset-0 z-[70] overflow-hidden select-none no-callout pointer-events-none transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "-translate-x-full"
      } shell:static shell:inset-auto shell:z-auto shell:h-full shell:max-w-[82vw] shell:flex-none shell:translate-x-0 shell:pointer-events-auto shell:transition-[width] shell:duration-300 shell:ease-out ${
        open ? "shell:w-95" : "shell:w-0"
      }`}
    >
      <PanelShell
        side="left"
        panelType={isMobile ? "sheet" : "side"}
        onClose={onClose}
        bodyClassName="om-scroll flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 pb-5"
        title={
          <div className="flex items-start gap-3 min-w-0">
            <img
              src={book.metadata.cover}
              alt="cover"
              className="w-11 h-16 object-cover rounded-xs flex-none shadow-sm"
            />
            <div className="min-w-0 pt-0.5">
              <span className="block truncate font-serif font-semibold text-base text-[var(--reader-text)]">
                {book.metadata.title}
              </span>
              <div className="text-xs text-[var(--reader-text-muted)] mt-0.5 truncate">
                {book.metadata.author}
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <div className="w-16 h-[3px] rounded-full bg-[var(--reader-surface-hover)] overflow-hidden flex-none">
                  <div
                    className="h-full bg-brand-500 rounded-full"
                    style={{ width: `${Math.round(scrollPct * 100)}%` }}
                  />
                </div>
                <span className="text-[12px] font-medium text-[var(--reader-text-muted)] whitespace-nowrap">
                  {Math.round(scrollPct * 100)}% complete
                </span>
              </div>
            </div>
          </div>
        }
      >
        {sidebarRows.map(({ section, depth, isGroup }) => {
          const isCurrent = section.id === activeSectionId;
          // Every row is clickable, group headers included — a group
          // (any section with children) can still carry its own lead-in
          // passages before its children start (book-document.schema's
          // "a part is just a Section with children and *usually* no
          // passages of its own"), and even a pure divider with none of
          // its own resolves forward to the nearest real content the
          // same way an empty leaf does (onNavigate -> resolveSpineTarget,
          // lib/reader/sections.ts). Only the typography below (bold
          // uppercase vs. a normal chapter row) tracks `isGroup` — never
          // whether tapping it does anything.
          return (
            <div
              key={section.id}
              // Navigates only — the drawer stays open (state preserved)
              // until the reader explicitly closes it. Used to also close
              // on mobile after every tap, which meant jumping between a
              // few chapters back-to-back required reopening the drawer
              // each time.
              onClick={() => onNavigate(section.id)}
              style={{ paddingLeft: (isGroup ? 0 : 10) + depth * 14 }}
              className={
                isGroup
                  ? `pt-4 first:pt-1 pb-1.5 px-2.5 cursor-pointer text-[10px] font-bold tracking-wider uppercase ${
                      isCurrent ? "text-brand-500" : "text-[var(--reader-text-subtle)]"
                    }`
                  : `flex items-center py-3 pr-2.5 rounded-sm mb-0.5 cursor-pointer ${
                      isCurrent ? "bg-brand-500/10" : "bg-transparent"
                    }`
              }
            >
              {isCurrent && !isGroup && <PulseDot className="mr-2" />}
              <span
                className={
                  isGroup
                    ? undefined
                    : `flex-1 text-sm leading-snug ${
                        isCurrent ? "font-semibold text-brand-500" : "font-medium text-[var(--reader-text-muted)]"
                      }`
                }
              >
                {sectionLabel(section)}
              </span>
            </div>
          );
        })}
      </PanelShell>
    </div>
  );
}
