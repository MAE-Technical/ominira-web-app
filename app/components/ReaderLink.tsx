import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link, { type LinkProps } from "next/link";

/**
 * A link into the reader that's guaranteed to land on the real, full
 * reader experience — every book-detail Read/Listen/chapter link, book
 * list row, continue-reading card, and the now-playing bar's own title
 * should use this instead of a plain next/link <Link>.
 *
 * Callers keep constructing ordinary `/read/${slug}?...` hrefs (the
 * canonical shape used everywhere else, e.g. shared/permalinked URLs) —
 * this is the one place that rewrites that to `/reader/${slug}?...`
 * before navigating, landing on app/reader/[slug] (see that route's own
 * doc comment) instead of app/read/[slug]. That's what keeps this a real,
 * ordinary next/link soft navigation: app/@modal/(.)read/[slug]'s
 * intercepting-route convention only matches soft navigation to the
 * literal /read/[slug] path, so anything actually reaching /reader/[slug]
 * is never hijacked into the overlay/preview modal, and the root layout
 * (NarrationEngine's one real <audio> element included) never unmounts
 * crossing into or out of the reader.
 *
 * The ONE place the modal overlay is actually meant to trigger is the home
 * community feed's own passage+note permalinks — NoteBookHeader.tsx keeps
 * using next/link's <Link> straight at /read/[slug] on purpose, since a
 * "preview without leaving the feed" overlay is the whole point there.
 */
export default function ReaderLink({
  href,
  className,
  children,
  ...rest
}: { href: string; className?: string; children?: ReactNode } & Omit<LinkProps, "href"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  return (
    <Link href={href.replace(/^\/read\//, "/reader/")} className={className} {...rest}>
      {children}
    </Link>
  );
}
