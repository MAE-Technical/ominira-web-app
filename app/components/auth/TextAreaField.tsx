import type { ReactNode, TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  /** Same inline field error as TextField. */
  error?: string;
};

/** TextField's multi-line sibling — same label row, border and error treatment. */
export default function TextAreaField({ label, hint, error, id, className = "", ...props }: Props) {
  const inputId = id ?? props.name;
  return (
    <label htmlFor={inputId} className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-bold text-[var(--reader-text)]">{label}</span>
        {hint && <span className="text-xs text-[var(--reader-text-muted)]">{hint}</span>}
      </div>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`block w-full resize-y rounded-sm border bg-[var(--reader-surface)] px-4 py-2.5 font-medium text-[13px] leading-5 text-[var(--reader-text)] outline-none transition-colors placeholder:text-sand-400 ${
          error ? "border-red-400 focus:border-red-500" : "border-sand-300 focus:border-brand-400"
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>}
    </label>
  );
}
