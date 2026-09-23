import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { unauthorized, validationError } from "@/lib/api/errors";
import { getReaderRow, toReaderProfile } from "@/lib/auth/profile";

// Sets a new password for the reader holding the recovery session minted by
// Supabase's reset-password email link, then hands back a full session so
// the client can sign them straight in — no separate login step after
// resetting.
export async function POST(request: Request) {
  const body = (await request.json()) as {
    accessToken?: string;
    refreshToken?: string;
    password?: string;
  };
  if (!body.accessToken || !body.refreshToken) return validationError("Reset link is invalid or expired.");
  if (!body.password) return validationError("Password is required.", "password");

  // A fresh client scoped to the reader's own recovery session — updateUser
  // acts on whichever session this client is carrying, so it can't reuse
  // the shared publishable-key client (authClient.ts), which deliberately
  // carries none (persistSession: false).
  const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: body.accessToken,
    refresh_token: body.refreshToken,
  });
  if (sessionError) {
    console.error("reset-password setSession failed:", sessionError);
    return unauthorized("Reset link is invalid or expired.");
  }

  const { data, error } = await supabase.auth.updateUser({ password: body.password });
  if (error || !data.user) {
    // Unlike setSession/getSession above (where any failure genuinely means
    // "this link is no good"), a rejection here can be about the *password*
    // itself rather than the link — surfacing that specific reason is safe
    // (it reveals nothing about account existence, unlike login's
    // deliberately generic 401) and far more actionable than a blanket
    // "link expired" for someone who typed a valid new password.
    if (error?.code === "same_password") {
      return validationError("New password must be different from your current password.", "password");
    }
    console.error("reset-password updateUser failed:", error);
    return unauthorized("Reset link is invalid or expired.");
  }

  const { data: refreshed } = await supabase.auth.getSession();
  if (!refreshed.session) {
    console.error("reset-password getSession returned no session after updateUser");
    return unauthorized("Reset link is invalid or expired.");
  }

  const readerRow = await getReaderRow(data.user.id);
  if (!readerRow) {
    console.error("reset-password: no readers row for user", data.user.id);
    return unauthorized("Reset link is invalid or expired.");
  }

  return NextResponse.json({
    reader: toReaderProfile(readerRow),
    session: {
      accessToken: refreshed.session.access_token,
      refreshToken: refreshed.session.refresh_token,
      expiresAt: new Date(refreshed.session.expires_at! * 1000).toISOString(),
    },
  });
}
