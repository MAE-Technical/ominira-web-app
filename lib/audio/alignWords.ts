/** A single word's timing within one synthesized chunk of text. */
export type SynthesizedWord = { word: string; startMs: number; endMs: number };

const alnum = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Re-maps Pocket's words onto the text's own \S+ words, one timing each —
 * the unit KaraokeWord.index counts (see narrationText.ts's countWords).
 * Pocket splits at punctuation ("H.I.I.D.'s" -> H I I D s, "$4.50" -> 4 50)
 * and drops tokens with nothing to say ("—"), so its list can't be used
 * index-for-index. A text word claims the Pocket words whose letters spell
 * it out; one Pocket never spoke (a dash, or a skipped word) gets a
 * zero-length timing where the previous word ended.
 */
export function alignWords(text: string, spoken: SynthesizedWord[]): SynthesizedWord[] {
  let next = 0;
  let lastEnd = 0;
  return (text.match(/\S+/g) ?? []).map((word) => {
    const target = alnum(word);
    let built = "";
    let startMs: number | undefined;
    while (next < spoken.length && built.length < target.length) {
      const piece = alnum(spoken[next].word);
      if (!target.startsWith(built + piece)) break;
      built += piece;
      startMs ??= spoken[next].startMs;
      lastEnd = spoken[next].endMs;
      next++;
    }
    return { word, startMs: startMs ?? lastEnd, endMs: lastEnd };
  });
}
