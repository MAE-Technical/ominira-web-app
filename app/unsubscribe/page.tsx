import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { isValidUnsubscribeToken } from "@/lib/email/unsubscribe";
import StatusPage, { statusActionClass } from "@/app/components/shared/StatusPage";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

// The human-facing unsubscribe link in every announcement email. Confirms
// with a button rather than acting on GET, since mail scanners prefetch
// links; the actual write is the server action below.
async function unsubscribe(form: FormData) {
  "use server";
  const r = String(form.get("r") ?? "");
  const t = String(form.get("t") ?? "");
  if (!isValidUnsubscribeToken(r, t)) redirect("/unsubscribe");
  await getSupabaseAdminClient().from("readers").update({ email_announcements: false }).eq("id", r);
  redirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; t?: string; done?: string }>;
}) {
  const { r = "", t = "", done } = await searchParams;

  if (done) {
    return (
      <StatusPage title="You're unsubscribed">
        You won&apos;t get announcement emails any more. You can turn them back on any time in Account settings →
        Preferences.
      </StatusPage>
    );
  }

  if (!isValidUnsubscribeToken(r, t)) {
    return (
      <StatusPage title="This link isn't valid">
        It may be incomplete. You can turn email announcements off in Account settings → Preferences.
      </StatusPage>
    );
  }

  return (
    <StatusPage
      title="Stop announcement emails?"
      action={
        <form action={unsubscribe}>
          <input type="hidden" name="r" value={r} />
          <input type="hidden" name="t" value={t} />
          <button type="submit" className={statusActionClass}>
            Unsubscribe
          </button>
        </form>
      }
    >
      You&apos;ll still get sign-in and account emails, and anything you&apos;ve turned on in the app.
    </StatusPage>
  );
}
