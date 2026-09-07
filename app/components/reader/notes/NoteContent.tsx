"use client";

import type { NoteContent as NoteContentValue } from "@/lib/api/types";
import VoiceNoteView from "./VoiceNoteView";

// Matches http(s) URLs and bare "www." ones (the latter get "https://"
// prepended for the href only — the visible text stays exactly what the
// reader typed). Deliberately plain-text in, link-rendered out: the
// composer/edit view always shows the raw string a reader typed, and only
// display (this component) turns recognizable URLs into anchors — so
// editing a note never shows mid-edit markup, and a reader who copies a
// note's text back out gets plain text, not HTML.
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

// Trailing punctuation a URL is unlikely to actually end with is more often
// the reader's own sentence punctuation ("check this out: example.com.")
// than part of the link — stripped from the link and rendered as plain
// text right after it instead.
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/;

function linkify(text: string): Array<string | { url: string; label: string }> {
  return text.split(URL_PATTERN).map((part) => {
    if (!URL_PATTERN.test(part)) return part;
    URL_PATTERN.lastIndex = 0; // .test() with a /g regex advances lastIndex — reset for the next part
    // The href drops trailing sentence punctuation ("example.com." only
    // ever means the site plus a full stop); the visible label keeps it —
    // simpler than carving it into its own trailing plain-text segment,
    // and the anchor covering a stray "." costs nothing.
    const trailingMatch = part.match(TRAILING_PUNCTUATION);
    const withoutTrailing = trailingMatch ? part.slice(0, -trailingMatch[0].length) : part;
    const url = withoutTrailing.toLowerCase().startsWith("www.") ? `https://${withoutTrailing}` : withoutTrailing;
    return { url, label: part };
  });
}

/** One note/reply's actual content — text or voice — with no author,
 * timestamp, or actions bundled in (see AuthorRow for those); split out so
 * the same rendering works at both the top-level-note and reply scale. */
export default function NoteContent({
  content,
}: {
  content: NoteContentValue;
}) {
  if (content.kind === "voice") {
    return <VoiceNoteView audioUrl={content.audioUrl} durationMs={content.durationMs} />;
  }
  return (
    <p
      // min-w-0 matters as much as the wrap utilities do: every caller
      // renders this as a direct child of a `flex flex-col` wrapper
      // (NoteThreadCard, ReplyEntry), and a flex item's default
      // `min-width: auto` sizes it to its content's own minimum width —
      // for a long unbroken run like a URL, that minimum can exceed the
      // panel's width outright, overflowing it horizontally regardless of
      // what word-break/overflow-wrap say, since the item never actually
      // shrinks down to the point where breaking would kick in. break-words
      // (overflow-wrap) covers any other long unbroken token in the note's
      // own text; the link itself additionally carries break-all (see
      // below) since a raw URL has none of the natural break points
      // (hyphens, etc.) overflow-wrap alone waits for.
      className="m-0 min-w-0 whitespace-pre-wrap break-words font-serif text-sm leading-[1.6] text-[var(--reader-text)]"
    >
      {linkify(content.text).map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            className="text-[var(--reader-accent)] underline decoration-1 underline-offset-2 break-all"
          >
            {part.label}
          </a>
        )
      )}
    </p>
  );
}
