import { create } from "zustand";
import { persist } from "zustand/middleware";

// Scaled back to just light/dark for now (per product decision) — light is
// literally white background/black text, dark its literal inverse. The
// broader 8-variant system (white/sepia/paper/dawn, carbon/black/winter/
// forest) was built but shelved; app/globals.css still names its tokens
// --reader-* the same way, so reintroducing variants later is a token-block
// addition, not a rename.
export type Theme = "light" | "dark";

// Font size, line spacing, and content width are all exposed as the same
// plain 10-100 scale (step 10) instead of three different named-option
// steppers/glyphs — a "40" or "70" between - and + reads the same way
// everywhere, unlike an "A" glyph or an icon whose meaning has to be
// inferred. Each control maps its scale value onto its own real CSS range
// via *FromScale below; the scale number itself carries no unit.
export const SCALE_MIN = 10;
export const SCALE_MAX = 100;
export const SCALE_STEP = 10;

export const FONT_SIZE_PX_RANGE = { min: 12, max: 30 };
export const LINE_HEIGHT_RANGE = { min: 1.3, max: 2.2 };
export const CONTENT_WIDTH_PX_RANGE = { min: 540, max: 900 };

function clampScale(n: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, n));
}

function scaleToValue(scale: number, range: { min: number; max: number }): number {
  return range.min + ((scale - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * (range.max - range.min);
}

// Inverse of scaleToValue, snapped to the nearest step — used only to
// migrate a pre-scale persisted value (an old px/line-height/px number) onto
// the nearest 10-100 stop.
function nearestScaleForValue(value: number, range: { min: number; max: number }): number {
  const raw = SCALE_MIN + ((value - range.min) / (range.max - range.min)) * (SCALE_MAX - SCALE_MIN);
  return clampScale(Math.round(raw / SCALE_STEP) * SCALE_STEP);
}

export function fontSizePxFromScale(scale: number): number {
  return Math.round(scaleToValue(scale, FONT_SIZE_PX_RANGE));
}
export function lineHeightFromScale(scale: number): number {
  return Number(scaleToValue(scale, LINE_HEIGHT_RANGE).toFixed(2));
}
export function contentWidthPxFromScale(scale: number): number {
  return Math.round(scaleToValue(scale, CONTENT_WIDTH_PX_RANGE));
}
export type FontFamily =
  | "serif"
  | "literata"
  | "sans"
  | "atkinson"
  | "inter"
  | "opendyslexic"
  | "avenir"
  | "lyon"
  | "signifier"
  | "valkyrie"
  | "system";

// avenir/lyon/signifier/valkyrie are free lookalikes standing in for
// commercial typefaces with no available web-font license — see the comment
// in app/fonts.ts for which substitute backs which requested name. "system"
// is a literal OS font stack, not a next/font loader — see below for why it
// can't just be an omitted style property.
export const FONT_FAMILY_VARS: Record<FontFamily, string> = {
  serif: "var(--font-serif)",
  literata: "var(--font-literata)",
  sans: "var(--font-sans)",
  atkinson: "var(--font-atkinson)",
  inter: "var(--font-inter)",
  opendyslexic: "var(--font-opendyslexic)",
  avenir: "var(--font-jost)",
  lyon: "var(--font-spectral)",
  signifier: "var(--font-newsreader)",
  valkyrie: "var(--font-bitter)",
  // The reader body already carries a font-sans (Manrope) className
  // (app/layout.tsx), so an *omitted* font-family style would inherit that
  // rather than fall through to the OS default — needs an explicit literal
  // stack instead.
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  serif: "Source Serif",
  literata: "Literata",
  sans: "Manrope",
  atkinson: "Atkinson Hyperlegible",
  inter: "Inter",
  opendyslexic: "OpenDyslexic",
  avenir: "Avenir-style (Jost)",
  lyon: "Lyon-style (Spectral)",
  signifier: "Signifier-style (Newsreader)",
  valkyrie: "Valkyrie-style (Bitter)",
  system: "System default",
};

// What "Reset to default" in the style panel restores — kept as a single
// source of truth so the reset button can't drift from the store's own
// initial values.
export const READER_PREF_DEFAULTS = {
  fontSizeScale: 40,
  // Literata — Google's serif designed specifically for on-screen book
  // reading, the single default for now (per product decision); the font
  // picker UI is shelved alongside the wider theme system, but the other
  // FontFamily values above stay defined for when it's re-enabled.
  fontFamily: "literata" as FontFamily,
  theme: "light" as Theme,
  lineSpacingScale: 60,
  contentWidthScale: 60,
};

/**
 * The device's colour scheme — the theme for any reader who hasn't picked
 * one. Light when the device states no preference (or outside a browser).
 */
export function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

type ReaderState = {
  // Durable, cross-book preferences — persisted.
  fontSizeScale: number;
  fontFamily: FontFamily;
  theme: Theme;
  /** True once the reader has picked a theme themselves. Until then `theme`
   * follows the device (systemTheme) and isn't persisted — otherwise saving
   * any other preference would freeze the default in place. */
  themeExplicit: boolean;
  lineSpacingScale: number;
  contentWidthScale: number;

  setFontSizeScale: (n: number) => void;
  setFontFamily: (f: FontFamily) => void;
  /** The reader's own choice — persisted, and stops following the device. */
  setTheme: (t: Theme) => void;
  /** The device's scheme changed — applied only while the reader hasn't chosen. */
  syncSystemTheme: (t: Theme) => void;
  setLineSpacingScale: (n: number) => void;
  setContentWidthScale: (n: number) => void;
  resetToDefaults: () => void;
};

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      ...READER_PREF_DEFAULTS,
      themeExplicit: false,

      setFontSizeScale: (n) => set({ fontSizeScale: clampScale(n) }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setTheme: (theme) => set({ theme, themeExplicit: true }),
      syncSystemTheme: (theme) => set((s) => (s.themeExplicit ? {} : { theme })),
      setLineSpacingScale: (n) => set({ lineSpacingScale: clampScale(n) }),
      setContentWidthScale: (n) => set({ contentWidthScale: clampScale(n) }),
      resetToDefaults: () => set({ ...READER_PREF_DEFAULTS }),
    }),
    {
      name: "ominira-reader-prefs",
      version: 5,
      // v0: flat light/sepia/dark. v1: briefly an 8-variant light/dark
      // system (white/sepia/paper/dawn, carbon/black/winter/forest). v2:
      // scaled back to just light/dark — collapse anything from either
      // earlier shape down to whichever mode it visually belonged to,
      // rather than leaving a persisted value the current Theme type
      // no longer accepts. v3: fontSize/lineSpacing/margins (a raw px
      // number plus two named-option unions) collapsed into one shared
      // 10-100 "scale" shape per control — each old value maps onto the
      // nearest scale stop in its control's new CSS range. v4: the type/
      // layout config menu (size, spacing, width, family) is shelved along
      // with ReaderSettingsMenu — force those four back to
      // READER_PREF_DEFAULTS for anyone who'd nudged them via that UI,
      // since there's no control left to change them back. theme is left
      // alone; it's still live via the header's plain sun/moon toggle.
      migrate: (persisted, version) => {
        const state = persisted as {
          theme?: string;
          themeExplicit?: boolean;
          fontSize?: number;
          lineSpacing?: string;
          margins?: string;
        } & Record<string, unknown>;
        if (version < 2) {
          const darkVariants = new Set(["dark", "carbon", "black", "winter", "forest"]);
          state.theme = state.theme && darkVariants.has(state.theme) ? "dark" : "light";
        }
        if (version < 3) {
          const oldLineHeight = { tight: 1.4, normal: 1.7, loose: 2.1 }[state.lineSpacing ?? "normal"] ?? 1.7;
          const oldContentWidth = { wide: 540, normal: 680, narrow: 860 }[state.margins ?? "normal"] ?? 680;
          state.fontSizeScale = nearestScaleForValue(state.fontSize ?? 17, FONT_SIZE_PX_RANGE);
          state.lineSpacingScale = nearestScaleForValue(oldLineHeight, LINE_HEIGHT_RANGE);
          state.contentWidthScale = nearestScaleForValue(oldContentWidth, CONTENT_WIDTH_PX_RANGE);
          delete state.fontSize;
          delete state.lineSpacing;
          delete state.margins;
        }
        if (version < 4) {
          state.fontSizeScale = READER_PREF_DEFAULTS.fontSizeScale;
          state.fontFamily = READER_PREF_DEFAULTS.fontFamily;
          state.lineSpacingScale = READER_PREF_DEFAULTS.lineSpacingScale;
          state.contentWidthScale = READER_PREF_DEFAULTS.contentWidthScale;
        }
        // v5: the theme follows the device until the reader picks one. A
        // persisted "dark" was necessarily a choice (it was never the
        // default); a persisted "light" may just be the old default saved
        // alongside some other preference, so it's dropped and the device
        // decides.
        if (version < 5) {
          state.themeExplicit = state.theme === "dark";
          if (!state.themeExplicit) delete state.theme;
        }
        // Cast: `state` is typed narrowly above just for the fields this
        // migration touches, but at runtime it carries every persisted
        // field (untouched ones like fontFamily pass through via the same
        // object reference) — the target shape zustand actually wants.
        return state as unknown as {
          fontSizeScale: number;
          fontFamily: FontFamily;
          theme: Theme;
          themeExplicit: boolean;
          lineSpacingScale: number;
          contentWidthScale: number;
        };
      },
      // No persisted choice → the device's scheme, resolved at rehydrate so
      // every consumer gets the right theme from its first post-hydration
      // render (matches what lib/pwa/boot.ts put on <html> before paint).
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<ReaderState>) };
        if (!merged.themeExplicit) merged.theme = systemTheme();
        return merged;
      },
      // Same SSR-hydration-mismatch reasoning as highlights-store: theme
      // (rendered straight onto data-reader-theme on first paint) can't be
      // read from localStorage before the server and the client's first
      // render agree. Rehydrated explicitly post-mount in Reader.tsx.
      skipHydration: true,
      // Only typography preferences are meant to survive reloads and apply
      // across every book — session position/mode reset intentionally.
      partialize: (s) => ({
        fontSizeScale: s.fontSizeScale,
        fontFamily: s.fontFamily,
        ...(s.themeExplicit ? { theme: s.theme, themeExplicit: true } : {}),
        lineSpacingScale: s.lineSpacingScale,
        contentWidthScale: s.contentWidthScale,
      }),
    }
  )
);
