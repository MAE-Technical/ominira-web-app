"use client";

import { useEffect, useRef, useState } from "react";
import { useInstallPrompt } from "@/lib/pwa/useInstallPrompt";
import {
  INSTALL_BANNER_COOLDOWN_MS,
  INSTALL_BANNER_LONG_COOLDOWN_MS,
  useInstallBannerStore,
} from "@/stores/install-banner-store";
import { useLayoutStore } from "@/stores/layout-store";
import InstallModal from "@/app/components/pwa/InstallModal";
import AppIcon from "@/app/components/pwa/AppIcon";

/**
 * The one install surface — a single bar fixed to the very top of the
 * viewport from the moment it can show, mobile and desktop alike (previously
 * three separate things: an in-feed card, a scrolled-past compact bar, and a
 * desktop-only top strip — all folded into this one, fodmapedia-style
 * (https://fodmapedia.com)). Hides itself for good once actually installed
 * (useInstallPrompt's isInstalled, which — unlike raw display-mode detection
 * — also remembers a past install across tabs/sessions), and reappears after
 * a cooldown if dismissed without installing (see install-banner-store's
 * INSTALL_BANNER_COOLDOWN_MS).
 *
 * Install always does *something* immediately: a real native
 * `beforeinstallprompt` fires `promptInstall` straight away (Chrome/Edge,
 * mobile or desktop); everyone else opens InstallModal, which carries both
 * the manual iOS/Android walkthroughs and the iOS-wrong-browser "Open in
 * Safari" case that used to live inline here.
 *
 * Own rendered height is published to layoutStore's `topBarHeight` so
 * AppShell can push page content down below it — same measure-and-store
 * trick bottomNavHeight/playerHeight already use at the other edges.
 */
export default function HomeInstallBanner() {
  const [modalOpen, setModalOpen] = useState(false);
  const { canPrompt, promptInstall, isInstalled } = useInstallPrompt();
  const dismissedAt = useInstallBannerStore((s) => s.dismissedAt);
  const dismissCount = useInstallBannerStore((s) => s.dismissCount);
  const hasHydrated = useInstallBannerStore((s) => s.hasHydrated);
  const dismiss = useInstallBannerStore((s) => s.dismiss);
  const setTopBarHeight = useLayoutStore((s) => s.setTopBarHeight);
  const barRef = useRef<HTMLDivElement>(null);

  // install-banner-store skips automatic persist hydration (see
  // reader-identity-store's own doc comment for why) so the server and
  // first client paint agree — rehydrated here the same way Reader.tsx
  // does for reader-identity-store.
  useEffect(() => {
    useInstallBannerStore.persist.rehydrate();
  }, []);

  // First dismiss gets the short cooldown; every dismiss after that gets
  // the long one (see install-banner-store's own doc comment for why). A
  // stale cooldown read is harmless here (worst case: the banner reappears
  // a render late), and there's no external-store equivalent for "has this
  // timestamp elapsed."
  const cooldownMs = dismissCount > 1 ? INSTALL_BANNER_LONG_COOLDOWN_MS : INSTALL_BANNER_COOLDOWN_MS;
  // eslint-disable-next-line react-hooks/purity
  const withinCooldown = dismissedAt !== null && Date.now() - dismissedAt < cooldownMs;
  const show = hasHydrated && !isInstalled && !withinCooldown;

  useEffect(() => {
    if (!show) {
      setTopBarHeight(0);
      return;
    }
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setTopBarHeight(entries[0].contentRect.height));
    ro.observe(el);
    return () => {
      ro.disconnect();
      setTopBarHeight(0);
    };
  }, [show, setTopBarHeight]);

  if (!show) return null;

  const onInstallClick = canPrompt ? promptInstall : () => setModalOpen(true);

  return (
    <>
      <div
        ref={barRef}
        // `env(safe-area-inset-top)` is folded into the top padding via
        // calc() rather than set as its own inline paddingTop — a separate
        // inline paddingTop would win over just the top half of the py-2.5
        // class (specificity), leaving bottom padding at 10px and top at
        // whatever the safe area was (0 on desktop) and pushing every child
        // up off-center instead of leaving the row symmetric.
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
        className="fixed left-0 right-0 top-0 z-50 flex items-center gap-3 bg-black px-4 pb-2.5 shadow-md shell:left-[var(--app-sidebar-w)]"
      >
        <AppIcon size={28} />
        <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-white">
          Install the Ominira app on your phone, tablet or desktop computer
        </span>
        <button
          type="button"
          onClick={onInstallClick}
          className="flex-none cursor-pointer rounded-sm border border-transparent bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="flex-none cursor-pointer border-none bg-transparent p-1 text-xs font-medium text-white/60 hover:text-white"
        >
          Not now
        </button>
      </div>

      <InstallModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
