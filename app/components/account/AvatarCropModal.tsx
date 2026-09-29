"use client";

import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { X } from "lucide-react";
import AuthButton from "@/app/components/auth/AuthButton";

/** Circular crop over the picked photo — drag to frame, slider to zoom.
 * Hands the selected pixel area back to the caller, which owns encoding and
 * upload (lib/avatar). Backdrop click and Escape dismiss it, same as
 * InstallModal. */
export default function AvatarCropModal({
  src,
  saving,
  error,
  onCancel,
  onSave,
}: {
  src: string;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (area: Area) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="flex w-full max-w-[400px] flex-col overflow-hidden rounded-xl bg-[var(--reader-surface)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--reader-border)] px-4 py-3.5">
          <h2 className="m-0 text-[13px] font-bold text-[var(--reader-text)]">Crop your photo</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="cursor-pointer rounded-sm border-none bg-transparent p-1 text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative aspect-square w-full bg-black">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>

        <div className="flex flex-col gap-3 px-4 py-3.5">
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="w-full accent-brand-500"
          />
          {error && <p className="m-0 text-xs font-medium text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-sm border-none bg-transparent px-4 py-2 text-[14px] font-bold text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
            >
              Cancel
            </button>
            <AuthButton type="button" fullWidth={false} disabled={!area || saving} onClick={() => area && onSave(area)}>
              {saving ? "Saving…" : "Use photo"}
            </AuthButton>
          </div>
        </div>
      </div>
    </div>
  );
}
