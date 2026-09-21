import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { MATERIAL_SUMMARY_COLUMNS } from "@/lib/materials/columns";
import { parseGoogleMetaData, parseOpenLibraryMetaData } from "@/lib/materials/providerMeta";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { forbidden, notFound, unauthorized, validationError } from "@/lib/api/errors";
import { contentToColumns, hydrateNotes, type NoteRow } from "@/lib/community/notes";
import type { NoteContent } from "@/lib/api/types";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const reader = await getAuthenticatedReader(request);
  const admin = getSupabaseAdminClient();

  const { data: row } = await admin.from("posts").select("*").eq("id", noteId).maybeSingle();
  // Same rule as the per-material feed: a private note is only visible to its
  // own author — 404, not 403, so existence of a private note is never leaked.
  if (!row || !row.material_id || (row.visibility !== "public" && row.reader_id !== reader?.readerId)) return notFound();

  const { data: material } = await admin.from("materials").select(`${MATERIAL_SUMMARY_COLUMNS}, json_storage_path`).eq("id", row.material_id).maybeSingle();
  if (!material) return notFound();

  const { data: replyRows } = await admin.from("posts").select("*").eq("parent_id", noteId).order("created_at", { ascending: true });
  const visibleReplies = ((replyRows ?? []) as NoteRow[]).filter((r) => r.visibility === "public" || r.reader_id === reader?.readerId);

  const hydratedById = new Map((await hydrateNotes([row, ...visibleReplies], reader?.readerId)).map((n) => [n.id, n]));

  const google = parseGoogleMetaData(material.google_meta_data);
  const openlibrary = parseOpenLibraryMetaData(material.openlibrary_meta_data);

  return NextResponse.json({
    note: hydratedById.get(row.id)!,
    replies: visibleReplies.map((r) => hydratedById.get(r.id)!),
    material: {
      id: material.id,
      slug: material.slug,
      title: material.title,
      author: material.author,
      cover: material.cover_url,
      thumbnail: material.thumbnail_url,
      googleCoverUrl: google.coverUrl,
      googleThumbnailUrl: google.thumbnailUrl,
      openlibraryCoverUrl: openlibrary.coverUrl,
      openlibraryThumbnailUrl: openlibrary.thumbnailUrl,
      coverSource: material.cover_source,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { noteId } = await params;
  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.from("posts").select("reader_id").eq("id", noteId).maybeSingle();
  if (!existing) return notFound();
  if (existing.reader_id !== reader.readerId) return forbidden();

  const body = (await request.json()) as { content?: NoteContent; visibility?: "public" | "private" };
  const update: Database["public"]["Tables"]["posts"]["Update"] = {};
  if (body.content) Object.assign(update, contentToColumns(body.content));
  if (body.visibility) update.visibility = body.visibility;

  const { data, error } = await admin.from("posts").update(update).eq("id", noteId).select("*").single();
  if (error || !data) return validationError("Could not update note.");

  const [note] = await hydrateNotes([data], reader.readerId);
  return NextResponse.json(note);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const { noteId } = await params;
  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.from("posts").select("reader_id").eq("id", noteId).maybeSingle();
  if (!existing) return notFound();
  if (existing.reader_id !== reader.readerId) return forbidden();

  // parent_id on delete cascade (models-spec.md) takes the whole reply
  // subtree with it — no manual descendant collection needed here, unlike
  // the client store's own collectWithDescendants (which existed only
  // because there was no DB to cascade for it).
  const { error } = await admin.from("posts").delete().eq("id", noteId);
  if (error) return notFound();
  return new Response(null, { status: 204 });
}
