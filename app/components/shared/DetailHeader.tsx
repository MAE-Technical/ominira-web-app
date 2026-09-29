"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import ShareButton from "@/app/components/materials/ShareButton";

type Props = {
  onBack: () => void;
  /** Page name beside the back arrow — account settings uses it; a material
   * or profile page leaves it off, since its own hero already says what the
   * page is. */
  title?: string;
  /** Omitted on a page with nothing shareable (account settings). */
  shareAction?: { title: string; text?: string; ariaLabel?: string };
  /** One extra page-level action, rendered just before Share — the
   * material page's bookmark, a profile owner's Edit. A slot rather than a
   * prop per control, so this row doesn't grow one for every page that
   * wants something in it. */
  action?: ReactNode;
};

/** The back-arrow / share row a detail-style page (material details, a
 * reader profile, account settings) sits below AppHeader — deliberately its
 * own row, not a prop AppHeader takes on, so a browsing page's
 * search/bell/profile chrome never has to make room for a page-specific
 * action it doesn't need. See AppHeader's own doc comment for why these were
 * split apart. */
export default function DetailHeader({ onBack, title, shareAction, action }: Props) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-9 flex-none cursor-pointer items-center border-none bg-transparent p-0 text-[var(--reader-text)]"
      >
        <ArrowLeft size={18} />
      </button>
      {title && <h1 className="m-0 truncate text-[13px] font-bold text-[var(--reader-text)]">{title}</h1>}
      <div className="ml-auto flex items-center gap-1">
        {action}
        {shareAction && (
          <ShareButton title={shareAction.title} text={shareAction.text} ariaLabel={shareAction.ariaLabel} bordered={false} />
        )}
      </div>
    </div>
  );
}
