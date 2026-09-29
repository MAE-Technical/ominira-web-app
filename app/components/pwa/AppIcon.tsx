import { APP_ICON_SIZES, appIconSrc } from "@/lib/config/brand-assets";

/**
 * The app icon inside the UI (install banner, push prompt, admin
 * notification preview) — the same launcher icon readers get on their home
 * screen. `size` is its CSS width in px; srcSet lets the browser pick the
 * exported file that matches size × device pixel ratio (e.g. 72/96px for a
 * 28px banner icon), so nothing is resampled far from its export size.
 * Shown square, as exported — no rounded corners.
 */
export default function AppIcon({ size, className = "" }: { size: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={appIconSrc(APP_ICON_SIZES.find((s) => s >= size * 2) ?? 512)}
      srcSet={APP_ICON_SIZES.map((s) => `${appIconSrc(s)} ${s}w`).join(", ")}
      sizes={`${size}px`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`flex-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
