"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getNames } from "country-list";
import { LogOut } from "lucide-react";
import Loader from "@/app/components/Loader";
import ThemeToggle from "@/app/components/shell/ThemeToggle";
import { useSessionStore } from "@/stores/session-store";
import { useInstallBannerStore } from "@/stores/install-banner-store";
import { useInstallPrompt } from "@/lib/pwa/useInstallPrompt";
import InstallModal from "@/app/components/pwa/InstallModal";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useProfile } from "@/lib/auth/useProfile";
import { useLogout } from "@/lib/auth/useLogout";
import { useUpdateProfile } from "@/lib/auth/useUpdateProfile";
import { useCheckAvailability } from "@/lib/auth/useCheckAvailability";
import { errorMessage, fieldError } from "@/lib/api/client";
import { pseudonymToSlug } from "@/lib/reader/profileSlug";
import { comradeName } from "@/lib/reader/authorDisplay";
import type { ReaderProfile } from "@/lib/api/types";
import ReaderAvatar from "@/app/components/shared/ReaderAvatar";
import AvatarPicker from "@/app/components/account/AvatarPicker";
import DetailHeader from "@/app/components/shared/DetailHeader";
import UnderlineTabs from "@/app/components/UnderlineTabs";
import TextField from "@/app/components/auth/TextField";
import SelectField from "@/app/components/auth/SelectField";
import AuthButton from "@/app/components/auth/AuthButton";
import { useWebPush } from "@/lib/push/useWebPush";
import Switch from "@/app/components/shell/Switch";

const APP_VERSION = "0.2.0";
const COUNTRIES = [...getNames().sort((a, b) => a.localeCompare(b)), "Other"];

type Tab = "profile" | "preferences";
const TABS: { value: Tab; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "preferences", label: "Preferences" },
];

/** Label/caption on the left, control on the right, hairline between rows —
 * the mockup's notification-toggle row, used for every on/off preference. */
