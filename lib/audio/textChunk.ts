// The unit actually sent to the TTS engine is a whole passage, not a
// sentence — see lib/audio/narrationText.ts's own doc comment on why
// text-splitting stopped being how synthesis request boundaries get
// decided at all. This module now only exists for the rare passage that's
// long enough to need splitting anyway, purely to stay under a sane
// per-request size — a paragraph that long is uncommon enough that an
// occasional imperfect split point here is low-stakes (one clip restarts
// slightly early/late mid-paragraph), unlike the old sentence-per-request
// model, where the exact same kind of imperfect boundary produced an
// actual standalone clip of just "Dr." or "E." — an audible defect, not a
// shrug.
const MAX_CHARS = 1000;

// Where Intl.Segmenter picks a break point at all, it's still a better
// guess than a blind mid-word character cut — real Unicode sentence-break
// data (decimals, ellipses, many abbreviations) beats nothing. It isn't
// used to decide *whether* something is its own request anymore (that's
// always "no" now, short of MAX_CHARS), only *where* to cut an
// over-length passage if a boundary near the budget happens to exist.
const segmenters = new Map<string, Intl.Segmenter>();
function getSegmenter(locale: string): Intl.Segmenter {
  let segmenter = segmenters.get(locale);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
    segmenters.set(locale, segmenter);
  }
  return segmenter;
}

/**
 * Splits passage text into pieces safely under a TTS request's practical
 * size, breaking on a sentence boundary when one exists near the budget so
 * a split (when one is even needed) doesn't cut mid-word. The overwhelming
 * majority of passages are well under MAX_CHARS and come back as a single
 * untouched chunk — this only matters for an unusually long paragraph or
 * blockquote.
 */
export function splitForSynthesis(text: string, locale = "en", maxChars = MAX_CHARS): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = Array.from(getSegmenter(locale).segment(text), (s) => s.segment);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
