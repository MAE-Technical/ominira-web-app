// Single source of truth for the brand icon set in public/icons/, exported
// from the "Ominira PWA Icon Spec" in Claude Design at exact pixel sizes
// (never resize them at runtime). Every icon comes as a cream #FAF6F0
// (light) and black #000000 (`-dark`) pair; launchers can't switch by theme,
// so the manifest, apple-touch-icon and favicons all use the light set. The
// `-dark` launcher files are kept for when browsers support theme-aware
// manifest icons — but note the design tool drew a pale halo around the mark
// in every dark export, which the original design doesn't have. public/sw.js and
// public/manifest.json can't import this module, so they repeat the paths
// they need — keep them in step when a filename changes.
//
// Filenames are the cache key: browsers, installed PWAs and the service
// worker all hold on to an icon URL, so a redesigned icon gets a NEW
// filename (and a redirect from the old one in next.config.ts), never an
// in-place overwrite.

export type BrandTheme = "light" | "dark";

/**
 * Appended to favicon / apple-touch-icon URLs. Browsers keep favicons in
 * their own long-lived store that ignores normal HTTP revalidation, so a
 * regenerated favicon under the same URL can stay stale for weeks — bump
 * this whenever the icon files change.
 */
export const ICON_VERSION = "7";

export const BRAND_BG: Record<BrandTheme, string> = {
  light: "#FAF6F0",
  dark: "#000000",
};

/** Exported "any" launcher icon sizes (icon-{n}x{n}.png, cream, mark at 72%). */
export const APP_ICON_SIZES = [72, 96, 128, 144, 192, 256, 384, 512] as const;

export function appIconSrc(size: number) {
  return `/icons/icon-${size}x${size}.png`;
}

/** Fixed-size app icon for emails (36px CSS, so 144 covers 4× displays). */
export const APP_ICON = appIconSrc(144);

/**
 * The mark alone, 480×467 box. Light is transparent. Dark is the original
 * design's dark render cropped on its own #000 (== the dark theme canvas,
 * so it only belongs on black) — the later dark export has a pale halo.
 */
export const SPLASH_MARK: Record<BrandTheme, string> = {
  light: "/icons/mark-light.webp",
  dark: "/icons/mark-dark.webp",
};

/**
 * The OMINIRA wordmark (the design's own lettering), trimmed, 540×81 (3× its
 * 180px splash display width). Each sits on its theme's splash background
 * (cream / black), so it only belongs on that canvas.
 */
export const WORDMARK: Record<BrandTheme, string> = {
  light: "/icons/wordmark-light.webp",
  dark: "/icons/wordmark-dark.webp",
};

export const BRAND_TAGLINE = "Arise for Freedom";
