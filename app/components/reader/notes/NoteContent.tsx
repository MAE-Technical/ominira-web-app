"use client";

import { useState } from "react";
import type { NoteContent as NoteContentValue } from "@/lib/api/types";
import { LinkPreview } from "./LinkPreview";
import { VideoPreview } from "./VideoPreview";
import VoiceNoteView from "./VoiceNoteView";
import { truncateQuote } from "./HighlightCard";

// Same idea as HighlightCard's own preview budget — a note's own body is
// the reader's writing, not a passage from the book, so it gets a somewhat
// longer allowance before "See more" kicks in.
const NOTE_PREVIEW_CHARS = 320;

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

/** First recognizable URL in a note's text, normalized the same way
 * linkify does (bare "www." gets "https://" prepended) — used to decide
 * whether a preview card renders below the text at all. Only the first
 * one: a note that mentions several links still gets just one preview,
 * same "one card, not a gallery" simplicity as the composer's own. */
function firstUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  const value = match[0].replace(TRAILING_PUNCTUATION, "");
  return value.toLowerCase().startsWith("www.") ? `https://${value}` : value;
}

function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null;
    if (parsed.hostname.endsWith("youtube.com")) return parsed.searchParams.get("v") ?? parsed.pathname.split("/").pop() ?? null;
  } catch {
    return null;
  }
  return null;
}

/** One note/reply's actual content — text or voice — with no author,
 * timestamp, or actions bundled in (see AuthorRow for those); split out so
 * the same rendering works at both the top-level-note and reply scale. */
export default function NoteContent({
  content,
}: {
  content: NoteContentValue;
}) {
  const [expanded, setExpanded] = useState(false);

  if (content.kind === "voice") {
    return <VoiceNoteView audioUrl={content.audioUrl} durationMs={content.durationMs} />;
  }
  const url = firstUrl(content.text);
  const { shown, isTruncated } = truncateQuote(content.text, NOTE_PREVIEW_CHARS);
  const displayedText = expanded ? content.text : shown;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="m-0 min-w-0 whitespace-pre-wrap break-words font-serif text-[15px] leading-[1.6] text-[var(--reader-text)]">
        {linkify(displayedText).map((part, i) =>
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
      {isTruncated && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mb-1.5 w-fit cursor-pointer border-none bg-transparent p-0 text-[12px] font-medium text-[var(--color-app-text-secondary)] hover:text-[var(--color-app-text)]"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
      {(!isTruncated || expanded) && url ? youtubeId(url) ? <VideoPreview /> : <LinkPreview data={{ url }} /> : null}
    </div>
  );
}
