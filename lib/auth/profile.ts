import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import type { Database } from "@/lib/supabase/database.types";
import type { ReaderProfile } from "@/lib/api/types";

type ReaderRow = Database["public"]["Tables"]["readers"]["Row"];

/** snake_case DB row -> camelCase ReaderProfile (api-spec.md's Conventions). */
export function toReaderProfile(row: ReaderRow): ReaderProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    pseudonym: row.pseudonym,
    city: row.city,
    country: row.country,
    interests: (row.interests as string[] | null) ?? [],
    surveyReadMaterialIds: (row.survey_read_material_ids as string[] | null) ?? [],
    ageRange: row.age_range,
    genderIdentity: row.gender_identity,
    onboardingStatus: row.onboarding_status,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
  };
}

export async function getReaderRow(readerId: string): Promise<ReaderRow | null> {
  const { data, error } = await getSupabaseAdminClient().from("readers").select("*").eq("id", readerId).maybeSingle();
  if (error || !data) return null;
  return data;
}
