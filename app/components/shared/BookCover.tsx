"use client";

import { FileText, Link as LinkIcon } from "lucide-react";

type Props = {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  iconSize?: number;
  /** Picks the no-cover default: link icon for a saved webpage, document icon for everything else (epub/pdf/docx). */
  materialType?: string | null;
};

export default function BookCover({ src, alt, className = "", imageClassName = "", iconSize = 22, materialType }: Props) {
  const resolvedSrc = src?.trim() || undefined;

  return (
    <div className={`relative overflow-hidden bg-[var(--color-app-surface-muted)] ${className}`}>
      {resolvedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- content-library thumbnail, not an app asset
        <img
          src={resolvedSrc}
          alt={alt}
          className={`absolute inset-0 h-full w-full object-cover ${imageClassName}`}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[var(--color-app-text-muted)]"
        >
          {materialType === "webpage" ? (
            <LinkIcon size={iconSize} strokeWidth={1.5} />
          ) : (
            <FileText size={iconSize} strokeWidth={1.5} />
          )}
        </div>
      )}
    </div>
  );
}
