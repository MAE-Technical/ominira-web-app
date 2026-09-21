"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import BookCover from "@/app/components/shared/BookCover";
import { truncateQuote } from "./Quote";

// Same word-boundary truncation as the standalone Quote component, just a
// shorter budget — this quote shares a row with the cover and source line
// instead of getting the whole card to itself.
const PREVIEW_CHARS = 160;

/** One flat unit — cover thumbnail, source line (title · author), and the
 * quoted passage — sharing a single tinted surface with no internal seams,
 * per the note card redesign. Only ever rendered for a note that's actually
 * anchored to a highlight; a general book note (no ranges) uses the plain
 * NoteBookHeader metadata row instead, with no quote/tinted surface at all.
 *
 * The corner-arrow affordance is deliberately the same circular bordered
 * button NoteBookHeader already uses (group-hover fill, not a bare
 * absolute-positioned glyph) — just sized down slightly to fit this
 * denser, single-line-of-metadata row. */
export default function Citation({
  href,
  coverSrc,
  title,
  author,
  quote,
}: {
  href?: string;
  coverSrc?: string | null;
  title: string;
  author: string;
  quote: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, isTruncated } = truncateQuote(quote, PREVIEW_CHARS);

  const body = (
    <>
      <div className="relative h-[58px] w-[42px] flex-none overflow-hidden rounded-sm border border-[var(--color-app-border)]">
        <BookCover src={coverSrc} alt={title} className="h-full w-full" />
        <div className="absolute inset-0 bg-[rgba(190,64,13,0.16)] mix-blend-multiply" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-[var(--color-app-text)]">
          {title} <span className="font-medium text-[var(--color-app-text-muted)]">· {author}</span>
        </div>
        <p className="m-0 mt-1 font-serif text-[15.5px] leading-[1.42] text-[var(--color-app-text)]">
          &ldquo;{expanded ? quote : shown}&rdquo;
        </p>
        {isTruncated && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              // Citation as a whole may be a Link (`href`) — expanding the
              // preview is a distinct action, never the trigger for it.
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="relative z-10 mt-1 inline-block cursor-pointer text-[12px] font-medium text-[var(--color-app-text-secondary)] hover:text-[var(--color-app-text)]"
          >
            {expanded ? "See less" : "See more"}
          </span>
        )}
      </div>
      {href && (
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[var(--color-app-border)] text-[var(--color-app-text-muted)] group-hover:bg-[var(--color-app-surface)] group-hover:text-[var(--color-app-text)]">
          <ArrowUpRight size={13} />
        </span>
      )}
    </>
  );

  const className = "group relative flex items-center gap-2.5 rounded-sm bg-[var(--color-app-surface-muted)] px-3 py-2.5 no-underline";

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
