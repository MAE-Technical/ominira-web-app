// Learns character-style semantics from the EPUB's own stylesheets — ported
// 1:1 from ingestion-pipeline/src/ingestion/epubparser/css.py.
//
// Calibre-converted EPUBs rarely use semantic <i>/<b>/<em>/<strong> tags —
// emphasis lives in class-styled spans (`<span class="italic">`, or generated
// names like `.calibre2 { font-style: italic }` where the name carries no
// hint at all). The book's CSS is the only reliable signal, so this module
// extracts it: the sets of class names whose rules declare
// `font-style: italic|oblique` or `font-weight: bold|bolder|600+`.
//
// Deliberately simple selector handling: only bare class selectors (`.foo`,
// `span.foo`, comma lists thereof) are honored.

const COMMENT = /\/\*[\s\S]*?\*\//g;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const CLASS_SELECTOR = /^[A-Za-z0-9]*\.([A-Za-z0-9_-]+)$/;
const ITALIC = /font-style\s*:\s*(italic|oblique)/i;
const BOLD = /font-weight\s*:\s*(bold\b|bolder\b|[6-9]00)/i;

export class StyleClasses {
  italic: Set<string>;
  bold: Set<string>;

  constructor(italic: Set<string> = new Set(), bold: Set<string> = new Set()) {
    this.italic = italic;
    this.bold = bold;
  }

  updateFromCss(css: string): void {
    const cleaned = css.replace(COMMENT, " ");
    let match: RegExpExecArray | null;
    RULE.lastIndex = 0;
    while ((match = RULE.exec(cleaned)) !== null) {
      const [, selectors, body] = match;
      const italic = ITALIC.test(body);
      const bold = BOLD.test(body);
      if (!italic && !bold) continue;
      for (const selector of selectors.split(",")) {
        const m = CLASS_SELECTOR.exec(selector.trim());
        if (!m) continue;
        if (italic) this.italic.add(m[1]);
        if (bold) this.bold.add(m[1]);
      }
    }
  }

  /** A copy extended with a chapter's own <style> blocks — chapter-local so
   * one chapter's rules never leak into another's extraction. */
  mergedWithInline(cssTexts: string[]): StyleClasses {
    const merged = new StyleClasses(new Set(this.italic), new Set(this.bold));
    for (const css of cssTexts) merged.updateFromCss(css);
    return merged;
  }
}

export async function collectStyles(
  readCssFile: (path: string) => Promise<string | null>,
  cssPaths: string[]
): Promise<StyleClasses> {
  const styles = new StyleClasses();
  for (const path of cssPaths) {
    const css = await readCssFile(path);
    if (css !== null) styles.updateFromCss(css);
  }
  return styles;
}
