"use client";

import { memo } from "react";
import { MessageCircle } from "lucide-react";
import type { Mark, Passage } from "@/lib/book/schema";
import type { Annotation } from "@/stores/library-store";
import { PENDING_ANNOTATION_ID } from "@/lib/reader/useTextAnnotations";
import { useSessionStore } from "@/stores/session-store";

export type NoteLookup = { id: string; marker: string; text: string };

type Segment = {
  text: string;
  mark?: Mark;
  wordIndex?: number;
  annotationId?: string;
};
type WordRange = { start: number; end: number };
type LocalAnnotation = {
  id: string;
  start: number;
  end: number;
  highlighted: boolean;
  hasNote: boolean;
  /** True iff the signed-in reader themself authored at least one note in
   * this group — distinct from `hasNote`, which is true for *any* reader's
   * public note here. Only this, not `hasNote`, should ever wash the text
   * (see showWash below): another reader's public note is signalled with
   * just the counter glyph, never by highlighting text on this reader's
   * behalf that they never marked themselves. */
  hasOwnNote: boolean;
  noteCount: number;
  /** True when this passage is the last one touched by the annotation's own
   * ranges[] (selection order) — a multi-passage highlight/note renders its
   * wash in every passage it touches, but the glyph only once, here. */
  isTail: boolean;
};

function computeWordRanges(text: string): WordRange[] {
  const ranges: WordRange[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

/** Cuts passage text at the union of every mark, word, and user-annotation
 * boundary, so none of the three ever splits a piece another one needs
 * whole — a highlighted range spanning two marked words still renders as
 * one wrapped span internally made of the right em/strong/word pieces. */
function buildSegments(
  text: string,
  marks: Mark[] | undefined,
  words: WordRange[],
  annotations: LocalAnnotation[]
): Segment[] {
  const cuts = new Set<number>([0, text.length]);
  const sortedMarks = marks ? [...marks].sort((a, b) => a.start - b.start) : [];
  for (const mark of sortedMarks) {
    cuts.add(mark.start);
    cuts.add(mark.end);
  }
  for (const word of words) {
    cuts.add(word.start);
    cuts.add(word.end);
  }
  for (const a of annotations) {
    cuts.add(a.start);
    cuts.add(a.end);
  }
  const points = Array.from(cuts).sort((a, b) => a - b);
  const tokens: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start === end) continue;
    const mark = sortedMarks.find((m) => m.start <= start && end <= m.end);
    const wordIdx = words.findIndex((w) => w.start <= start && end <= w.end);
    const annotation = annotations.find((a) => a.start <= start && end <= a.end);
    tokens.push({
      text: text.slice(start, end),
      mark,
      wordIndex: wordIdx >= 0 ? wordIdx : undefined,
      annotationId: annotation?.id,
    });
  }
  return tokens;
}

/** Every plain-text word segment gets a stable marker while narration is
 * active, so Reader.tsx can move the karaoke underline without rerendering
 * prose. Paragraph controls own seeking; words are deliberately not buttons. */
function wordProps(
  seg: Segment,
  trackNarrationWords: boolean | undefined
): { "data-word-index"?: number } {
  if (seg.wordIndex === undefined || !trackNarrationWords) return {};
  return { "data-word-index": seg.wordIndex };
}

