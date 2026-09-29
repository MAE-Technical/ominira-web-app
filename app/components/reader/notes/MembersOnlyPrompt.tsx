"use client";

import { X } from "lucide-react";
import Link from "next/link";

export type MembersOnlyAction = "highlight" | "note" | "reply" | "react" | "bookmark";

const COPY: Record<MembersOnlyAction, string> = {
  highlight: "Only members can highlight passages.",
  note: "Only members can add notes.",
  reply: "Only members can reply.",
  react: "Only members can react.",
  bookmark: "Only members can save things for later.",
};

/** The one signed-out gate every write affordance shows instead of
 * redirecting to /auth/login (lib/reader/useRequireAuth.ts used to do that;
 * removed in favor of this, shown in place — see call sites: NoteComposer,
 * SelectionMenu's `override` slot, ReactionButton's popover). Copy varies by
 * which action was attempted; the actual security boundary stays server-side
 * (getAuthenticatedReader()), this is UX only.
 *
 * `onClose` is optional — a visible, explicit close affordance (rather than
 * only an easy-to-miss outside-tap) for wherever this stands in for a
 * transient attempt (a reply just requested, a fresh selection's Highlight
 * tap, a reaction tap) and there's something sensible to collapse back to.
 * Omitted where this *is* the composer's only content while signed out (the
 * root "add a note" composer) — nothing to reveal by closing it there. */
export default function MembersOnlyPrompt({ action, onClose }: { action: MembersOnlyAction; onClose?: () => void }) {
  return (
    <div className="relative rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3.5">
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="absolute right-2 top-2 flex items-center justify-center bg-transparent border-none cursor-pointer p-0.5 text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
        >
          <X size={14} />
        </button>
      )}
      <p className="m-0 mb-2 pr-5 text-[13px] font-medium leading-relaxed text-[var(--reader-text-muted)]">
        {COPY[action]}
      </p>
      <div className="flex gap-4">
        <Link
          href="/auth/login"
          className="text-[13px] font-bold text-[var(--reader-text-muted)] no-underline hover:text-[var(--reader-text)]"
        >
          Log in
        </Link>
        <Link
          href="/auth/signup"
          className="text-[13px] font-bold text-[var(--reader-accent)] no-underline hover:opacity-80"
        >
          Join us
        </Link>
      </div>
    </div>
  );
}
