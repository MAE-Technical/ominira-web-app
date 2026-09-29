"use client";

import SelectField from "@/app/components/auth/SelectField";
import TextField from "@/app/components/auth/TextField";

/** Where tapping a broadcast (push, feed entry or email button) takes the
 * reader — or nowhere in particular, for a plain message. */
export type Destination = { kind: "none" } | { kind: "page"; url: string } | { kind: "custom"; url: string };

const PAGES = [
  { url: "/home", label: "Home" },
  { url: "/library", label: "Library" },
  { url: "/shelf", label: "Shelf" },
  { url: "/notes", label: "Notes" },
  { url: "/notifications", label: "Notifications" },
] as const;

const NONE = "";
const CUSTOM = "custom";

export const DEFAULT_DESTINATION: Destination = { kind: "none" };

// An in-app path, or an absolute https link — what sw.js's notificationclick
// can open. Mirrors BroadcastSchema in app/api/admin/push/broadcast/route.ts.
const isValidLink = (url: string) => /^\/(?!\/)\S*$/.test(url) || /^https:\/\/\S+$/.test(url);

export const destinationUrl = (d: Destination) => (d.kind === "none" ? "" : d.url.trim());

export const isDestinationValid = (d: Destination) => d.kind === "none" || isValidLink(destinationUrl(d));

export const destinationLabel = (d: Destination) =>
  d.kind === "none" ? "No link" : (d.kind === "page" && PAGES.find((p) => p.url === d.url)?.label) || d.url.trim() || "—";

/** For reusing a past broadcast — history only stores the URL. */
export const destinationFromUrl = (url: string): Destination =>
  !url ? { kind: "none" } : PAGES.some((p) => p.url === url) ? { kind: "page", url } : { kind: "custom", url };

export default function DestinationPicker({ value, onChange }: { value: Destination; onChange: (d: Destination) => void }) {
  const invalid = value.kind === "custom" && value.url.trim() !== "" && !isValidLink(value.url.trim());

  return (
    <div className="flex flex-col gap-3">
      <div>
        <SelectField
          label="Link (optional)"
          id="push-destination"
          value={value.kind === "none" ? NONE : value.kind === "custom" ? CUSTOM : value.url}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === NONE ? { kind: "none" } : next === CUSTOM ? { kind: "custom", url: "" } : { kind: "page", url: next });
          }}
          className="cursor-pointer"
        >
          <option value={NONE}>No link, just the message</option>
          <optgroup label="Ominira pages">
            {PAGES.map((p) => (
              <option key={p.url} value={p.url}>
                {p.label}
              </option>
            ))}
          </optgroup>
          <option value={CUSTOM}>Custom link…</option>
        </SelectField>
        <p className="m-0 mt-1.5 text-xs font-medium text-[var(--reader-text-muted)]">
          The page members land on when they tap the notification or the email&apos;s button.
        </p>
      </div>

      {value.kind === "custom" && (
        <TextField
          label="Custom link"
          id="push-custom-link"
          value={value.url}
          onChange={(e) => onChange({ kind: "custom", url: e.target.value })}
          maxLength={500}
          placeholder="https://"
          autoFocus
          error={invalid ? "Paste a full link starting with https://" : undefined}
        />
      )}
    </div>
  );
}
