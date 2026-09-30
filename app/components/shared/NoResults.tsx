/**
 * The single "nothing here" message — Home's feed, a book's community
 * notes/highlights panel, the library's catalog and personal views, and
 * search (modal + library search) all render their own empty state through
 * this one component rather than each hand-rolling a <p>. The text is
 * always the caller's own (what's empty differs by context), but the
 * component is the one modular source for how an empty state looks, so a
 * future styling change (spacing, tone, an icon) happens in one place.
 */
export default function NoResults({ message, className = "" }: { message: string; className?: string }) {
  return <p className={`font-medium text-[13px] text-[var(--reader-text-muted)] ${className}`}>{message}</p>;
}
