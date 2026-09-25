"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import { ArrowRight, Globe, Loader2, Lock, Mic, Pause, Play, Square, X } from "lucide-react";
import { LiveWaveform, WaveformBars } from "../Waveform";
import { formatSeconds, useMeasuredWidth, useWaveformBars } from "./noteAudioUtils";
import { useVoiceRecorder } from "./useVoiceRecorder";
import { useUploadVoiceNote } from "@/lib/community/useUploadVoiceNote";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useNoteVisibilityStore } from "@/stores/noteVisibilityStore";
import type { NoteVisibility } from "@/lib/api/types";
import MembersOnlyPrompt, { type MembersOnlyAction } from "./MembersOnlyPrompt";

// Matches Tailwind's own `sm:` breakpoint (640px) — this is the one place
// that breakpoint has to be a real JS decision rather than a CSS class:
// which of two entirely different DOM shapes to render (see `isDesktop`
// below), not just how one shared shape is sized. A precise/hover pointer
// is desktop's actual signal (a touch laptop under 640px should still get
// the immersive mobile treatment, a mouse-driven window resized wide
// shouldn't switch to a modal mid-drag) but width is what Tailwind's own
// `sm:` already means everywhere else in this codebase, and this composer
// living in a fixed-width side panel either way makes the distinction
// mostly moot in practice.
const DESKTOP_BREAKPOINT_PX = 640;

// Caps how tall the textarea will grow to fit a long note before it starts
// scrolling internally instead — a chat-input pattern (Slack/iMessage-style).
// Mobile's immersive overlay gets the roomier pair (it's the whole point of
// a full-screen surface, not one item sharing space in a list); desktop
// keeps the original inline-box shape the reader asked to get back, just a
// bit taller than the original 150px.
const MOBILE_MAX_TEXTAREA_HEIGHT = 320;
// Starts this tall even empty on mobile — an inviting, obviously-a-real-
// writing-space box (the X/Facebook "what's on your mind" feel) rather than
// a one-line input that happens to grow. Desktop's inline box has no
// equivalent minimum — it still starts at one line and grows, matching how
// it always has.
const MOBILE_MIN_TEXTAREA_HEIGHT = 120;
const DESKTOP_MAX_TEXTAREA_HEIGHT = 260;

/** The text/voice composer — shared by every composing surface in the
 * thread panel: a brand-new top-level note, a reply to a note or another
 * reply, and editing an existing entry in place.
 *
 * Starts as a single-line idle pill inline in the panel (see
 * `startCollapsed`) on every screen size. Focusing it (or tapping its mic)
 * then forks by `isDesktop`:
 * - Mobile hands off to a `createPortal`'d full-screen overlay — the
 *   "immersive, modern" compose surface X/Facebook/etc. use on a phone, so
 *   the reader isn't fighting a cramped inline box (and, on iOS Safari, the
 *   keyboard's viewport resize) the moment they start typing.
 * - Desktop stays exactly where the pill already was — a plain inline box
 *   that grows in place, just a bit taller than before a modal was ever
 *   tried here. A desktop reader already has the screen real estate and
 *   pointer precision a modal is meant to compensate for on a phone; taking
 *   over the whole screen (or even just dimming behind a centered card) for
 *   what's still a small, contextual write here read as a worse fit for the
 *   surface, not a better one. */
