"use client";

import StatusPage, { statusActionClass } from "@/app/components/shared/StatusPage";

// error.message is deliberately not shown — in production Next replaces
// server errors with a generic digest string that means nothing to a reader.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPage
      title="Something went wrong"
      action={
        <button type="button" onClick={reset} className={statusActionClass}>
          Try again
        </button>
      }
    >
      This page couldn&apos;t be loaded. It&apos;s usually temporary — try again in a moment.
    </StatusPage>
  );
}
