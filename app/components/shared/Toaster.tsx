"use client";

import { useToastStore } from "@/stores/toast-store";

/** Mounted once in the root layout. Sits above the mobile bottom nav / now-
 * playing bar (bottom offset includes the safe-area inset). */
export default function Toaster() {
  const toast = useToastStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[200] flex justify-center px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
    >
      <div
        key={toast.id}
        className="rounded-full bg-[var(--reader-text)] px-4 py-2 text-[13px] font-semibold text-[var(--reader-bg)] shadow-lg"
      >
        {toast.message}
      </div>
    </div>
  );
}
