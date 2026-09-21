type Props = {
  className?: string;
};

/** Shared product signature for shell chrome and compact scroll headers. */
export default function BrandMark({ className }: Props) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      {/* <Image
        src="/icons/icon-192.png"
        alt=""
        width={30}
        height={30}
        className="h-[30px] w-[30px] flex-none rounded-xs object-cover object-[center_20%]"
      /> */}
      <span className="text-[15px] font-bold uppercase tracking-[0.08em] text-[var(--reader-accent)]">Ominira</span>
    </span>
  );
}
import Image from "next/image";
