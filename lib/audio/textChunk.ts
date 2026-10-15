// Was 1000 (a whole passage per request) when Edge TTS synthesized faster
// than real time at any length. Pocket TTS slows down as the input grows:
// ~150 chars ran faster than real time, a 610-char paragraph about 1.5x
// slower, so a whole passage meant a long wait before the first word and a
// reader that caught up with synthesis. At ~200 chars the reader waits for
// the first sentence or two while the rest prefetch behind playback, and
// NarrationEngine hands each next clip to the element without a gap.
// Sentences still accumulate up to the budget rather than one per request,
// so an imperfect boundary (after "Dr.") only shifts where a clip ends — it
// never makes a standalone clip of just "Dr.".
const MAX_CHARS = 200;

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
 * a split (when one is even needed) doesn't cut mid-word. A short passage
 * (a heading, a one-sentence paragraph) comes back as a single untouched
 * chunk; a longer one splits every sentence or two.
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
