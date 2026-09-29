"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, createAdminSession, isCorrectPin } from "@/lib/admin/pin";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Per-instance brute-force brake: after MAX_ATTEMPTS wrong PINs an IP waits
// out LOCKOUT_MS. In-memory, so it resets on redeploy and isn't shared
// across serverless instances — a speed bump, not a hard limit.
const failures = new Map<string, { count: number; until: number }>();

export type UnlockState = { error: string | null };

export async function unlockAdmin(_prev: UnlockState, form: FormData): Promise<UnlockState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const record = failures.get(ip);
  if (record && record.count >= MAX_ATTEMPTS && record.until > now) {
    return { error: "Too many attempts. Try again in 15 minutes." };
  }

  if (!isCorrectPin(String(form.get("pin") ?? ""))) {
    const count = record && record.until > now ? record.count + 1 : 1;
    failures.set(ip, { count, until: now + LOCKOUT_MS });
    return { error: count >= MAX_ATTEMPTS ? "Too many attempts. Try again in 15 minutes." : "That PIN isn't right." };
  }

  failures.delete(ip);
  (await cookies()).set(ADMIN_COOKIE, await createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });

  // Only same-site admin paths — never an open redirect.
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
}
