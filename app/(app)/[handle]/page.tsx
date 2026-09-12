import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveReaderBySlug } from "@/lib/reader/profileSlug";
import { comradeName } from "@/lib/reader/authorDisplay";
import { PLATFORM_NAME } from "@/lib/config/platform";
import ReaderProfileView from "@/app/components/profile/ReaderProfileView";

/**
 * `/@{pseudonym}` — a reader's own profile, root-level and Twitter/GitHub-
 * style rather than nested under its own `/reader` segment (CurrentReaders.tsx's
 * roster links here). A single dynamic segment at the app root necessarily
 * shadows any *literal* top-level path this app hasn't already claimed with
 * its own page.tsx (e.g. a bare `/admin`, which has none today — only
 * `/admin/books` does) — every real route stays safe,
 * since Next.js always prefers a matching static segment over this dynamic
 * one at the same level; only an otherwise-unmatched single segment ever
 * reaches here.
 *
 * `decodeURIComponent` here is load-bearing, not defensive styling:
 * `generateMetadata`'s own `params` hands back a plain "@yeast", but this
 * page's own async component receives the *same* route's params re-encoded
 * as "%40yeast" over the RSC wire — confirmed by direct inspection, not
 * assumed; presumably Next's flight serializer escaping "@" to dodge its
 * own protocol's reserved-prefix syntax. Decoding first makes both shapes
 * converge (decoding an already-decoded "@yeast" is a harmless no-op, no
 * "%" sequence in it to touch) rather than special-casing which form this
 * particular Next version happens to hand back. Falls back to the raw
 * value on a malformed escape (a hand-typed `/@%zz`, say) rather than
 * 500ing — that just fails the "@"-prefix check below and 404s normally.
 */
function normalizeHandle(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Only a handle starting with "@" is a profile — anything else 404s
 * outright rather than rendering a confusing "reader not found" for what's
 * really just a bad path. */
function slugFromHandle(rawHandle: string): string {
  const handle = normalizeHandle(rawHandle);
  if (!handle.startsWith("@") || handle.length === 1) notFound();
  return handle.slice(1);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle: rawHandle } = await params;
  const handle = normalizeHandle(rawHandle);
  if (!handle.startsWith("@") || handle.length === 1) return { title: "Not found" };

  const reader = await resolveReaderBySlug(handle.slice(1));
  if (!reader) return { title: "Reader not found" };

  const name = comradeName(reader.pseudonym);
  return {
    title: name,
    description: `${name}'s reading activity and public notes on ${PLATFORM_NAME}.`,
  };
}

// A client component (ReaderProfileView) all the way down, unlike
// book/[slug]/page.tsx's server-fetched BookDetailView — which chrome to
// show here (self vs. public) depends on the *viewer's* own signed-in
// identity, and that only ever lives client-side (session-store, not a
// cookie session — see lib/reader/useReaderProfile.ts). This page just
// resolves the handle for metadata above and hands the bare slug down.
export default async function ReaderProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const slug = slugFromHandle(handle);
  return <ReaderProfileView slug={slug} />;
}