function SettingRow({ label, sub, children }: { label: ReactNode; sub?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-[var(--reader-text)]">{label}</div>
        {sub && <div className="mt-0.5 text-xs font-medium text-[var(--reader-text-muted)]">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

/** Browser/PWA push (reactions, replies, announcements). Works before login
 * too — see lib/push/useWebPush.ts on why subscribing doesn't need a session. */
function NotificationsRow() {
  const { supported, permission, subscribe, unsubscribe } = useWebPush();
  const [pending, setPending] = useState(false);

  if (!supported) return null;

  const onToggle = async (next: boolean) => {
    setPending(true);
    try {
      if (next) await subscribe();
      else await unsubscribe();
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingRow
      label="Push notifications"
      sub={permission === "denied" ? "Blocked in your browser settings" : "Replies and reactions to your posts"}
    >
      <Switch
        checked={permission === "granted"}
        onChange={onToggle}
        disabled={pending || permission === "denied"}
        ariaLabel="Push notifications"
      />
    </SettingRow>
  );
}

/** Opt-in to admin email announcements (off by default — see
 * migrations/20261008_email_announcements.sql). Saves on toggle, same as
 * the push switch above; every email also carries a one-click unsubscribe. */
function EmailAnnouncementsRow({ reader }: { reader: ReaderProfile }) {
  const update = useUpdateProfile();
  // Show the requested state while the save is in flight, not the stale one.
  const checked = update.isPending ? !!update.variables?.emailAnnouncements : reader.emailAnnouncements;

  return (
    <SettingRow
      label="Email announcements"
      sub={update.isError ? "Couldn’t save — try again" : `Occasional updates from Ominira`}
    >
      <Switch
        checked={checked}
        onChange={(next) => update.mutate({ emailAnnouncements: next })}
        disabled={update.isPending}
        ariaLabel="Email announcements"
      />
    </SettingRow>
  );
}

/** The calm, always-there install option — no dismiss/cooldown, unlike
 * HomeInstallBanner. Same InstallModal that banner opens for the manual
 * iOS/Android walkthrough, rather than a second set of instructions here. */
function InstallRow() {
  const [modalOpen, setModalOpen] = useState(false);
  const { canPrompt, promptInstall, isInstalled } = useInstallPrompt();
  const hasHydrated = useInstallBannerStore((s) => s.hasHydrated);

  if (!hasHydrated || isInstalled) return null;

  return (
    <SettingRow label="Install Ominira" sub="Add it to your home screen for a full-screen reader">
      <AuthButton
        variant="solid"
        fullWidth={false}
        className="flex-none px-3 py-1.5 text-[13px]"
        onClick={canPrompt ? promptInstall : () => setModalOpen(true)}
      >
        Install
      </AuthButton>
      <InstallModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </SettingRow>
  );
}

/** Pseudonym/email/location, editable in place and saved together — the
 * mockup's Account + Location fields. Email is shown, not editable: PATCH
 * /me doesn't change it (it's the Supabase auth identity, not a profile
 * column). A successful save resets the draft to the server's own normalized
 * values (trimmed, blank location cleared), so it reads clean again. */
function ProfileForm({ reader }: { reader: ReaderProfile }) {
  const [pseudonym, setPseudonym] = useState(reader.pseudonym);
  const [city, setCity] = useState(reader.city ?? "");
  const [country, setCountry] = useState(reader.country ?? "");
  const update = useUpdateProfile();

  const pseudonymChanged = pseudonym.trim() !== reader.pseudonym;
  const pseudonymFormatValid = pseudonym.trim().length > 0 && pseudonym.length <= 20;
  const availability = useCheckAvailability("pseudonym", pseudonym, pseudonymChanged && pseudonymFormatValid);
  const pseudonymError =
    fieldError(update.error, "pseudonym") ??
    (!pseudonymFormatValid
      ? "Pseudonym must be 1–20 characters."
      : pseudonymChanged && availability.available === false
        ? "That pseudonym is taken — try another."
        : undefined);

  const dirty = pseudonymChanged || city !== (reader.city ?? "") || country !== (reader.country ?? "");
  const canSave = dirty && !pseudonymError && !update.isPending && (!pseudonymChanged || availability.available === true);

  const syncTo = (saved: ReaderProfile) => {
    setPseudonym(saved.pseudonym);
    setCity(saved.city ?? "");
    setCountry(saved.country ?? "");
  };
  const reset = () => {
    syncTo(reader);
    update.reset();
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) update.mutate({ pseudonym: pseudonym.trim(), city, country }, { onSuccess: ({ reader: saved }) => syncTo(saved) });
      }}
    >
        <TextField
          label="Pseudonym"
          name="pseudonym"
          maxLength={20}
          hint={pseudonymChanged && availability.isChecking ? "Checking…" : `${pseudonym.length}/20`}
          value={pseudonym}
          onChange={(e) => setPseudonym(e.target.value)}
          error={pseudonymError}
        />
        <p className="-mt-2 mb-0 text-xs font-medium text-[var(--reader-text-muted)]">
          The name comrades should know you by — not your government name.
        </p>
        <TextField label="Email" name="email" value={reader.email} disabled readOnly className="opacity-70" />
        <p className="-mt-2 mb-0 text-xs font-medium text-[var(--reader-text-muted)]">
          Used for sign-in and account recovery only — never revealed to anyone.
        </p>
        <div className="flex flex-col gap-4 shell:flex-row">
          <div className="flex-1">
            <TextField label="City" name="city" placeholder="e.g. Accra" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="flex-1">
            <SelectField label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Select your country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <p className="-mt-2 mb-0 text-xs font-medium text-[var(--reader-text-muted)]">
          We don&rsquo;t track your location. Your city and country only show on your profile, so comrades know
          they&rsquo;re reading with other Africans from around the world.
        </p>

      {errorMessage(update.error) && (
        <p className="m-0 text-xs font-medium text-red-500">{errorMessage(update.error)}</p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-[var(--reader-border)] pt-4">
        {update.isSuccess && !dirty && (
          <span className="mr-auto text-xs font-semibold text-[var(--color-forest-500)]">Saved</span>
        )}
        {dirty && (
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer rounded-sm border-none bg-transparent px-4 py-2 text-[14px] font-bold text-[var(--reader-text-muted)] hover:text-[var(--reader-text)]"
          >
            Cancel
          </button>
        )}
        <AuthButton type="submit" fullWidth={false} disabled={!canSave}>
          {update.isPending ? "Saving…" : "Save changes"}
        </AuthButton>
      </div>
    </form>
  );
}

/**
 * Account settings — follows the account-settings frames of
 * ui-mockups/Profile Dropdown and Edit.dc.html: back + title row
 * (DetailHeader, same as a material or profile page, minus share), the
 * reader's own identity with a way through to their public profile, then
 * underline tabs (the mockup's mobile tab strip, used at every width, same
 * as the profile page) over the fields themselves — no section headings.
 *
 * Only what the API can actually persist is editable: the avatar
 * (AvatarPicker, saved on pick) and pseudonym/location through PATCH /me.
 * The mockup's bio, location toggle and per-kind notification switches have
 * no route behind them yet (20260919_account_settings.sql adds the columns,
 * nothing reads them), so they're left out rather than rendered as controls
 * that don't save.
 */
export default function AccountView() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { data: reader } = useProfile();
  const logout = useLogout();
  const [tab, setTab] = useState<Tab>("profile");

  // InstallRow needs this rehydrated independently of HomeInstallBanner,
  // since a reader landing straight on /account would otherwise never
  // trigger it.
  useEffect(() => {
    useInstallBannerStore.persist.rehydrate();
  }, []);

  // Signed-in only: once the session store has rehydrated (before that,
  // isAuthenticated is false for everyone), send a signed-out reader to log
  // in rather than render a second, signed-out variant of the page.
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  useEffect(() => {
    if (hasHydrated && !isAuthenticated) router.replace("/auth/login");
  }, [hasHydrated, isAuthenticated, router]);

  return (
    <div className="pb-12 shell:mx-auto shell:max-w-2xl">
      <DetailHeader
        title="Account settings"
        onBack={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      />

      {!isAuthenticated || !reader ? (
        <div className="relative min-h-[240px]">
          <Loader confined />
        </div>
      ) : (
        <>
          <Link
            href={`/@${pseudonymToSlug(reader.pseudonym)}`}
            className="group mt-2 mb-6 flex items-center gap-3 no-underline"
          >
            <ReaderAvatar pseudonym={reader.pseudonym} avatar={reader.avatar} size={56} />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-[var(--reader-text)]">
                {comradeName(reader.pseudonym)}
              </div>
              <div className="text-xs font-semibold text-[var(--reader-text-muted)] group-hover:text-brand-500">
                View profile
              </div>
            </div>
          </Link>

          <div className="mb-7">
            <UnderlineTabs options={TABS} value={tab} onChange={setTab} />
          </div>

          {tab === "profile" ? (
            <div className="flex flex-col gap-5">
              <AvatarPicker reader={reader} />
              <ProfileForm reader={reader} />
            </div>
          ) : (
            <div className="flex flex-col">
              <SettingRow label="Dark mode" sub="Switch theme">
                <ThemeToggle />
              </SettingRow>
              <NotificationsRow />
              <EmailAnnouncementsRow reader={reader} />
              <InstallRow />
            </div>
          )}

          <div className="mt-12 flex flex-col items-center gap-1 border-t border-[var(--reader-border)] pt-6 text-center">
            <button
              type="button"
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/") })}
              disabled={logout.isPending}
              className="mb-3 flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={14} />
              {logout.isPending ? "Logging out…" : "Log out"}
            </button>
            <p className="m-0 text-xs font-medium text-[var(--reader-text-muted)]">Arise for Freedom.</p>
            <p className="m-0 text-xs font-medium text-[var(--reader-text-subtle)]">Ominira · v{APP_VERSION}</p>
          </div>
        </>
      )}
    </div>
  );
}
