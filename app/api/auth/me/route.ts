import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { conflict, unauthorized, validationError } from "@/lib/api/errors";
import { getReaderRow, toReaderProfile } from "@/lib/auth/profile";
import type { Database } from "@/lib/supabase/database.types";
import { isAvatarColor } from "@/lib/avatar/avatar";

export async function GET(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const row = await getReaderRow(reader.readerId);
  if (!row) return unauthorized();
  return NextResponse.json({ reader: toReaderProfile(row) });
}

export async function PATCH(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json()) as {
    fullName?: string;
    pseudonym?: string;
    city?: string | null;
    country?: string | null;
    avatarColor?: string | null;
    emailAnnouncements?: boolean;
  };
  const update: Database["public"]["Tables"]["readers"]["Update"] = {};
  if (body.fullName !== undefined) update.full_name = body.fullName;
  if (body.pseudonym !== undefined) {
    // Same 1–20 rule the signup form enforces — account settings is the
    // other place a pseudonym gets written.
    const pseudonym = body.pseudonym.trim();
    if (!pseudonym || pseudonym.length > 20) {
      return validationError("Pseudonym must be 1–20 characters.", "pseudonym");
    }
    update.pseudonym = pseudonym;
  }
  // Blank clears the field rather than storing "" — location is optional.
  if (body.city !== undefined) update.city = body.city?.trim() || null;
  if (body.country !== undefined) update.country = body.country?.trim() || null;
  // A default color, or null to show the uploaded photo again.
  if (body.avatarColor !== undefined) {
    if (body.avatarColor !== null && !isAvatarColor(body.avatarColor)) {
      return validationError("Unknown avatar color.", "avatarColor");
    }
    update.avatar_color = body.avatarColor;
  }
  if (body.emailAnnouncements !== undefined) {
    if (typeof body.emailAnnouncements !== "boolean") return validationError("Must be true or false.", "emailAnnouncements");
    update.email_announcements = body.emailAnnouncements;
  }

  const { data: updated, error } = await getSupabaseAdminClient()
    .from("readers")
    .update(update)
    .eq("id", reader.readerId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return conflict("That pseudonym is taken — try another.", "pseudonym");
    return validationError(error.message);
  }
  if (!updated) return unauthorized();
  return NextResponse.json({ reader: toReaderProfile(updated) });
}
