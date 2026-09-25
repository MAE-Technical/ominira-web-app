"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { comradeName } from "@/lib/reader/authorDisplay";
import { formatShortTimeAgo } from "@/lib/reader/timeAgo";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";

/** Pseudonym + relative time — the identity line every note and reply leads
 * with, sitting in the same indented column as the quote/body beneath it
 * rather than sharing a row with the avatar (see `AuthorAvatar`, rendered
 * as its own left column by the caller — NoteThreadCard/ReplyEntry). Reads
 * correctly with today's single hardcoded author and with real multiple
 * authors later, without changes (see lib/reader/authorDisplay.ts). Takes
 * an optional trailing `menu` slot (same pattern as PanelShell's
 * `headerMenu`) — the per-entry overflow trigger lives here, anchored with
 * the author/time metadata it actually manages, rather than down in the
 * react/reply action row below the content, where its position would drift
 * with content length. */
export default function AuthorRow({
  name,
  savedAt,
  city = null,
  topicName = null,
  isPrivate = false,
  size = "default",
  menu,
}: {
  name: string;
  savedAt: number;
  city?: string | null;
  topicName?: string | null;
  isPrivate?: boolean;
  /** "small" — a reply's own identity line, one notch down from a
   * top-level note's. */
  size?: "default" | "small";
  menu?: ReactNode;
}) {
  const displayName = comradeName(name);
  const profileHref = `/@${pseudonymToSlug(name)}`;
  const nameSize = size === "small" ? "text-[11px]" : "text-xs";
  const metaSize = size === "small" ? "text-[10px]" : "text-[11px]";
  return (
    // flex-nowrap + truncate on the meta span: a single flat line everywhere
    // (feed and notes panel alike), rather than wrapping onto a second line
    // once the meta text is too long for a narrower column — the trailing
    // city/topic gets truncated instead.
    <div className="flex min-w-0 flex-nowrap items-baseline gap-x-1.5">
      <Link
        href={profileHref}
        className={`flex-none font-bold capitalize text-[var(--reader-text)] no-underline hover:underline ${nameSize}`}
      >
        {displayName}
      </Link>
      <span className={`min-w-0 flex-1 truncate font-medium text-[var(--reader-text-muted)] ${metaSize}`}>
        {formatShortTimeAgo(savedAt)} &nbsp;
        {city && <> · &nbsp; {city}</>} &nbsp;
        {topicName && <> · &nbsp; in {topicName}</>}
      </span>
      {isPrivate && (
        // self-center: an icon+text badge mixed into this row's own
        // items-baseline alignment can inflate the row taller than plain
        // text would, throwing off AuthorAvatar's centering against it
        // (see the identical self-center on the menu button below).
        <span
          title="Only visible to you"
          className={`flex flex-none items-center gap-0.5 self-center font-semibold text-[var(--reader-text-subtle)] text-[10px]`}
        >
          <Lock size={8} />
          Only you
        </span>
      )}
      {menu}
    </div>
  );
}