function renderLeaf(
  seg: Segment,
  key: number,
  notesById: Map<string, NoteLookup>,
  onNoteClick: (note: NoteLookup, target: HTMLElement) => void,
  onInternalLinkClick: (sectionId: string, fragmentId?: string) => void,
  trackNarrationWords: boolean | undefined
) {
  const wp = wordProps(seg, trackNarrationWords);
  const text = seg.text;

  if (!seg.mark) return <span key={key} {...wp}>{seg.text}</span>;
  if (seg.mark.kind === "em") return <em key={key} {...wp}>{seg.text}</em>;
  if (seg.mark.kind === "strong") return <strong key={key} {...wp}>{seg.text}</strong>;
  if (seg.mark.kind === "underline") return <span key={key} {...wp} style={{ textDecoration: "underline" }}>{text}</span>;
  if (seg.mark.kind === "strike") return <span key={key} {...wp} style={{ textDecoration: "line-through" }}>{text}</span>;
  if (seg.mark.kind === "sub") return <sub key={key} {...wp}>{text}</sub>;
  if (seg.mark.kind === "sup") return <sup key={key} {...wp}>{text}</sup>;
  if (seg.mark.kind === "code") {
    return (
      <code
        key={key}
        {...wp}
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          background: "var(--reader-surface-hover)",
          borderRadius: 3,
          padding: "0 0.2em",
        }}
      >
        {text}
      </code>
    );
  }
  if (seg.mark.kind === "link") {
    if (seg.mark.internal) {
      const { sectionId, fragmentId } = seg.mark;
      if (sectionId) {
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInternalLinkClick(sectionId, fragmentId);
            }}
            style={{
              color: "var(--reader-accent)",
              textDecoration: "underline",
              // <button> defaults to display:inline-block with UA text-align:
              // center and native appearance chrome — invisible for a short
              // label, but for a full-paragraph internal link (a TOC entry,
              // say) that wraps across lines, the inline-block box centers
              // each line under itself instead of flowing left like the rest
              // of the paragraph, and the native appearance can leave a
              // stray edge/bevel behind. Reset back to plain inline text so
              // it wraps exactly like the surrounding <a>/<span> mark cases.
              appearance: "none",
              display: "inline",
              textAlign: "inherit",
              font: "inherit",
            }}
            className="bg-transparent border-none cursor-pointer p-0 m-0"
          >
            {text}
          </button>
        );
      }
      return (
        <span
          key={key}
          title={seg.mark.href}
          style={{ color: "var(--reader-accent)", textDecoration: "underline" }}
          className="cursor-not-allowed"
        >
          {text}
        </span>
      );
    }
    const href = seg.mark.href ?? "#";
    return (
      <a
        key={key}
        href={href}
        onClick={(e) => e.stopPropagation()}
        style={{ color: "var(--reader-accent)", textDecoration: "underline" }}
      >
        {text}
      </a>
    );
  }
  if (seg.mark.kind === "note") {
    const note = seg.mark.noteId ? notesById.get(seg.mark.noteId) : undefined;
    if (!note) return <span key={key}>{seg.text}</span>;
    return (
      <button
        key={key}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNoteClick(note, e.currentTarget);
        }}
        style={{ color: "var(--reader-note-accent)" }}
        className="inline align-super text-[0.7em] leading-none font-semibold px-0.5 bg-transparent border-none cursor-pointer"
      >
        {text}
      </button>
    );
  }
  return <span key={key} {...wp}>{text}</span>;
}

/** The only signal that a marked span has entries attached — a highlight
 * with zero entries gets the wash alone (PassageText below), nothing more.
 * Renders once per annotation (see LocalAnnotation.isTail), immediately
 * after the marked text, never in a margin.
 *
 * Matches the YouVersion idiom this was redesigned from: a plain muted
 * outline icon sitting quietly in the text rather than a colored badge
 * competing with it, with the count (when there's more than one entry)
 * as a small superscript numeral beside it — the same "small raised digit"
 * language the book's own footnote markers already use (see the `seg.mark.
 * kind === "note"` branch above), rather than a filled pill. */
function NoteGlyph({ count }: { count: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        position: "relative",
        top: -1,
        marginLeft: 5,
        color: "var(--reader-text-muted)",
      }}
      className="select-none"
    >
      <MessageCircle size={12} strokeWidth={2.5} />
      {count > 1 && (
        <span
          style={{ fontSize: 9, fontWeight: 700, position: "relative", top: -6, marginLeft: 1 }}
          className="leading-none"
        >
          {count}
        </span>
      )}
    </span>
  );
}

type PassageTextProps = {
  passage: Passage;
  notesById: Map<string, NoteLookup>;
  onNoteClick: (note: NoteLookup, target: HTMLElement) => void;
  onInternalLinkClick: (sectionId: string, fragmentId?: string) => void;
  /** User highlights/notes touching this passage — range-scoped (a reader
   * can mark a single word or a whole sentence, not just the entire
   * passage, and a mark can span into neighboring passages too), rendered
   * as wrapping spans around the underlying mark/word tokens. */
  annotations: Annotation[];
  /** Fired for a plain click (not a fresh drag-selection) landing on any
   * existing mark — highlight-only or noted alike — opening its thread
   * directly. Removing a highlight or deleting a note is a *selection*
   * action instead (re-select the marked text and use the pill), so a
   * click here has exactly one job. */
  onNoteMarkerClick: (annotationId: string) => void;
  /** Present only in listen mode — turns on word tokenization for
   * Reader.tsx's imperative karaoke underline. */
  trackNarrationWords?: boolean;
  /** The one annotation (if any) the reader was just taken to from its own
   * quote card in the annotation feed or a deep link — gets the
   * .reader-jump-flash treatment (a one-shot pulse that settles into, and
   * holds, the same wash a real highlight gets) instead of the plain
   * steady wash every other mark gets, so a passage with several distinct
   * highlights makes obvious which one this was. Reader.tsx clears it back
   * to null once whichever panel sent the reader here (the book-wide feed,
   * or this note's own thread) closes — not on a timer, so the reader can
   * keep browsing with it lit for as long as they like. */
  justJumpedAnnotationId?: string | null;
};

