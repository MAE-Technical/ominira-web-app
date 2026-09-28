import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { label: string };

export default function SelectField({ label, id, className = "", children, ...props }: Props) {
  const selectId = id ?? props.name;
  return (
    <label htmlFor={selectId} className="block">
      <div className="mb-2 text-[13px] font-bold text-[var(--reader-text)]">{label}</div>
      <div className="relative">
        <select
          id={selectId}
          className={`w-full appearance-none rounded-sm border border-sand-300 bg-white px-4 py-3 pr-10 text-[13px] outline-none transition-colors focus:border-brand-400 ${
            props.defaultValue === "" ? "text-sand-400" : "text-[var(--reader-text)]"
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute inset-y-0 right-3.5 my-auto text-sand-500"
        />
      </div>
    </label>
  );
}
