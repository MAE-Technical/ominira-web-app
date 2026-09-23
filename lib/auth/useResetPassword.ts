"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useSessionStore, type Session } from "@/stores/session-store";
import { authKeys } from "@/lib/auth/queryKeys";
import type { ReaderProfile } from "@/lib/api/types";

export type ResetPasswordInput = { accessToken: string; refreshToken: string; password: string };

/** `POST /api/auth/reset-password`, using the recovery-session tokens
 * Supabase's reset-password link lands the reader on `/auth/reset-password`
 * with. On success, signs the reader straight in — same as `useLogin` — so
 * resetting a password doesn't also demand a separate login. */
export function useResetPassword() {
  const queryClient = useQueryClient();
  const setSession = useSessionStore((s) => s.setSession);
  return useMutation<{ reader: ReaderProfile; session: Session }, ApiError, ResetPasswordInput>({
    mutationFn: (input) => apiFetch<{ reader: ReaderProfile; session: Session }>("/auth/reset-password", { json: input }),
    onSuccess: ({ reader, session }) => {
      setSession(reader.id, session);
      queryClient.setQueryData(authKeys.me, reader);
    },
  });
}
