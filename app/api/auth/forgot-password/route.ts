import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/authClient";
import { validationError } from "@/lib/api/errors";

// Deliberately this request's own public origin, not the hardcoded
// PLATFORM_URL — a reset requested from localhost:3000 during local dev must
// land back on localhost:3000, not always redirect into production, and
// vice versa. `request.url`'s own origin is right for local dev (no proxy
// in front), but in production this app sits behind a reverse proxy that
// forwards to an internal address without rewriting the Host header, so
// `request.url` there resolves to that internal address, not the public
// domain — the standard `x-forwarded-*` headers carry what the client
// actually requested and take priority whenever present.
function publicOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

// Kicks off Supabase's own password-recovery email — the actual sending
// (SMTP + template) is configured in the Supabase project dashboard, not
// here. Always answers with the same generic success message regardless of
// whether the email is registered (same enumeration-safe convention as
// login/signup — api-spec.md).
export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  if (!body.email) return validationError("Email is required.");

  // Supabase only honors this when it's on the project's Redirect URLs
  // allowlist (Authentication > URL Configuration); anything else falls back
  // to the project's own Site URL.
  const { error } = await getSupabaseAuthClient().auth.resetPasswordForEmail(body.email, {
    redirectTo: `${publicOrigin(request)}/auth/reset-password`,
  });
  // Logged, never returned — the response to the client stays generic
  // regardless (enumeration-safe), but a misconfigured redirect URL/SMTP
  // would otherwise fail completely silently.
  if (error) console.error("resetPasswordForEmail failed:", error);

  return NextResponse.json({
    message: "If an account exists for that email, we've sent a link to reset your password.",
  });
}
