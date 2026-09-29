import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound, unauthorized } from "@/lib/api/errors";
import { notifyReader } from "@/lib/notifications/notify";
import { comradeName } from "@/lib/reader/authorDisplay";
import { notificationSnippet } from "@/lib/notifications/snippet";

export async function POST(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { noteId } = await params;
  const admin = getSupabaseAdminClient();

  const { data: note } = await admin
    .from("posts")
    .select("id, reaction_count, reader_id, material_id, content")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return notFound();

  const { data: existing } = await admin
    .from("reactions")
    .select("target_id")
    .eq("target_type", "post")
    .eq("target_id", noteId)
    .eq("reader_id", reader.readerId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("reactions")
      .delete()
      .eq("target_type", "post")
      .eq("target_id", noteId)
      .eq("reader_id", reader.readerId);
  } else {
    await admin.from("reactions").insert({ target_type: "post", target_id: noteId, reader_id: reader.readerId });
    // Fire-and-forget — never let a push failure affect the reaction response.
    // No self-notification when reacting to your own note.
    if (note.reader_id !== reader.readerId) {
      void (async () => {
        const [{ data: actor }, { data: material }] = await Promise.all([
          admin.from("readers").select("pseudonym").eq("id", reader.readerId).maybeSingle(),
          admin.from("materials").select("slug, title").eq("id", note.material_id!).maybeSingle(),
        ]);
        if (!material) return;
        // The reacted-to note's own page — in-app row and push share this
        // one url, and it opens the thread itself rather than loading a
        // whole book to reach one note (the page links on into the reader).
        const url = `/post/${note.id}`;
        const actorName = actor?.pseudonym ? comradeName(actor.pseudonym) : "A comrade";
        // The reacted-to note's own words — what was reacted to says far
        // more than "tap to view in <book>" ever did, on a lock screen and
        // in the feed row alike. A voice note has none, so it falls back to
        // naming the book.
        const noteText = (note.content as { text?: string } | null)?.text ?? null;
        const quoted = notificationSnippet(noteText);
        await notifyReader(note.reader_id, {
          kind: "reaction",
          title: `✊🏾 ${actorName} reacted to your note`,
          body: quoted ? `“${quoted}”` : `Your voice note on ${material.title ?? material.slug}`,
          url,
          // The full text, frozen at fire time, so the in-app row can show
          // more of it than a push body has room for.
          actorReaderId: reader.readerId,
          snippet: noteText,
          tag: `note-reaction-${noteId}`,
        });
      })();
    }
  }

  // reaction_count updates itself via the DB trigger (models-spec.md) —
  // route never touches the counter directly, just re-reads it.
  const { data: updated } = await admin.from("posts").select("reaction_count").eq("id", noteId).maybeSingle();

  return NextResponse.json({ reactedByMe: !existing, reactionCount: updated?.reaction_count ?? note.reaction_count });
}
