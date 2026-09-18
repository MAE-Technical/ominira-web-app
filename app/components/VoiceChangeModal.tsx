"use client";

import { Check, Mic, X } from "lucide-react";
import { AFRICAN_VOICES } from "@/lib/audio/voices";
import { useReaderStore } from "@/stores/reader-store";

type Props = {
  voice: string;
  onSelect: (voiceId: string) => void;
  onClose: () => void;
};

/**
 * Same dialog chrome as ReadingRoomModal/SearchModal (shared/CurrentReaders.tsx,
 * SearchModal.tsx) — translucent backdrop, centered card, full-screen on
 * mobile — rather than the old dropdown-menu picker this replaces.
 */
export default function VoiceChangeModal({ voice, onSelect, onClose }: Props) {
  // NowPlayingBar (this modal's ancestor, not portaled) forces its own
  // subtree to data-reader-theme="dark" so the player bar reads as its own
  // distinct surface from the mobile tab bar — but that would otherwise
  // drag this modal along with it. Re-pinning to the app's actual theme
  // here keeps the modal itself consistent with everything else on screen.
  const theme = useReaderStore((s) => s.theme);
  return (
    <div
      data-reader-theme={theme}
      onClick={onClose}
      className="fixed inset-0 z-50 box-border flex items-center justify-center bg-black/45 p-6 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100%-48px)] w-full max-w-[420px] flex-col overflow-hidden rounded-lg bg-[var(--reader-surface)] shadow-lg"
      >
        <div className="flex flex-none items-start justify-between gap-2.5 border-b border-[var(--reader-border)] px-5 py-4.5">
          <div className="flex items-center gap-2.5">
            <Mic size={16} className="mt-0.5 flex-none text-[var(--reader-text)]" />
            <div>
              <div className="font-serif text-base font-semibold text-[var(--reader-text)]">Choose a voice</div>
              <div className="mt-0.5 text-xs font-medium text-[var(--reader-text-muted)]">
                Pick a narrator to read your book
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="mt-0.5 flex-none border-none bg-transparent p-0 text-[var(--reader-text-muted)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="om-scroll flex flex-1 flex-col gap-1 overflow-y-auto p-2.5">
          {AFRICAN_VOICES.map((v) => {
            const active = v.id === voice;
            return (
              <button
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={`flex items-center gap-3 rounded-[10px] border py-2.5 px-3 text-left cursor-pointer ${
                  active
                    ? "border-brand-500 bg-brand-500/10"
                    : "border-transparent bg-transparent hover:bg-[var(--reader-surface-hover)]"
                }`}
              >
                <img src={v.avatar} alt={v.name} className="h-14 w-14 flex-none rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[var(--reader-text)]">{v.name}</div>
                  <div className="mt-0.5 text-xs text-[var(--reader-text-muted)]">{v.traits}</div>
                </div>
                {active && (
                  <span className="flex h-5.5 w-5.5 flex-none items-center justify-center rounded-full bg-[var(--reader-text)]">
                    <Check size={12} className="text-[var(--reader-surface)]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
