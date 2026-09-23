"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

export type ForgotPasswordInput = { email: string };

/** `POST /api/auth/forgot-password`. Always resolves with the same generic
 * success message regardless of whether the email is registered (api-spec.md:
 * can't be used to enumerate registered emails) — the form renders it as a
 * plain confirmation, never a per-field result. */
export function useForgotPassword() {
  return useMutation<{ message: string }, unknown, ForgotPasswordInput>({
    mutationFn: (input) => apiFetch<{ message: string }>("/auth/forgot-password", { json: input }),
  });
}
