"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { avatarColor, avatarInitial, comradeName } from "@/lib/reader/authorDisplay";
import { formatShortTimeAgo } from "@/lib/reader/timeAgo";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";

/** Avatar + pseudonym + relative time — the identity row every note and
 * reply leads with. Reads correctly with today's single hardcoded author
 * and with real multiple authors later, without changes (see
 * lib/reader/authorDisplay.ts). Takes an optional trailing `menu` slot
 * (same pattern as PanelShell's `headerMenu`) — the per-entry overflow
 * trigger lives here, anchored with the author/time metadata it actually
 * manages, rather than down in the react/reply action row below the
 * content, where its position would drift with content length. */
export default function AuthorRow({
  name,
  savedAt,
  city = null,
  topicName = null,
  size = "default",
  isPrivate = false,
  menu,
}: {
  name: string;
  savedAt: number;
  /** Shown after the timestamp ("· {city}") when known — same trailing
   * metadata line as `topicName` below. */
  city?: string | null;
  /** Shown after city ("· in {topicName}") — every Note carries this (each
   * post always has a topic_id), so it's only null if the topic lookup
   * itself failed. */
  topicName?: string | null;
  /** Reply-tier entries render smaller than top-level notes. */
  size?: "default" | "small";
  /** True only for a note/reply that's both `visibility: "private"` *and*
   * the signed-in reader's own (see callers' `useIsOwnNote`) — RLS already
   * means nobody else's client ever receives a private row that isn't
   * theirs, so this is belt-and-braces, not the actual boundary. Shows a
   * small lock chip so a reader scanning their own notes/replies can tell,
   * at a glance, which of their own entries nobody else can see — without
   * it, "private" was invisible after the fact, indistinguishable from
   * public once the composer that set it had closed. */
  isPrivate?: boolean;
  menu?: ReactNode;
}) {
  const small = size === "small";
  const displayName = comradeName(name);
  const profileHref = `/@${pseudonymToSlug(name)}`;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Link href={profileHref} className="flex flex-none no-underline">
        <span
          style={{ background: avatarColor(displayName) }}
          className={`flex flex-none items-center justify-center rounded-full font-bold text-white ${
            small ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-xs"
          }`}
        >
          {avatarInitial(displayName)}
        </span>
      </Link>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <Link
          href={profileHref}
          className={`font-bold capitalize text-[var(--reader-text)] no-underline hover:underline ${
            small ? "text-[11px]" : "text-xs"
          }`}
        >
          {displayName}
        </Link>
        <span
          className={`font-medium text-[var(--reader-text-muted)] ${
            small ? "text-[10px]" : "text-[11px]"
          }`}
        >
          {formatShortTimeAgo(savedAt)} &nbsp;
          {city && <> · &nbsp; {city}</>} &nbsp;
          {topicName && <> · &nbsp; in {topicName}</>}
        </span>
        {isPrivate && (
          <span
            title="Only visible to you"
            className={`flex items-center gap-0.5 font-semibold text-[var(--reader-text-subtle)] ${
              small ? "text-[9px]" : "text-[10px]"
            }`}
          >
            <Lock size={small ? 8 : 9} />
            Only you
          </span>
        )}
      </div>
      {menu}
    </div>
  );
}
