"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Area } from "react-easy-crop";
import { Check, Upload } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useUpdateProfile } from "@/lib/auth/useUpdateProfile";
import { useUploadAvatar } from "@/lib/avatar/useAvatar";
import { cropToAvatar } from "@/lib/avatar/cropImage";
import { AVATAR_COLORS, AVATAR_SOURCE_MAX_BYTES, avatarChoice, type AvatarColor } from "@/lib/avatar/avatar";
import type { ReaderProfile } from "@/lib/api/types";
import ReaderAvatar from "@/app/components/shared/ReaderAvatar";
import AvatarCropModal from "./AvatarCropModal";

const SIZE = 48;
const COLORS = Object.keys(AVATAR_COLORS) as AvatarColor[];

function Option({
  selected,
  label,
  onClick,
  children,
}: {
  selected?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`relative flex cursor-pointer rounded-full border-none bg-transparent p-0 ${
        selected ? "outline-[2.5px] outline-offset-2 outline-brand-500 outline-solid" : ""
      }`}
    >
      {children}
      {selected && (
        <span className="absolute -right-0.5 -bottom-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--reader-surface)] bg-brand-500 text-white">
          <Check size={10} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/** Account settings' avatar grid (ui-mockups/Profile Dropdown and Edit.dc.html):
 * the default colors, the reader's own photo once uploaded, and an upload
 * tile. Picks save immediately — there's nothing to review before a Save. */
export default function AvatarPicker({ reader }: { reader: ReaderProfile }) {
  const select = useUpdateProfile();
  const upload = useUploadAvatar();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string>();

  // The pending pick shows as selected straight away.
  const current = select.isPending
    ? (select.variables.avatarColor ?? "photo")
    : avatarChoice(reader.pseudonym, reader.avatar);
  const error = pickError ?? errorMessage(select.error);

  const closeCrop = () => {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    upload.reset();
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > AVATAR_SOURCE_MAX_BYTES) return setPickError("That photo is over 25 MB — pick a smaller one.");
    setPickError(undefined);
    setSource(URL.createObjectURL(file));
  };

  const onSave = async (area: Area) => {
    const blob = await cropToAvatar(source!, area);
    upload.mutate(blob, { onSuccess: closeCrop });
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="-mb-1 text-[13px] font-bold text-[var(--reader-text)]">Avatar</span>
      <div className="flex flex-wrap gap-2.5">
        {COLORS.map((color) => (
          <Option
            key={color}
            label={`${color} avatar`}
            selected={current === color}
            onClick={() => select.mutate({ avatarColor: color })}
          >
            <ReaderAvatar pseudonym={reader.pseudonym} avatar={{ color, url: null }} size={SIZE} />
          </Option>
        ))}
        {reader.avatar.url && (
          <Option label="Your photo" selected={current === "photo"} onClick={() => select.mutate({ avatarColor: null })}>
            <ReaderAvatar pseudonym={reader.pseudonym} avatar={{ color: null, url: reader.avatar.url }} size={SIZE} />
          </Option>
        )}
        <Option label="Upload a photo" onClick={() => fileInput.current?.click()}>
          <span
            style={{ width: SIZE, height: SIZE }}
            className="flex items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--reader-border)] text-[var(--reader-text-muted)]"
          >
            <Upload size={16} />
          </span>
        </Option>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="m-0 text-xs font-medium text-red-500">{error}</p>}
      <p className="m-0 text-xs font-medium text-[var(--reader-text-muted)]">
        Pick one of the defaults, or upload your own — the defaults stay available even after you upload a photo.
      </p>

      {source && (
        <AvatarCropModal
          src={source}
          saving={upload.isPending}
          error={errorMessage(upload.error)}
          onCancel={closeCrop}
          onSave={onSave}
        />
      )}
    </div>
  );
}
