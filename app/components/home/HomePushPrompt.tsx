"use client";

import { useEffect, useState } from "react";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useWebPush } from "@/lib/push/useWebPush";
import { PUSH_PROMPT_COOLDOWN_MS, PUSH_PROMPT_LONG_COOLDOWN_MS, usePushPromptStore } from "@/stores/push-prompt-store";
import { PLATFORM_NAME } from "@/lib/config/platform";

/**
 * The soft ask before the browser's own native permission dialog — styled
 * to read as a system permission sheet (iOS's "'App' Would Like to Send
 * You Notifications", Android's equivalent), not an in-feed marketing card,
 * since that's the mental model a reader already has for this exact
 * question. Same fixed light chrome as InstallModal (rather than tracking
 * the reader's own light/dark theme) for the same reason: it's meant to
 * read as OS-level chrome, not app content.
 *
 * Dismissing this can still be asked again later (see the cooldown below),
 * unlike the real native dialog, which most browsers only ever show once
 * per site. Registered readers only — see HomePushPrompt's export site
 * (HomeCommunityFeed) for why.
 */
export default function HomePushPrompt() {
  const isAuthenticated = useIsAuthenticated();
  const { supported, permission, subscribe } = useWebPush();
  const dismissedAt = usePushPromptStore((s) => s.dismissedAt);
  const dismissCount = usePushPromptStore((s) => s.dismissCount);
  const hasHydrated = usePushPromptStore((s) => s.hasHydrated);
  const dismiss = usePushPromptStore((s) => s.dismiss);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    usePushPromptStore.persist.rehydrate();
  }, []);

  const cooldownMs = dismissCount > 1 ? PUSH_PROMPT_LONG_COOLDOWN_MS : PUSH_PROMPT_COOLDOWN_MS;
  // eslint-disable-next-line react-hooks/purity
  const withinCooldown = dismissedAt !== null && Date.now() - dismissedAt < cooldownMs;

  // permission === "default" is the only state worth asking about:
  // "granted" means there's nothing left to ask, "denied" means asking
  // again would do nothing (the browser won't re-prompt), same reasoning
  // AccountView's NotificationsRow uses for its own "Blocked" state.
  const show = isAuthenticated && hasHydrated && supported && permission === "default" && !withinCooldown;

  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [show]);

  if (!show) return null;

  const onEnable = async () => {
    setSubscribing(true);
    try {
      await subscribe();
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[280px] overflow-hidden rounded-2xl bg-white text-center shadow-xl">
        <div className="px-5 pt-6 pb-5">
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-3 h-14 w-14 rounded-xl object-cover object-[center_20%]" />
          <p className="m-0 text-[15px] font-semibold leading-snug text-sand-950">
            &ldquo;{PLATFORM_NAME}&rdquo; Would Like to Send You Notifications
          </p>
          <p className="mt-2 mb-0 text-[13px] leading-snug text-sand-600">
            Get notified when a comrade reacts to or replies on your notes.
          </p>
        </div>

        <div className="grid grid-cols-2 border-t border-sand-200">
          <button
            type="button"
            onClick={dismiss}
            className="cursor-pointer border-r border-sand-200 py-3 text-[15px] text-sand-500 hover:bg-sand-75"
          >
            Don&apos;t Allow
          </button>
          <button
            type="button"
            onClick={onEnable}
            disabled={subscribing}
            className="cursor-pointer py-3 text-[15px] font-semibold text-brand-500 hover:bg-sand-75 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {subscribing ? "…" : "Allow"}
          </button>
        </div>
      </div>
    </div>
  );
}
