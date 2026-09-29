import { AVATAR_COLORS, avatarChoice, avatarInitial, type Avatar } from "@/lib/avatar/avatar";
import { comradeName } from "@/lib/reader/authorDisplay";

/** The single source for a reader's DP. Every avatar in the app renders
 * through here so it stays identical for the same reader everywhere: their
 * uploaded photo or chosen color, else a color hashed from the name (see
 * lib/avatar/avatar.ts). A photo gets the same warm cover-tint as a book
 * cover, so faces sit in the page's palette rather than on top of it. */
export default function ReaderAvatar({
  pseudonym,
  avatar,
  size = 32,
  className = "",
}: {
  pseudonym: string;
  avatar?: Avatar | null;
  size?: number;
  className?: string;
}) {
  const name = comradeName(pseudonym);
  const choice = avatarChoice(pseudonym, avatar);
  const style = { width: size, height: size };

  if (choice === "photo") {
    return (
      <span style={style} className={`relative block flex-none overflow-hidden rounded-full ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar!.url!} alt={name} className="h-full w-full object-cover" />
        <span aria-hidden className="cover-tint" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, background: AVATAR_COLORS[choice], fontSize: Math.round(size * 0.42) }}
      className={`flex flex-none items-center justify-center rounded-full font-bold tracking-wide text-white ${className}`}
    >
      {avatarInitial(name)}
    </span>
  );
}
