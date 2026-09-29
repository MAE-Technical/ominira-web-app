import Image from "next/image";

const THEMES = ["light", "dark"] as const;

/**
 * The two non-text illustration exports from the launch-screen Figma frames,
 * used by the auth pages. Both themes are rendered and <html>'s
 * data-reader-theme hides the other (.theme-*-only, app/globals.css), so the
 * right artwork is there on first paint instead of swapping once
 * reader-store rehydrates.
 */
export default function SplashArtwork({
  className = "",
  showAccent = true,
}: {
  className?: string;
  showAccent?: boolean;
}) {
  return (
    <div className={`relative w-full max-w-[340px] ${className}`} aria-hidden="true">
      {THEMES.map((theme) => (
        <div key={theme} className={`theme-${theme}-only`}>
          {showAccent && (
            <Image
              src={`/images/splash/${theme}-accent.svg`}
              alt=""
              width={53}
              height={55}
              unoptimized
              className="absolute -top-5 right-0 h-[55px] w-[53px]"
            />
          )}
          <Image
            src={`/images/splash/${theme}-illustration-new.svg`}
            alt=""
            width={340}
            height={347}
            unoptimized
            className="block h-auto w-full"
          />
        </div>
      ))}
    </div>
  );
}