export default function NoteComposer({
  initialText,
  initialVisibility,
  placeholder = "Add a note…",
  startCollapsed = false,
  showMemberPrompt = false,
  action = "note",
  onCancel,
  excludeRef,
  onSave,
}: {
  initialText: string;
  /** The toggle's own starting value. Present only for editing an existing
   * entry in place — that composer should reflect *this note's* current
   * visibility, not silently override it with whatever the reader happened
   * to leave the toggle on last time (see useNoteVisibilityStore's own doc
   * comment). Every fresh compose surface (root note or reply) omits this
   * and falls back to that persisted last-used preference instead. */
  initialVisibility?: NoteVisibility;
  placeholder?: string;
  /** True for a fresh compose surface (root or reply) — starts as the
   * idle pill. False for editing an existing entry in place, which starts
   * already expanded with `initialText` filled in. */
  startCollapsed?: boolean;
  /** Show the signed-out membership prompt for an explicitly requested
   * reply. General compose surfaces stay out of the way for signed-out
   * readers instead of repeating the prompt throughout the panel. */
  showMemberPrompt?: boolean;
  /** Which MembersOnlyPrompt copy to show while signed out — a root
   * composer is always "note", a thread's retargetable composer is "reply"
   * once it's actually targeting one. */
  action?: MembersOnlyAction;
  /** Present for a reply composer (closes/unmounts it) and for editing
   * (steps back to the saved view). Absent for the root composer, whose
   * Cancel instead collapses itself back to the idle pill in place — it's
   * a permanent fixture, never unmounted. */
  onCancel?: () => void;
  /** The trigger (e.g. the "Reply" button) that opened this composer —
   * clicks on it never count as "outside" for the click-outside dismissal
   * below, so tapping that same trigger again to close it goes through
   * its own toggle handler instead of racing with this composer's own
   * dismissal and immediately reopening. */
  excludeRef?: RefObject<HTMLElement | null>;
  onSave: (
    content: { kind: "text"; text: string } | { kind: "voice"; audioUrl: string; durationMs: number },
    visibility: NoteVisibility
  ) => void;
}) {
  const isAuthenticated = useIsAuthenticated();
  const [text, setText] = useState(initialText);
  const [expanded, setExpanded] = useState(!startCollapsed);
  const [isFocused, setIsFocused] = useState(false);
  const lastVisibility = useNoteVisibilityStore((s) => s.lastVisibility);
  const setLastVisibility = useNoteVisibilityStore((s) => s.setLastVisibility);
  // Locked in once at mount, same reasoning as `text`'s own useState(initialText)
  // — this is a starting value, not a live subscription; a reader flipping
  // the toggle on some *other* composer elsewhere shouldn't reach into this
  // one mid-edit and change what it's about to save.
  const [visibility, setVisibility] = useState<NoteVisibility>(initialVisibility ?? lastVisibility);
  const toggleVisibility = () => {
    const next: NoteVisibility = visibility === "public" ? "private" : "public";
    setVisibility(next);
    // Only a fresh compose surface's own choice becomes the new default for
    // next time — flipping an edit's toggle changes just this one note,
    // same "this instance only" scope `initialVisibility` itself has.
    if (!initialVisibility) setLastVisibility(next);
  };
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [waveRef, waveWidth] = useMeasuredWidth<HTMLDivElement>();
  const uploadVoiceNote = useUploadVoiceNote();
  const recorder = useVoiceRecorder();
  const recordedBars = useWaveformBars(recorder.audioBlob);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Which of the two composer shapes to render — see this component's own
  // doc comment. Starts `false` (mobile) so a server-rendered/first-paint
  // pass on a phone never briefly shows the desktop inline box before
  // hydration corrects it — but that correction runs in a *layout* effect,
  // not a regular one: a layout effect fires synchronously after commit
  // but before the browser paints, so even a composer that mounts fresh
  // on a wide desktop screen (any reply composer, opened by a click) never
  // actually paints the wrong shape first — regular `useEffect` runs after
  // paint, which is what let the mobile full-screen overlay (and its
  // `document.body.style.overflow = "hidden"`) flash into view for one
  // frame on desktop before flipping back. `matchMedia`'s own `change`
  // event (not a resize listener) is what keeps this in sync with the
  // viewport afterward, same idiom, cheaper than a resize listener that
  // only ever cares about one threshold crossing.
  const [isDesktop, setIsDesktop] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Grows the textarea to fit its content (past which it scrolls internally
  // — the `om-scroll` class) instead of a fixed-height box, which clipped
  // anything longer than a couple of lines — both while typing and while
  // editing an already-long saved note. Bounds differ by shape (see the
  // MOBILE_*/DESKTOP_* constants' own doc comments).
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = isDesktop ? DESKTOP_MAX_TEXTAREA_HEIGHT : MOBILE_MAX_TEXTAREA_HEIGHT;
    const min = isDesktop ? 0 : MOBILE_MIN_TEXTAREA_HEIGHT;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
  }, [isDesktop]);

  // Re-measures whenever the textarea (re)appears — on mount (so an existing
  // long note starts already expanded, no flash of a clipped single line)
  // and whenever `mode` swings back to "idle" (the textarea unmounts while
  // recording/reviewing a voice draft, so its inline height is lost and
  // needs recomputing once it returns).
  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, recorder.mode]);

  // Expanding from the idle pill (focus, or the pill's own mic button)
  // should land the cursor straight in the textarea, same as tapping into
  // any other chat composer — not leave the reader to find and click it.
  useEffect(() => {
    if (expanded && recorder.mode === "idle") textareaRef.current?.focus();
  }, [expanded, recorder.mode]);

  const canSave =
    recorder.mode === "recorded" ? Boolean(recorder.audioUrl) && !isUploadingVoice : text.trim().length > 0;
  const hasDraft = recorder.mode === "recorded" || text.trim().length > 0;

  const handleSave = async () => {
    if (recorder.mode === "recorded" && recorder.audioBlob) {
      setUploadError(false);
      setIsUploadingVoice(true);
      let audioUrl: string;
      try {
        audioUrl = await uploadVoiceNote.mutateAsync(recorder.audioBlob);
      } catch {
        // Keep the draft intact so a flaky connection never costs the
        // reader their recording — same "fail safe, not destructive"
        // stance as the store's own hasHydrated guard.
        setIsUploadingVoice(false);
        setUploadError(true);
        return;
      }
      setIsUploadingVoice(false);
      onSave({ kind: "voice", audioUrl, durationMs: recorder.audioDurationMs }, visibility);
    } else if (text.trim()) {
      onSave({ kind: "text", text: text.trim() }, visibility);
    } else {
      return;
    }
    // Self-resets to a pristine idle pill after every save — this is what
    // lets the root composer stay a permanent fixture with no parent-side
    // remount trick, and is harmless everywhere else too (an editing or
    // reply composer's parent typically unmounts it right after, per its
    // own onSave handler). Uses releaseDraft, not discardRecording — the
    // NoteEntry now points at its own uploaded copy, not this draft's blob
    // URL, but discardRecording revoking that blob URL out from under this
    // same composer's just-finished recorded-review UI mid-reset would
    // still be wrong. Visibility resets to the (possibly just-updated)
    // persisted default, not hardcoded back to "public" — a root composer
    // that just posted privately should still default to private next time.
    setText("");
    setVisibility(lastVisibility);
    if (recorder.mode !== "idle") recorder.releaseDraft();
    setExpanded(false);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    if (recorder.mode !== "idle") recorder.discardRecording();
    setText("");
    setExpanded(false);
  };

  const handlePillMic = () => {
    setExpanded(true);
    recorder.startRecording();
  };

  // Clicking anywhere outside this composer reverts it — closes a reply/
  // edit instance back to nothing (via onCancel, same as its own Cancel
  // button) so the root composer reappears, or collapses the root
  // composer itself back to its idle pill. This is what makes clicking
  // "Reply" and then changing your mind actually discoverable — the pill
  // that opens has no Cancel button of its own, only the expanded chrome
  // does. Only fires when there's nothing to lose: typed text, a
  // recording actively in progress, or a completed-but-unsaved take are
  // never discarded by a stray click, only by an explicit Cancel/Discard.
  //
  // A single retargetable composer (NoteThreadCard) is shared by every
  // reply's own "Reply" trigger in its thread — any one of them can be the
  // click that just retargeted this same composer instance, so excludeRef
  // (one specific ref) isn't enough on its own. Every such trigger instead
  // marks itself with `data-note-reply-trigger`, and any click landing on
  // one is never treated as "outside" regardless of which reply it belongs
  // to.
  const hasUnsavedProgress = hasDraft || recorder.mode === "recording";
  useEffect(() => {
    if (hasUnsavedProgress) return;
    const onOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (excludeRef?.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-note-reply-trigger]")) return;
      handleCancel();
    };
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleCancel/onCancel close over stable identity per mount for this component's purposes; re-subscribing on hasUnsavedProgress/excludeRef is sufficient.
  }, [hasUnsavedProgress, excludeRef]);

  // Only the mobile overlay covers the whole screen — desktop's inline box
  // is still just one item among others in the panel's own scroll region,
  // same as it always was, so locking the page behind it would be wrong
  // there (there's no "behind it" the reader could accidentally scroll into
  // in the first place). `startCollapsed === false` (the edit-in-place
  // composer) never renders the idle pill at all, going straight to
  // `expanded` on mount, so this needs to run for that case too — not just
  // the pill-to-overlay handoff.
  useEffect(() => {
    if (!expanded || isDesktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded, isDesktop]);

  // Not part of MembersOnlyAction (that's about *why* a write was blocked,
  // shown while signed out) — this is purely the mobile overlay header's
  // own label for a signed-in reader (desktop's inline box has no header to
  // put it in), one of the three shapes this component ever actually
  // renders expanded in: writing a fresh top-level note, replying, or
  // editing something already saved (`startCollapsed` is only ever passed
  // `false` by an in-place edit — see its own doc comment).
  const headerTitle = !startCollapsed ? "Edit note" : action === "reply" ? "Reply" : "New note";

  // The public/private toggle — one shared element both the desktop and
  // mobile return shapes below render (rather than two hand-maintained
  // copies), right in the same toolbar row as the mic button in both. A
  // small pill rather than a checkbox/switch: it needs to carry its own
  // label (which state it's *in*, not just an on/off position) since
  // there's no separate text anywhere else in either layout saying so.
  const visibilityToggle = (
    <button
      type="button"
      onClick={toggleVisibility}
      title={
        visibility === "public"
          ? "Visible to everyone — tap to make this just for you"
          : "Only visible to you — tap to make this public"
      }
      className="flex flex-none items-center gap-1 rounded-full border border-[var(--reader-border)] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-[var(--reader-text-muted)] cursor-pointer hover:text-[var(--reader-text)] hover:bg-[var(--reader-surface-hover)]"
    >
      {visibility === "public" ? <Globe size={12} /> : <Lock size={12} />}
      {visibility === "public" ? "Public" : "Private"}
    </button>
  );

  // A membership prompt is feedback for a deliberate attempt to reply, not
  // persistent panel copy. Keeping it opt-in prevents repeated prompts when
  // a panel contains several otherwise-idle compose surfaces.
  if (!isAuthenticated) {
    if (!showMemberPrompt) return null;
    // onCancel is the same "collapse this composer back" handler as ever —
    // present for a reply/edit composer (so its prompt gets a real close
    // button), absent for the root composer (nothing to collapse back to,
    // since this prompt is all it ever renders while signed out). Wrapped in
    // containerRef same as every other branch below — without it, the
    // outside-click handler above has nothing to recognize as "inside," so
    // a mousedown anywhere (including on this prompt's own Log in/Join us
    // links or its close button) would race handleCancel against the
    // click/navigation itself.
    return (
      <div ref={containerRef}>
        <MembersOnlyPrompt action={action} onClose={onCancel} />
      </div>
    );
  }

  if (!expanded) {
    return (
      <div ref={containerRef} className="flex items-center gap-2">
        <input
          onFocus={() => setExpanded(true)}
          placeholder={placeholder}
          className="flex-1 rounded-sm border border-[var(--reader-border)] bg-[var(--reader-surface-hover)] px-3.5 py-2 text-[13px] font-medium text-[var(--reader-text)] outline-none placeholder:text-[var(--reader-text-muted)]"
        />
        <button
          onClick={handlePillMic}
          title="Record a voice note"
          className="flex h-8.5 w-8.5 flex-none items-center justify-center rounded-full border-none bg-[var(--reader-surface-hover)] text-[var(--reader-text-muted)] cursor-pointer hover:text-[var(--reader-text)]"
        >
          <Mic size={15} />
        </button>
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div
        ref={containerRef}
        className={`rounded-sm p-3 flex flex-col gap-2.5 border transition-colors ${
          hasDraft || recorder.mode === "recording" || isFocused
            ? "border-brand-300 bg-[var(--reader-surface)]"
            : "border-[var(--reader-border)] bg-[var(--reader-surface-hover)]"
        }`}
      >
        {recorder.mode === "recording" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-500 flex-none animate-pulse" />
              <span className="text-sm font-semibold tabular-nums text-[var(--reader-text)]">
                {formatSeconds(recorder.recordSeconds)}
              </span>
              <span className="text-xs text-[var(--reader-text-muted)]">Recording&hellip;</span>
            </div>
            <div ref={waveRef} className="h-8 w-full">
              {recorder.mediaRecorder && waveWidth > 0 && (
                <LiveWaveform
                  stream={recorder.mediaRecorder.stream}
                  width={waveWidth}
                  height={32}
                  barWidth={2.5}
                  gap={1}
                  barColor="var(--color-brand-500)"
                />
              )}
            </div>
          </div>
        ) : recorder.mode === "recorded" ? (
          <div onClick={recorder.toggleDraftPlayback} className="cursor-pointer flex items-center gap-2">
            <span className="w-6.5 h-6.5 rounded-full bg-brand-500 flex items-center justify-center flex-none text-white">
              {recorder.isPlayingDraft ? <Pause size={11} /> : <Play size={11} fill="currentColor" stroke="none" />}
            </span>
            <div ref={waveRef} className="flex-1 min-w-0 h-8">
              {waveWidth > 0 && (
                <WaveformBars
                  bars={recordedBars}
                  width={waveWidth}
                  height={32}
                  barWidth={2.5}
                  gap={1}
                  barColor="var(--reader-text-subtle)"
                  barPlayedColor="var(--color-brand-500)"
                  progress={
                    recorder.audioDurationMs > 0 ? recorder.draftCurrentTime / (recorder.audioDurationMs / 1000) : 0
                  }
                />
              )}
            </div>
            <span className="text-xs font-medium text-[var(--reader-text-muted)] flex-none">
              {formatSeconds(recorder.audioDurationMs / 1000)}
            </span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              resizeTextarea();
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            className="om-scroll w-full resize-none border-none outline-none bg-transparent text-[13px] font-medium text-[var(--reader-text)] placeholder:text-[var(--reader-text-muted)]"
            style={{ maxHeight: DESKTOP_MAX_TEXTAREA_HEIGHT, overflowY: "auto" }}
          />
        )}

        <div className="flex justify-between items-center gap-1.5">
          <div className="flex items-center">
            {recorder.mode === "recorded" ? (
              <button
                onClick={recorder.discardRecording}
                disabled={isUploadingVoice}
                title="Discard recording"
                className="w-7 h-7 rounded-full border-none cursor-pointer flex items-center justify-center flex-none bg-transparent text-[var(--reader-text-muted)] disabled:cursor-default disabled:opacity-50"
              >
                <X size={15} />
              </button>
            ) : recorder.mode === "idle" ? (
              <div className="flex items-center gap-1.5">
                {visibilityToggle}
                <button
                  onClick={recorder.startRecording}
                  title="Record a voice note"
                  className="w-7 h-7 rounded-full border-none cursor-pointer flex items-center justify-center flex-none bg-transparent text-[var(--reader-text-muted)] hover:text-[var(--reader-text)] hover:bg-[var(--reader-surface-hover)]"
                >
                  <Mic size={16} />
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {recorder.mode === "recording" ? (
              <button
                onClick={recorder.stopRecording}
                className="w-7 h-7 rounded-full bg-brand-500 border-none cursor-pointer flex items-center justify-center flex-none text-white"
              >
                <Square size={11} fill="currentColor" />
              </button>
            ) : (
              <>
                {recorder.mode === "idle" && (
                  <button
                    onClick={handleCancel}
                    className="bg-transparent border-none cursor-pointer text-xs font-medium text-[var(--reader-text-muted)] px-1 py-1.5"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  title="Send"
                  className={`w-7 h-7 rounded-full border-none flex items-center justify-center flex-none transition-colors ${
                    canSave
                      ? "bg-brand-500 text-white cursor-pointer hover:bg-brand-600"
                      : "bg-[var(--reader-surface-hover)] text-[var(--reader-text-muted)] cursor-default"
                  }`}
                >
                  {isUploadingVoice ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                </button>
              </>
            )}
          </div>
        </div>
        {recorder.micError && (
          <div className="text-[11px] text-[var(--reader-text-muted)]">
            Couldn&rsquo;t access the microphone — check your browser&rsquo;s permission for this site.
          </div>
        )}
        {uploadError && (
          <div className="text-[11px] text-[var(--reader-text-muted)]">
            Couldn&rsquo;t save the voice note — check your connection and try again.
          </div>
        )}
      </div>
    );
  }

  // Guards against an SSR crash in a hypothetical future call site that
  // renders straight into `expanded` on first mount (every one today starts
  // collapsed or, for editing, only mounts client-side from a click — see
  // headerTitle's own doc comment) — `document` doesn't exist server-side.
  // Also covers the very first client render, before the isDesktop effect
  // above has run: `isDesktop` starts false, so a desktop reader's first
  // paint would otherwise flash this mobile overlay for one frame.
  if (typeof document === "undefined") return null;

  return createPortal(
    // Edge-to-edge and opaque — this *is* the screen on mobile, no page
    // visible behind it, the immersive takeover a phone actually benefits
    // from (see this component's own doc comment for why desktop opts out
    // of this branch entirely rather than getting a scaled-down version of
    // it). A click landing here (not on the card itself) is "outside" for
    // the existing mousedown listener above — no separate backdrop-click
    // handler needed.
    <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--reader-surface)]">
      <div ref={containerRef} className="flex h-full w-full flex-col bg-[var(--reader-surface)]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex flex-none items-center justify-between gap-3 border-b border-[var(--reader-border)] px-4 py-3">
          <button
            onClick={handleCancel}
            className="bg-transparent border-none cursor-pointer text-sm font-medium text-[var(--reader-text-muted)] hover:text-[var(--reader-text)] px-1 py-1"
          >
            Cancel
          </button>
          <span className="text-sm font-semibold text-[var(--reader-text)]">{headerTitle}</span>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`rounded-full border-none px-4 py-1.5 text-sm font-semibold transition-colors ${
              canSave
                ? "bg-brand-500 text-white cursor-pointer hover:bg-brand-600"
                : "bg-[var(--reader-surface-hover)] text-[var(--reader-text-muted)] cursor-default"
            }`}
          >
            {isUploadingVoice ? (
              <Loader2 size={14} className="animate-spin" />
            ) : !startCollapsed ? (
              "Save"
            ) : (
              "Post"
            )}
          </button>
        </div>

        <div className="om-scroll flex-1 min-h-0 overflow-y-auto p-4">
          {recorder.mode === "recording" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500 flex-none animate-pulse" />
                <span className="text-sm font-semibold tabular-nums text-[var(--reader-text)]">
                  {formatSeconds(recorder.recordSeconds)}
                </span>
                <span className="text-xs text-[var(--reader-text-muted)]">Recording&hellip;</span>
              </div>
              <div ref={waveRef} className="h-10 w-full">
                {recorder.mediaRecorder && waveWidth > 0 && (
                  <LiveWaveform
                    stream={recorder.mediaRecorder.stream}
                    width={waveWidth}
                    height={40}
                    barWidth={2.5}
                    gap={1}
                    barColor="var(--color-brand-500)"
                  />
                )}
              </div>
            </div>
          ) : recorder.mode === "recorded" ? (
            <div onClick={recorder.toggleDraftPlayback} className="cursor-pointer flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center flex-none text-white">
                {recorder.isPlayingDraft ? <Pause size={13} /> : <Play size={13} fill="currentColor" stroke="none" />}
              </span>
              <div ref={waveRef} className="flex-1 min-w-0 h-10">
                {waveWidth > 0 && (
                  <WaveformBars
                    bars={recordedBars}
                    width={waveWidth}
                    height={40}
                    barWidth={2.5}
                    gap={1}
                    barColor="var(--reader-text-subtle)"
                    barPlayedColor="var(--color-brand-500)"
                    progress={
                      recorder.audioDurationMs > 0 ? recorder.draftCurrentTime / (recorder.audioDurationMs / 1000) : 0
                    }
                  />
                )}
              </div>
              <span className="text-xs font-medium text-[var(--reader-text-muted)] flex-none">
                {formatSeconds(recorder.audioDurationMs / 1000)}
              </span>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                resizeTextarea();
              }}
              placeholder={placeholder}
              rows={1}
              className="w-full resize-none border-none outline-none bg-transparent text-base font-medium leading-relaxed text-[var(--reader-text)] placeholder:text-[var(--reader-text-muted)]"
              style={{ minHeight: MOBILE_MIN_TEXTAREA_HEIGHT, maxHeight: MOBILE_MAX_TEXTAREA_HEIGHT, overflowY: "auto" }}
            />
          )}
        </div>

        <div className="flex flex-none items-center justify-between gap-1.5 border-t border-[var(--reader-border)] px-4 py-2.5">
          <div className="flex items-center">
            {recorder.mode === "recorded" ? (
              <button
                onClick={recorder.discardRecording}
                disabled={isUploadingVoice}
                title="Discard recording"
                className="w-8 h-8 rounded-full border-none cursor-pointer flex items-center justify-center flex-none bg-transparent text-[var(--reader-text-muted)] disabled:cursor-default disabled:opacity-50"
              >
                <X size={16} />
              </button>
            ) : recorder.mode === "idle" ? (
              <div className="flex items-center gap-1.5">
                {visibilityToggle}
                <button
                  onClick={recorder.startRecording}
                  title="Record a voice note"
                  className="w-8 h-8 rounded-full border-none cursor-pointer flex items-center justify-center flex-none bg-transparent text-[var(--reader-text-muted)] hover:text-[var(--reader-text)] hover:bg-[var(--reader-surface-hover)]"
                >
                  <Mic size={17} />
                </button>
              </div>
            ) : null}
          </div>
          {recorder.mode === "recording" && (
            <button
              onClick={recorder.stopRecording}
              className="w-8 h-8 rounded-full bg-brand-500 border-none cursor-pointer flex items-center justify-center flex-none text-white"
            >
              <Square size={12} fill="currentColor" />
            </button>
          )}
        </div>
        {(recorder.micError || uploadError) && (
          <div className="flex-none px-4 pb-3 text-[11px] text-[var(--reader-text-muted)]">
            {recorder.micError
              ? "Couldn’t access the microphone — check your browser’s permission for this site."
              : "Couldn’t save the voice note — check your connection and try again."}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
