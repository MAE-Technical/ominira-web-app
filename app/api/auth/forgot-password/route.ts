import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/authClient";
import { validationError } from "@/lib/api/errors";

// Kicks off Supabase's own password-recovery email — the actual sending
// (SMTP + template) is configured in the Supabase project dashboard, not
// here. Always answers with the same generic success message regardless of
// whether the email is registered (same enumeration-safe convention as
// login/signup — api-spec.md).
export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  if (!body.email) return validationError("Email is required.");

  // Deliberately this request's own origin, not the hardcoded PLATFORM_URL —
  // a reset requested from localhost:3000 during local dev must land back on
  // localhost:3000, not always redirect into production, and vice versa.
  // Supabase only honors this when it's on the project's Redirect URLs
  // allowlist (Authentication > URL Configuration); anything else falls back
  // to the project's own Site URL.
  const { origin } = new URL(request.url);
  const { error } = await getSupabaseAuthClient().auth.resetPasswordForEmail(body.email, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  // Logged, never returned — the response to the client stays generic
  // regardless (enumeration-safe), but a misconfigured redirect URL/SMTP
  // would otherwise fail completely silently.
  if (error) console.error("resetPasswordForEmail failed:", error);

  return NextResponse.json({
    message: "If an account exists for that email, we've sent a link to reset your password.",
  });
}