/** Renders a passage's plain text with its ingested marks (em/strong/
 * footnote) and the reader's own highlights/notes applied — both are
 * additive layers cut into the same underlying plain string, never HTML.
 *
 * Wrapped in memo(): with the whole book mounted at once (reader-issues.md
 * — no notion of pages), tokenization now runs for every passage rather
 * than just the one being narrated or annotated. Reader.tsx passes stable
 * references for `passage`/`annotations`/`trackNarrationWords` and stable
 * callbacks, so this only re-tokenizes a passage when something about it
 * actually changed — never on every playback tick, which is why the
 * currently-narrated word itself is marked by Reader.tsx toggling a plain
 * DOM class on the right [data-word-index] span instead of a prop threaded
 * down here (see that effect's own comment). */
export const PassageText = memo(function PassageText({
  passage,
  notesById,
  onNoteClick,
  onInternalLinkClick,
  annotations,
  onNoteMarkerClick,
  trackNarrationWords,
  justJumpedAnnotationId,
}: PassageTextProps) {
  const readerId = useSessionStore((s) => s.readerId);
  const words = trackNarrationWords ? computeWordRanges(passage.text) : [];
  // An annotation carries one range per passage it touches — resolve each
  // to its own local [start,end) here, since that's all buildSegments
  // needs to know about for this one passage.
  const localAnnotations: LocalAnnotation[] = [];
  for (const a of annotations) {
    const r = a.ranges.find((r) => r.passageId === passage.id);
    if (r)
      localAnnotations.push({
        id: a.id,
        start: r.start,
        end: r.end,
        highlighted: a.highlighted,
        hasNote: a.notes.length > 0,
        hasOwnNote: readerId !== null && a.notes.some((n) => n.author.readerId === readerId),
        noteCount: a.notes.length,
        isTail: a.ranges[a.ranges.length - 1].passageId === passage.id,
      });
  }
  const segments = buildSegments(passage.text, passage.marks, words, localAnnotations);

  // Group consecutive same-annotation tokens into one wrapper span each —
  // where the highlight background actually gets painted (a range, not the
  // whole passage), and the click target for an existing mark.
  const runs: { annotationId?: string; segs: Segment[] }[] = [];
  for (const seg of segments) {
    const last = runs[runs.length - 1];
    if (last && last.annotationId === seg.annotationId) last.segs.push(seg);
    else runs.push({ annotationId: seg.annotationId, segs: [seg] });
  }

  return (
    <>
      {runs.map((run, i) => {
        const children = run.segs.map((seg, j) =>
          renderLeaf(seg, j, notesById, onNoteClick, onInternalLinkClick, trackNarrationWords)
        );
        if (!run.annotationId) return <span key={i}>{children}</span>;

        const local = localAnnotations.find((a) => a.id === run.annotationId)!;
        // The pending-selection overlay (see useTextAnnotations) shows the
        // exact same wash a real highlight gets, but it isn't backed by
        // anything real yet — clicking it has nowhere correct to go (the
        // notes panel is already open on this same pending thread), so it
        // never becomes a click target the way an actual highlight/note
        // does.
        const isPending = local.id === PENDING_ANNOTATION_ID;
        const isJustJumped = local.id === justJumpedAnnotationId;
        // Own highlight or own note washes the text persistently — another
        // reader's public note on this same span only ever gets the
        // counter glyph below, never a standing wash (see
        // LocalAnnotation.hasOwnNote's own comment): a reader shouldn't see
        // text lit up on their behalf for something only someone else
        // marked. The one exception is `isJustJumped`: a quote-card (or
        // deep-link) jump into *any* note (own or not) shows the reader
        // exactly what they clicked into for as long as that panel stays
        // open — Reader.tsx only clears justJumpedAnnotationId once neither
        // panel is open anymore, not on a timer. Once it does clear, this
        // reverts to showing nothing for a not-own note, same as any other
        // passage with only someone else's note on it.
        const showWash = isPending || local.highlighted || local.hasOwnNote || isJustJumped;
        const clickable = !isPending && (local.highlighted || local.hasNote);
        const handleClick = clickable
          ? (e: React.MouseEvent<HTMLSpanElement>) => {
              // Don't hijack a fresh drag-selection that merely happens to
              // end on top of this range.
              const sel = window.getSelection();
              if (sel && !sel.isCollapsed && sel.toString().trim()) return;
              e.stopPropagation();
              onNoteMarkerClick(local.id);
            }
          : undefined;

        return (
          <span
            key={i}
            data-annotation-id={local.id}
            onClick={handleClick}
            className={clickable ? "cursor-pointer" : ""}
          >
            {/* The wash (and its jump-flash ring) belongs to the marked
             * text alone — it used to sit on this same outer span as the
             * glyph below, so the glyph's icon and count picked up the
             * highlight background and flash ring too, reading as if
             * they'd been highlighted themselves. Scoping both to an inner
             * span around just `children` keeps the outer span as a plain
             * click hit-area (data-annotation-id, handleClick) without
             * painting anything onto the glyph sitting outside it. */}
            <span
              className={isJustJumped ? "reader-jump-flash" : ""}
              style={
                // The reader's own note implies a mark on the text itself,
                // same as an explicit highlight — they shouldn't have to also
                // hit Highlight separately just to see where their own note
                // is anchored. Someone else's public note on this same span
                // never washes the text on this reader's behalf (see
                // showWash above) — it's signalled by the glyph alone.
                showWash
                  ? {
                      background: "var(--reader-highlight)",
                      borderRadius: 2,
                      padding: "0 1px",
                    }
                  : undefined
              }
            >
              {children}
            </span>
            {local.isTail && local.noteCount > 0 && <NoteGlyph count={local.noteCount} />}
          </span>
        );
      })}
    </>
  );
});

