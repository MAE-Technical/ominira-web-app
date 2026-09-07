"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import AuthorRow from "@/app/components/reader/notes/AuthorRow";
import Quote from "@/app/components/reader/notes/Quote";
import NoteContent from "@/app/components/reader/notes/NoteContent";
import ReactionButton from "@/app/components/reader/notes/ReactionButton";
import ReplyButton from "@/app/components/reader/notes/ReplyButton";

const SAMPLE_BOOK = {
  title: "The Wretched of the Earth",
  author: "Frantz Fanon",
  label: "Conclusion",
  cover: "https://idjeqhbhbcqkacyktupb.supabase.co/storage/v1/object/sign/public-cdn/sample_book_cover.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hYzE0NTA4MS05NjdmLTRiMzctOGRlYy0wMDAyMGYyMjQ2YmMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwdWJsaWMtY2RuL3NhbXBsZV9ib29rX2NvdmVyLmpwZWciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg1OTU1MjgxLCJleHAiOjE4MTc0OTEyODF9.iBggdIp2U5EN7F86P2MTPrsMYaK4UyWvFykfdmBHd1A",
};

const SAMPLE_QUOTE = "Each generation must, out of relative obscurity, discover its mission, fulfill it, or betray it.";

const SAMPLE_NOTE = "Fifty years on and this still reads like a call aimed straight at us. What's our generation's mission?";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Live preview of how a chosen pseudonym shows up on a real community note
 * — reuses AuthorRow/Quote/NoteContent/ReactionButton/ReplyButton as-is
 * (the exact components CommunityNoteCard renders on the home feed), rather
 * than a rough approximation, so the reader sees exactly what they're about
 * to put their name on. The book header mirrors NoteBookHeader's markup but
 * isn't a real deep link — the sample book isn't in the library, and
 * there's nowhere to send a reader who hasn't signed up yet. Its cover
 * (public/wofecover.jpeg) is a real edition cover, not one of the library's
 * own /covers/*.jpg assets, since this book isn't actually in the library.
 */
export default function NotePreviewCard({ pseudonym }: { pseudonym: string }) {
  // AuthorRow itself now applies the "Comrade " prefix (comradeName) — pass
  // the bare pseudonym so this preview doesn't double it up.
  const name = pseudonym.trim() || "Kofi Writes";
  const [reacted, setReacted] = useState(false);
  const [savedAt] = useState(() => Date.now() - TWO_HOURS_MS);

  return (
    <div className="rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface)] p-5">
      <div className="mb-3 text-[11px] font-bold tracking-[0.08em] text-[var(--reader-text-muted)]">
        PREVIEW OF A NOTE
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SAMPLE_BOOK.cover}
            alt={SAMPLE_BOOK.title}
            className="h-12 w-10 flex-none rounded-sm border border-[var(--reader-border)] object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-serif text-[13.5px] leading-[1.6] font-semibold text-[var(--reader-text)]">
              {SAMPLE_BOOK.title}
            </div>
            <div className="truncate text-[11.5px] font-medium text-[var(--reader-text-muted)]">
              {SAMPLE_BOOK.author} · {SAMPLE_BOOK.label}
            </div>
          </div>
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[var(--reader-border)] text-[var(--reader-text-muted)]">
            <ArrowUpRight size={15} />
          </span>
        </div>

        <Quote text={SAMPLE_QUOTE} />

        <div className="flex min-w-0 flex-col gap-2">
          <AuthorRow name={name} savedAt={savedAt} />
          <NoteContent content={{ kind: "text", text: SAMPLE_NOTE }} />
          <div className="flex items-center gap-3.5">
            <ReactionButton count={reacted ? 24 : 23} reacted={reacted} onToggle={() => setReacted((v) => !v)} />
            <ReplyButton count={4} expanded={false} onToggle={() => {}} />
          </div>
        </div>
      </div>
    </div>
  );
}
