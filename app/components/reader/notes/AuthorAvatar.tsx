"use client";

import Link from "next/link";
import { avatarColor, avatarInitial, comradeName } from "@/lib/reader/authorDisplay";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";

/** The avatar circle alone, split out of AuthorRow so a caller can place it
 * outside the name/meta column entirely — Substack's own comment layout:
 * the avatar sits in its own left column, with the name, timestamp, quote,
 * and body all stacked in one indented column beside it, rather than the
 * avatar sharing a single row with just the name. */
export default function AuthorAvatar({ name, size = "default" }: { name: string; size?: "default" | "small" }) {
  const displayName = comradeName(name);
  const dims = size === "small" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[11px]";

  return (
    <Link href={`/@${pseudonymToSlug(name)}`} className="flex flex-none no-underline">
      <span
        style={{ background: avatarColor(displayName) }}
        className={`flex flex-none items-center justify-center rounded-full font-bold text-white ${dims}`}
      >
        {avatarInitial(displayName)}
      </span>
    </Link>
  );
}
