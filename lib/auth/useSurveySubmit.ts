"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { authKeys } from "@/lib/auth/queryKeys";
import type { ReaderAgeRange, ReaderProfile } from "@/lib/api/types";

export type SurveyInput = {
  interests: string[];
  readMaterialIds: string[];
  ageRange: ReaderAgeRange | null;
  genderIdentity: string | null;
};

/** `POST /api/auth/survey` — advances `pending_survey` → `pending_welcome`. */
export function useSurveySubmit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SurveyInput) => apiFetch<{ reader: ReaderProfile }>("/auth/survey", { json: input }),
    onSuccess: ({ reader }) => queryClient.setQueryData(authKeys.me, reader),
  });
}
