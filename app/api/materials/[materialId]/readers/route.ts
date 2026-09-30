import { NextResponse } from "next/server";
import { resolveMaterialRow } from "@/lib/materials/resolve";
import { listCurrentReaders } from "@/lib/reader/activity";
import { CURRENT_READERS_DISPLAY_CAP } from "@/lib/reader/constants";

// Who's currently reading this material — the reader's own social rail
// (NotesFeedFab), fetched once on arrival rather than polled. Public, same as
// the book-detail page's presence line; a personal upload has no audience
// beyond its uploader, so it never reports anyone.
export async function GET(_request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;
  const material = await resolveMaterialRow(materialId);
  if (!material || material.visibility === "personal") return NextResponse.json({ readers: [], totalCount: 0 });

  const entry = (await listCurrentReaders([material.id], CURRENT_READERS_DISPLAY_CAP)).get(material.id);
  return NextResponse.json(entry ?? { readers: [], totalCount: 0 });
}
