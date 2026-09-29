"use client";

import { useEffect } from "react";
import StatusPage, { statusActionClass } from "@/app/components/shared/StatusPage";

// error.message is deliberately not shown — in production Next replaces
// server errors with a generic digest string that means nothing to a reader.
// It is still logged: a client-side throw caught here never reaches Next's dev
// overlay, so the console is the only place it surfaces.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
