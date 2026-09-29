"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";

/**
 * Real, zero-backend sharing: the native share sheet where available
 * (navigator.share needs no server support, just a title/text/url), a
 * clipboard-copy fallback everywhere else — never a fake/inert button.
 */
export default function ShareButton({
  title,
  text,
  ariaLabel = "Share this book",
  bordered = true,
}: {
  title: string;
  text?: string;
  /** Defaults to the original (only) caller's own book-page wording — a
   * different surface reusing this button (ReaderProfileView) passes its
   * own instead of every reader hearing "Share this book" for a profile. */
  ariaLabel?: string;
  /** DetailHeader's back/share row wants a borderless, icon-only look (its
   * own request — the bordered pill read as competing chrome next to the
   * plain back arrow); every other caller keeps the original bordered pill. */
  bordered?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // Reader dismissed the native share sheet — not an error.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex flex-none cursor-pointer items-center gap-1.5 rounded-sm px-3 py-2 text-xs font-semibold text-[var(--reader-text)] transition-colors hover:bg-[var(--reader-surface-hover)] ${
        bordered ? "border border-[var(--reader-border)] bg-[var(--reader-surface)]" : "border-none bg-transparent"
      }`}
    >
      {copied ? <Check size={15} /> : <Share size={15} />}
      {copied ? "Copied" : "Share"}
    </button>
  );
}
