import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { unauthorized, validationError } from "@/lib/api/errors";
import { getReaderRow, toReaderProfile } from "@/lib/auth/profile";
import type { ReaderAgeRange } from "@/lib/api/types";

const AGE_RANGES: ReaderAgeRange[] = ["13_17", "18_24", "25_34", "35_44", "45_54", "55_64", "65_plus"];
const GENDER_IDENTITY_MAX_LENGTH = 40;

export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json()) as {
    interests?: string[];
    readMaterialIds?: string[];
    ageRange?: ReaderAgeRange | null;
    genderIdentity?: string | null;
  };
  if (!Array.isArray(body.interests) || !Array.isArray(body.readMaterialIds)) {
    return validationError("interests and readMaterialIds must both be arrays.");
  }
  // Both demographic questions are optional (null = "prefer not to say").
  if (body.ageRange != null && !AGE_RANGES.includes(body.ageRange)) {
    return validationError("ageRange must be a valid age range or null.");
  }
  // genderIdentity is free text (no fixed list) — just cap length, matching the column's check.
  if (
    body.genderIdentity != null &&
    (typeof body.genderIdentity !== "string" || body.genderIdentity.trim().length > GENDER_IDENTITY_MAX_LENGTH)
  ) {
    return validationError(`genderIdentity must be ${GENDER_IDENTITY_MAX_LENGTH} characters or fewer.`);
  }
  const genderIdentity = typeof body.genderIdentity === "string" ? body.genderIdentity.trim() || null : null;

  const current = await getReaderRow(reader.readerId);
  if (!current) return unauthorized();

  // Idempotent: only ever advances forward, never backward — calling this
  // again just overwrites the answers (api-spec.md).
  const nextStatus = current.onboarding_status === "pending_survey" ? "pending_welcome" : current.onboarding_status;

  const { data: updated, error } = await getSupabaseAdminClient()
    .from("readers")
    .update({
      interests: body.interests,
      survey_read_material_ids: body.readMaterialIds,
      age_range: body.ageRange ?? null,
      gender_identity: genderIdentity,
      onboarding_status: nextStatus,
    })
    .eq("id", reader.readerId)
    .select("*")
    .single();

  if (error || !updated) return validationError("Could not save survey answers.");
  return NextResponse.json({ reader: toReaderProfile(updated) });
}
