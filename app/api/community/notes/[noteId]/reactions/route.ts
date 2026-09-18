import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound, unauthorized } from "@/lib/api/errors";
import { notifyReader } from "@/lib/notifications/notify";

export async function POST(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { noteId } = await params;
  const admin = getSupabaseAdminClient();

  const { data: note } = await admin.from("notes").select("id, reaction_count, reader_id").eq("id", noteId).maybeSingle();
  if (!note) return notFound();

  const { data: existing } = await admin
    .from("note_reactions")
    .select("note_id")
    .eq("note_id", noteId)
    .eq("reader_id", reader.readerId)
    .maybeSingle();

  if (existing) {
    await admin.from("note_reactions").delete().eq("note_id", noteId).eq("reader_id", reader.readerId);
  } else {
    await admin.from("note_reactions").insert({ note_id: noteId, reader_id: reader.readerId });
    // Fire-and-forget — never let a push failure affect the reaction response.
    // No self-notification when reacting to your own note.
    if (note.reader_id !== reader.readerId) {
      void notifyReader(note.reader_id, {
        kind: "reaction",
        title: "New reaction",
        body: "Someone reacted to your note.",
        url: "/notes",
        tag: `note-reaction-${noteId}`,
      });
    }
  }

  // reaction_count updates itself via the DB trigger (models-spec.md) —
  // route never touches the counter directly, just re-reads it.
  const { data: updated } = await admin.from("notes").select("reaction_count").eq("id", noteId).maybeSingle();

  return NextResponse.json({ reactedByMe: !existing, reactionCount: updated?.reaction_count ?? note.reaction_count });
}