/** Renders inline marks (bold/italic/links/note refs — the same Mark
 * vocabulary as passage text) over a bare string, with no passage, no
 * annotations, and no active-word tracking behind it. Table cells (v4:
 * TableCell.marks) are the one place formatting needs to render outside a
 * real Passage, so this is PassageText's own segment/leaf machinery pulled
 * out from under it rather than a second implementation — a cell without
 * `marks` (every v3 document) just renders `text` as one plain segment. */
export function MarkedText({
  text,
  marks,
  notesById,
  onNoteClick,
  onInternalLinkClick,
}: {
  text: string;
  marks?: Mark[];
  notesById: Map<string, NoteLookup>;
  onNoteClick: (note: NoteLookup, target: HTMLElement) => void;
  onInternalLinkClick: (sectionId: string, fragmentId?: string) => void;
}) {
  const segments = buildSegments(text, marks, [], []);
  return (
    <>
      {segments.map((seg, i) =>
        renderLeaf(seg, i, notesById, onNoteClick, onInternalLinkClick, undefined)
      )}
    </>
  );
}

/** Renders an `image`-type passage: the extracted figure plus its caption,
 * in place of the plain-paragraph fallback (reader-issues #5). `src` can be
 * absent (the source asset went missing during ingestion) — the alt text
 * and caption are still real content and still render, just over a plain
 * placeholder instead of the missing image itself, rather than the whole
 * passage silently vanishing from the book. Shrink-wrapped (inline-block)
 * rather than the block-level default, so the caller's own text-align
 * (BookContent, from `align` — same field every other passage type already
 * reads) has something to actually position instead of a figure that's
 * already filling the full line either way.
 *
 * `maxWidthPx` caps how wide the image is allowed to render, on top of the
 * existing `max-w-full` (which only ever bounds it to the reading column).
 * Nothing else about sizing is regulated — no cropping, no imposed aspect
 * ratio, `w-auto h-auto` still lets the image's own intrinsic dimensions
 * decide everything below that cap — this exists only for BookContent to
 * keep a front-matter cover from rendering edge-to-edge at the full text
 * column width (tuned for line length, not for a portrait cover image) on
 * wide reading panes, while ordinary in-book images stay unregulated. */
export function ImagePassageBlock({ passage, maxWidthPx }: { passage: Passage; maxWidthPx?: number }) {
  // min(), not a bare px value: a plain inline `maxWidth: 340` always wins
  // over the `max-w-full` class below (inline styles beat classes
  // regardless of specificity), so on a phone narrow enough that 340px is
  // *more* than the actual padded column width, the fixed number used to
  // win and the cover overflowed past the edge instead of shrinking to
  // fit. min(340px, 100%) always yields whichever is actually smaller, so
  // the cap only ever tightens the fit, never widens it past the column.
  const capStyle = maxWidthPx !== undefined ? { maxWidth: `min(${maxWidthPx}px, 100%)` } : undefined;
  return (
    <figure className="my-6 mx-0 inline-block max-w-full" style={capStyle}>
      {passage.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- book-supplied assets, not app images
        <img
          src={passage.src}
          alt={passage.text}
          className="max-w-full w-auto h-auto rounded-xs"
          style={capStyle}
        />
      ) : (
        <div
          role="img"
          aria-label={passage.text}
          style={capStyle}
          className="flex items-center justify-center rounded-xs border border-dashed border-[var(--reader-border)] bg-[var(--reader-surface-hover)] px-4 py-10 text-center"
        >
          <span className="text-xs text-[var(--reader-text-muted)] font-sans leading-snug">
            {passage.text || "Image unavailable"}
          </span>
        </div>
      )}
      {passage.caption && (
        <figcaption className="text-xs text-sand-500 mt-2 text-center font-sans leading-snug">
          {passage.caption}
        </figcaption>
      )}
    </figure>
  );
}
