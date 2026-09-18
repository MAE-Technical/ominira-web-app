"use client";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
};

/**
 * The one on/off switch shared by AccountView's Theme and Notifications
 * rows (previously a sun/moon segmented control and a text pill button,
 * respectively, which read as two different controls for the same kind of
 * setting) — same visual language, so a reader learns the pattern once.
 */
export default function Switch({ checked, onChange, disabled, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-4.5 w-8 flex-none cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-[var(--reader-accent)]" : "bg-[var(--reader-border)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-3.5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
