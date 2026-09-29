"use client";

import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";

/** Click-to-open explainer for a dashboard figure — what it counts and how. */
export default function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="-m-1 flex flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-1 text-[var(--reader-text-subtle)] hover:text-[var(--reader-text)]"
        >
          <Info size={14} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 max-w-64 rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] px-3 py-2.5 text-[12px] font-medium leading-snug text-[var(--reader-text-muted)] shadow-lg"
        >
          <p className="m-0 mb-2 text-[12px] font-semibold text-[var(--reader-text)]">{label}</p>
          <p className="text-[13px] leading-[1.65]">{children}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
