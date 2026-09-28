"use client";

import Link from "next/link";
import { avatarColor, avatarInitial, comradeName } from "@/lib/reader/authorDisplay";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";

/** The avatar circle alone, split out of AuthorRow so a caller can place it
 * beside just the name/time row — the quote/body/reactions below run the
 * full card width rather than staying indented under it. One size
 * everywhere — a reply is still the same person saying the same kind of
 * thing as a top-level note, so it gets no smaller a portrait. */
export default function AuthorAvatar({ name }: { name: string }) {
  const displayName = comradeName(name);

  return (
    <Link href={`/@${pseudonymToSlug(name)}`} className="flex flex-none no-underline">
      <span
        style={{ background: avatarColor(displayName) }}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-bold text-white sm:h-8 sm:w-8"
      >
        {avatarInitial(displayName)}
      </span>
    </Link>
  );
}
