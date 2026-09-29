import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound, unauthorized } from "@/lib/api/errors";
import { notifyReader } from "@/lib/notifications/notify";
import { comradeName } from "@/lib/reader/authorDisplay";

// Mirrors app/api/community/notes/[noteId]/reactions/route.ts's own toggle +
// fire-and-forget notify shape — the "appreciate a contributed book"
// counterpart to that route's "react to a note" one. `reactedByMe`/
// `reactionCount` come back in the same shape so ReactionButton's caller
// doesn't need to know which entity it's reacting to.
export async function POST(request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { materialId } = await params;
  const admin = getSupabaseAdminClient();

  const { data: material } = await admin
    .from("materials")
    .select("id, slug, title, reaction_count, uploaded_by")
    .eq("id", materialId)
    .maybeSingle();
  if (!material) return notFound();

  const { data: existing } = await admin
    .from("reactions")
    .select("target_id")
    .eq("target_type", "material")
    .eq("target_id", materialId)
    .eq("reader_id", reader.readerId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("reactions")
      .delete()
      .eq("target_type", "material")
      .eq("target_id", materialId)
      .eq("reader_id", reader.readerId);
  } else {
    await admin.from("reactions").insert({ target_type: "material", target_id: materialId, reader_id: reader.readerId });
    // Fire-and-forget — never let a push failure affect the reaction
    // response. No self-notification when appreciating your own upload, and
    // no notification at all for an editorial (non-reader-contributed) book.
    if (material.uploaded_by && material.uploaded_by !== reader.readerId) {
      void (async () => {
        const { data: actor } = await admin.from("readers").select("pseudonym").eq("id", reader.readerId).maybeSingle();
        const actorName = actor?.pseudonym ? comradeName(actor.pseudonym) : "A comrade";
        await notifyReader(material.uploaded_by!, {
          kind: "material_reaction",
          // Actor sentence in the title, book in the body — same shape as
          // every other kind, so the Notifications page can render one row
          // layout (bold sentence, quiet snippet) for all of them.
          title: `✊🏾 ${actorName} appreciated your book`,
          body: material.title,
          url: `/library/${material.slug}`,
          actorReaderId: reader.readerId,
          snippet: material.title,
          tag: `material-reaction-${materialId}`,
        });
      })();
    }
  }

  // reaction_count updates itself via the DB trigger — route never touches
  // the counter directly, just re-reads it (same as the notes route).
  const { data: updated } = await admin.from("materials").select("reaction_count").eq("id", materialId).maybeSingle();

  return NextResponse.json({ reactedByMe: !existing, reactionCount: updated?.reaction_count ?? material.reaction_count });
}
