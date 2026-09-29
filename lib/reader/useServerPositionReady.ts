"use client";

import { useSessionStore, isSessionValid } from "@/stores/session-store";
import { useContinueReading } from "@/lib/auth/useContinueReading";

/**
 * "Has the server's own saved position had its chance to correct this
 * device's local mirror yet?" — the gate every resume path and every
 * resume-affordance shares.
 *
 * Also seeds that mirror as a side effect (see useContinueReading), which is
 * what makes this the right call for any surface a reader can land on
 * directly — a shared link, a search-engine hit — without ever passing
 * through the home feed's Continue Reading rail first.
 *
 * False (i.e. "keep waiting") until we can actually say one way or the other
 * whether there's server data to fold in: either this device confirmed
 * there's no reader session at all to fetch one for, or the fetch itself
 * completed (success *or* failure — a dropped request shouldn't hold a
 * viewer open forever; local data is still there).
 *
 * Without it, resume would commit to whatever this device happened to hold —
 * typically nothing at all on a second device, a fresh profile or cleared
 * site data — before the request it needed ever arrived.
 */
export function useServerPositionReady(): boolean {
  const continueReadingQuery = useContinueReading();
  const sessionHasHydrated = useSessionStore((s) => s.hasHydrated);
  const session = useSessionStore((s) => s.session);
  const isAuthenticated = sessionHasHydrated && isSessionValid(session);
  return sessionHasHydrated && (!isAuthenticated || continueReadingQuery.isFetched);
}
