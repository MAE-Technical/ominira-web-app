import { create } from "zustand";

type Toast = { id: number; message: string };

const TOAST_MS = 2200;
let nextId = 0;

/** One transient message at a time — a newer toast replaces the current one
 * rather than stacking, since these are short confirmations (e.g. a bookmark
 * toggled), not a queue anyone needs to work through. Rendered by
 * app/components/shared/Toaster.tsx. */
export const useToastStore = create<{ toast: Toast | null; show: (message: string) => void; dismiss: (id: number) => void }>((set) => ({
  toast: null,
  show: (message) => {
    const id = ++nextId;
    set({ toast: { id, message } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), TOAST_MS);
  },
  dismiss: (id) => set((s) => (s.toast?.id === id ? { toast: null } : s)),
}));

export function showToast(message: string) {
  useToastStore.getState().show(message);
}
