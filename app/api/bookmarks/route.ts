import { NextResponse } from "next/server";
import { getAuthenticatedReader } from "@/lib/auth/session";
import { notFound, unauthorized, validationError } from "@/lib/api/errors";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { toggleBookmark, type BookmarkTarget } from "@/lib/bookmarks/store";

const TARGETS: BookmarkTarget[] = ["material", "post"];

/** Which table each target type has to exist in before it can be saved.
 * bookmarks.target_id carries no FK (it spans both), so this existence
 * check is the only thing standing between a typo'd id and a permanent
 * blank row on someone's Saved shelf. */
const TABLE_BY_TARGET: Record<BookmarkTarget, "materials" | "posts"> = {
  material: "materials",
  post: "posts",
};

/**
 * One route for both bookmarkable entities, unlike reactions (which are one
 * route per entity, nested under the thing being reacted to). The difference
 * is that a reaction route does entity-specific work either side of the
 * toggle — read the owner, push them a notification, re-read the
 * denormalized counter — while a bookmark is private and counterless, so
 * both types share literally every line here except which table the
 * existence check reads.
 */
export async function POST(request: Request) {
  const reader = await getAuthenticatedReader(request);
  if (!reader) return unauthorized();

  const body = (await request.json()) as { targetType?: string; targetId?: string };
  const targetType = body.targetType as BookmarkTarget | undefined;
  if (!targetType || !TARGETS.includes(targetType) || !body.targetId) {
    return validationError(`targetType (${TARGETS.join(" | ")}) and targetId are required.`);
  }

  const { data: target } = await getSupabaseAdminClient()
    .from(TABLE_BY_TARGET[targetType])
    .select("id")
    .eq("id", body.targetId)
    .maybeSingle();
  if (!target) return notFound();

  const bookmarked = await toggleBookmark(reader.readerId, targetType, body.targetId);
  return NextResponse.json({ bookmarked });
}
