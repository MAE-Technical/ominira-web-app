"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import SearchableAppPage from "@/app/components/shell/SearchableAppPage";
import Loader from "@/app/components/Loader";
import ThemeToggle from "@/app/components/shell/ThemeToggle";
import { useInstallBannerStore } from "@/stores/install-banner-store";
import { useInstallPrompt } from "@/lib/pwa/useInstallPrompt";
import InstallModal from "@/app/components/pwa/InstallModal";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useProfile } from "@/lib/auth/useProfile";
import { useLogout } from "@/lib/auth/useLogout";
import { useContinueReading } from "@/lib/auth/useContinueReading";
import { useNotesCount } from "@/lib/auth/useNotesCount";
import { avatarColor, avatarInitial } from "@/lib/reader/authorDisplay";
import { useWebPush } from "@/lib/push/useWebPush";
import Switch from "@/app/components/shell/Switch";

function handleFor(name: string): string {
  return `@${name.toLowerCase().replace(/\s+/g, ".")}`;
}

const APP_VERSION = "0.1.0";

/** The calm, always-there install option — no dismiss/cooldown, unlike
 * HomeInstallBanner's assertive top bar. Same InstallModal that banner
 * opens for the manual iOS/Android walkthrough, rather than a second,
 * duplicated set of instructions living here.
 */
