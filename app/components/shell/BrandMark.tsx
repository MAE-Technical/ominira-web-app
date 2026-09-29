import { SPLASH_MARK } from "@/lib/config/brand-assets";

type Props = {
  className?: string;
  /** Show the Ominira mark before the wordmark (the app sidebar). */
  withMark?: boolean;
};

/** Shared product signature for shell chrome and compact scroll headers. */
export default function BrandMark({ className, withMark = false }: Props) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      {withMark &&
        // Transparent mark straight on the sidebar, in both theme variants —
        // <html>'s data-reader-theme hides the other (.theme-*-only,
        // globals.css), so it's right on first paint with no swap.
        (["light", "dark"] as const).map((theme) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={theme}
            src={SPLASH_MARK[theme]}
            alt=""
            aria-hidden="true"
            width={480}
            height={467}
            className={`theme-${theme}-only h-14 w-auto flex-none`}
          />
        ))}
      <span className="text-[15px] font-bold uppercase tracking-[0.08em] text-[var(--reader-accent)]">Ominira</span>
    </span>
  );
}
