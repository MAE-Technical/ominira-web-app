import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound, unauthorized } from "@/lib/api/errors";
import { notifyReader } from "@/lib/notifications/notify";
import { noteInteractionUrl } from "@/lib/notifications/noteTarget";
import { comradeName } from "@/lib/reader/authorDisplay";
import type { AnnotationRange } from "@/lib/api/types";

export async function POST(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { noteId } = await params;
  const admin = getSupabaseAdminClient();

  const { data: note } = await admin
    .from("posts")
    .select("id, reaction_count, reader_id, parent_id, material_id, ranges")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return notFound();

  const { data: existing } = await admin
    .from("post_reactions")
    .select("post_id")
    .eq("post_id", noteId)
    .eq("reader_id", reader.readerId)
    .maybeSingle();

  if (existing) {
    await admin.from("post_reactions").delete().eq("post_id", noteId).eq("reader_id", reader.readerId);
  } else {
    await admin.from("post_reactions").insert({ post_id: noteId, reader_id: reader.readerId });
    // Fire-and-forget — never let a push failure affect the reaction response.
    // No self-notification when reacting to your own note.
    if (note.reader_id !== reader.readerId) {
      void (async () => {
        const [{ data: actor }, { data: material }] = await Promise.all([
          admin.from("readers").select("pseudonym").eq("id", reader.readerId).maybeSingle(),
          admin.from("materials").select("slug, title").eq("id", note.material_id!).maybeSingle(),
        ]);
        if (!material) return;
        const rootNoteId = note.parent_id ?? note.id;
        const url = await noteInteractionUrl({
          materialSlug: material.slug,
          ranges: (note.ranges as unknown as AnnotationRange[] | null) ?? [],
          rootNoteId,
        });
        const actorName = actor?.pseudonym ? comradeName(actor.pseudonym) : "A comrade";
        await notifyReader(note.reader_id, {
          kind: "reaction",
          title: `✊🏾 ${actorName} reacted to your note`,
          body: `Tap to view in ${material.title ?? material.slug}`,
          url,
          tag: `note-reaction-${noteId}`,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
        });
      })();
    }
  }

  // reaction_count updates itself via the DB trigger (models-spec.md) —
  // route never touches the counter directly, just re-reads it.
  const { data: updated } = await admin.from("posts").select("reaction_count").eq("id", noteId).maybeSingle();

  return NextResponse.json({ reactedByMe: !existing, reactionCount: updated?.reaction_count ?? note.reaction_count });
}
