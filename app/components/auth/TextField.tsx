import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  endAdornment?: ReactNode;
  /** Field-level error text (api-spec.md's `{ error: { field } }`) — rendered
   * inline beneath the input, never as a redirect or toast. Also swaps the
   * border to a warning color so the offending field is visually obvious
   * without reading the message first. */
  error?: string;
};

export default function TextField({ label, hint, endAdornment, error, id, className = "", ...props }: Props) {
  const inputId = id ?? props.name;
  return (
    <label htmlFor={inputId} className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-bold text-[var(--reader-text)]">{label}</span>
        {hint && <span className="text-xs text-[var(--reader-text-muted)]">{hint}</span>}
      </div>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-sm border bg-[var(--reader-surface)] px-4 py-2.5 font-medium text-[13px] text-[var(--reader-text)] outline-none transition-colors placeholder:text-sand-400 ${
            error ? "border-red-400 focus:border-red-500" : "border-sand-300 focus:border-brand-400"
          } ${endAdornment ? "pr-11" : ""} ${className}`}
          {...props}
        />
        {endAdornment && <div className="absolute inset-y-0 right-3.5 flex items-center">{endAdornment}</div>}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>}
    </label>
  );
}
