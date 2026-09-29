"use client";

import StatusPage, { statusActionClass } from "@/app/components/shared/StatusPage";

// Admin's own boundary — renders inside the admin chrome (hence the shorter
// height) and keeps error.message, which is useful to an admin.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPage
      title="This admin page couldn't load"
      className="min-h-[60vh]"
      action={
        <button type="button" onClick={reset} className={statusActionClass}>
          Try again
        </button>
      }
    >
      {error.message}
    </StatusPage>
  );
}
