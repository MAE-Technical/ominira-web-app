import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Same reappear-window shape as install-banner-store's cooldowns — long
 * enough that a "Not now" isn't nagged every visit, short enough the card
 * still resurfaces rather than being gone for good. Native permission is
 * the actual hard stop (see useWebPush.ts): once a reader accepts or the
 * browser reports "denied", HomePushPrompt hides itself regardless of this
 * cooldown. */
export const PUSH_PROMPT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
export const PUSH_PROMPT_LONG_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type PushPromptState = {
  dismissedAt: number | null;
  dismissCount: number;
  hasHydrated: boolean;
  dismiss: () => void;
};

export const usePushPromptStore = create<PushPromptState>()(
  persist(
    (set) => ({
      dismissedAt: null,
      dismissCount: 0,
      hasHydrated: false,
      dismiss: () => set((s) => ({ dismissedAt: Date.now(), dismissCount: s.dismissCount + 1 })),
    }),
    {
      name: "ominira-push-prompt",
      // Same SSR-hydration-mismatch reasoning as install-banner-store —
      // rehydrated explicitly by HomePushPrompt before it trusts this.
      skipHydration: true,
      onRehydrateStorage: () => () => {
        usePushPromptStore.setState({ hasHydrated: true });
      },
    }
  )
);
