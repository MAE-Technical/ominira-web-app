"use client";

import Link from "next/link";
import ReaderAvatar from "@/app/components/shared/ReaderAvatar";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";
import type { Avatar } from "@/lib/avatar/avatar";

/** The avatar circle alone, split out of AuthorRow so a caller can place it
 * beside just the name/time row — the quote/body/reactions below run the
 * full card width rather than staying indented under it. One size
 * everywhere — a reply is still the same person saying the same kind of
 * thing as a top-level note, so it gets no smaller a portrait. */
export default function AuthorAvatar({ name, avatar }: { name: string; avatar?: Avatar | null }) {
  return (
    <Link href={`/@${pseudonymToSlug(name)}`} className="flex flex-none no-underline">
      <ReaderAvatar pseudonym={name} avatar={avatar} size={32} />
    </Link>
  );
}