function AccountInstallCard() {
  const [modalOpen, setModalOpen] = useState(false);
  const { canPrompt, promptInstall, isInstalled } = useInstallPrompt();
  const hasHydrated = useInstallBannerStore((s) => s.hasHydrated);

  if (!hasHydrated || isInstalled) return null;

  const onPrimaryClick = canPrompt ? promptInstall : () => setModalOpen(true);

  return (
    <div className="mb-6 rounded-md border border-[var(--reader-border)] p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <img
          src="/icons/icon-192.png"
          alt=""
          className="h-7 w-7 flex-none rounded-xs border border-[var(--reader-border)] object-cover object-[center_20%]"
        />
        <p className="m-0 text-[15px] font-semibold text-[var(--reader-text)]">Install Ominira</p>
      </div>

      <button
        type="button"
        onClick={onPrimaryClick}
        className="w-full cursor-pointer rounded-md border border-transparent bg-[var(--reader-accent)] px-3 py-2.5 text-[15px] font-semibold text-white transition-colors hover:opacity-90"
      >
        Install Ominira
      </button>

      <InstallModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

/** A single row toggling browser/PWA push (reactions, replies, announcements).
 * Works before login too — see lib/push/useWebPush.ts's comment on why
 * subscribing doesn't require a reader session. */
function NotificationsRow() {
  const { supported, permission, subscribe, unsubscribe } = useWebPush();
  const [pending, setPending] = useState(false);

  if (!supported) return null;

  const enabled = permission === "granted";
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
    <div className="mb-5 flex items-center justify-between">
      <span className="text-[13px] font-medium text-[var(--reader-text)]">
        Notifications
        {permission === "denied" && (
          <span className="ml-1.5 text-[var(--reader-text-subtle)]">(blocked in browser)</span>
        )}
      </span>
      <Switch
        checked={enabled}
        onChange={onToggle}
        disabled={pending || permission === "denied"}
        ariaLabel="Notifications"
      />
    </div>
  );
}

export default function AccountView() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { data: reader } = useProfile();
  const logout = useLogout();

  // Real "books started" count — GET /api/auth/me/continue-reading already
  // only lists materials with a saved position (api-spec.md), so this is a
  // straight count, no local computation needed.
  const { data: continueReading } = useContinueReading();
  const booksStarted = continueReading?.length;
  // Every note (root or reply) this reader has authored across the whole
  // library — GET /api/auth/me/notes-count, a plain aggregate query.
  const { data: notesMade } = useNotesCount();

  // AccountInstallCard needs this rehydrated independently of
  // HomeInstallBanner, since a reader landing straight on /account (not via
  // /home) would otherwise never trigger it.
  useEffect(() => {
    useInstallBannerStore.persist.rehydrate();
  }, []);

  return (
    <SearchableAppPage>
      <h1 className="mt-1 mb-6 font-serif text-2xl font-semibold text-[var(--reader-text)]">Account</h1>

      {isAuthenticated && !reader ? (
        <div className="relative min-h-[240px]">
          <Loader confined />
        </div>
      ) : isAuthenticated && reader ? (
        <>
          <div className="mb-5 flex flex-col items-center gap-2.5 text-center">
            <span
              style={{ background: avatarColor(reader.pseudonym) }}
              className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-full text-2xl font-semibold text-white"
            >
              {avatarInitial(reader.pseudonym)}
            </span>
            <div>
              <div className="font-sans text-md font-bold text-[var(--reader-text)]">{reader.fullName}</div>
              <div className="text-[13px] font-medium text-[var(--reader-text-muted)]">
                {handleFor(reader.pseudonym)}<br></br>
                {reader.city && reader.country ? `${reader.city}, ${reader.country}` : ""}
              </div>
            </div>
          </div>

          <div className="mb-5 flex gap-2.5">
            <div className="flex-1 rounded-md border border-[var(--reader-border)] p-3.5 text-center">
              <div className="font-serif text-[22px] font-semibold text-[var(--reader-accent)]">
                {booksStarted ?? "–"}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-[var(--reader-text-subtle)]">Currently reading</div>
            </div>
            <div className="flex-1 rounded-md border border-[var(--reader-border)] p-3.5 text-center">
              <div className="font-serif text-[22px] font-semibold text-[var(--reader-accent)]">
                {notesMade ?? "–"}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-[var(--reader-text-subtle)]">Public notes</div>
            </div>
          </div>

          <div className="mb-5 overflow-hidden rounded-md border border-[var(--reader-border)]">
            {(
              [
                ["Email", reader.email],
                ["Pseudonym", reader.pseudonym],
                ["Country", reader.country ?? "—"],
                ["City", reader.city ?? "—"],
              ] as const
            ).map(([label, value], i) => (
              <div
                key={label}
                className={`flex items-center justify-between px-3.5 py-2.5 ${
                  i > 0 ? "border-t border-[var(--reader-border)]" : ""
                }`}
              >
                <span className="text-xs font-medium text-[var(--reader-text-subtle)]">{label}</span>
                <span className="text-[13px] font-medium text-[var(--reader-text)]">{value}</span>
              </div>
            ))}
          </div>

          <div className="mb-5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-[var(--reader-text)]">Dark mode</span>
            <ThemeToggle />
          </div>

          <NotificationsRow />

          <div className="mb-5 text-center">
            <button
              type="button"
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/") })}
              disabled={logout.isPending}
              className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-medium text-[var(--reader-text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {logout.isPending ? "Logging out…" : "Log out"}
            </button>
          </div>

          <div className="border-t border-[var(--reader-border)] pt-3.5 text-center">
            <p className="mx-auto mb-0 max-w-[260px] text-xs font-medium leading-relaxed text-[var(--reader-text-subtle)]">
              A curated library of Pan-African and revolutionary political thought — free to browse.
            </p>
            <p className="mt-2 mb-0 text-xs font-medium text-[var(--reader-text-muted)]">
              Raise your Pan-African consciousness.
            </p>
            <p className="mt-1 mb-0 text-xs font-medium text-[var(--reader-text-subtle)]">Ominira · v{APP_VERSION}</p>
          </div>
        </>
      ) : (
        <>
          <div className="mb-5 overflow-hidden rounded-md border border-[var(--reader-border)]">
            <Link
              href="/auth/login"
              className="flex cursor-pointer items-center justify-between border-b border-[var(--reader-border)] px-3.5 py-3 no-underline"
            >
              <span className="text-sm font-medium text-[var(--reader-text)]">Log in</span>
              <ChevronRight size={16} className="text-[var(--reader-text-subtle)]" />
            </Link>
            <Link
              href="/auth/signup"
              className="flex cursor-pointer items-center justify-between px-3.5 py-3 no-underline"
            >
              <span className="text-sm font-medium text-[var(--reader-text)]">Join the movement</span>
              <ChevronRight size={16} className="text-[var(--reader-text-subtle)]" />
            </Link>
          </div>

          <div className="mb-5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-[var(--reader-text)]">Dark mode</span>
            <ThemeToggle />
          </div>

          <NotificationsRow />

          <AccountInstallCard />

          <div className="border-t border-[var(--reader-border)] pt-3.5 text-center">
            <p className="m-0 text-xs font-medium text-[var(--reader-text-muted)]">
            Raise your Pan-African consciousness.
            </p>
            <p className="mt-1 mb-0 text-xs font-medium text-[var(--reader-text-subtle)]">Ominira · v{APP_VERSION}</p>
          </div>
        </>
      )}
    </SearchableAppPage>
  );
}
