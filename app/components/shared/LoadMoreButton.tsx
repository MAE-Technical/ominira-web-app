/** The one "Load more" control — the library's catalog and the
 * notifications feed both page the same way (a cursor, a button at the end
 * of the list), so they page with the same button rather than each
 * hand-rolling one that drifts in size, weight and disabled styling. The
 * caller owns the fetch and the cursor; this owns only how it looks and
 * what it says while it's working. */
export default function LoadMoreButton({
  onClick,
  isLoading,
  className = "mt-8",
}: {
  onClick: () => void;
  isLoading: boolean;
  className?: string;
}) {
  return (
    <div className={`flex justify-center ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        className="cursor-pointer rounded-xs border border-[var(--reader-border)] bg-[var(--reader-surface)] px-[22px] py-2.5 text-[12px] font-bold text-[var(--reader-text)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}
