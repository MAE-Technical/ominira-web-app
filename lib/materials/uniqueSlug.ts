import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { slugify } from "@/lib/book/epubParser";
import { r2Bucket, r2Client } from "@/lib/storage/r2";

/** Marks a slug as used, for good: written when the slug is claimed and kept
 * when its book is deleted (deleteMaterialAssets). */
export const slugMarker = (slug: string) => `books/${slug}/.taken`;

/** Writes the slug's marker only if it doesn't exist yet. False if it did. */
async function claim(slug: string): Promise<boolean> {
  try {
    await r2Client().send(new PutObjectCommand({ Bucket: r2Bucket(), Key: slugMarker(slug), Body: "", IfNoneMatch: "*" }));
    return true;
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) return false;
    throw err;
  }
}

/** Claims a slug from the title that no material row uses and no one has
 * claimed before. The claim is atomic, so two uploads of the same title at
 * once never share a folder. */
export async function uniqueSlug(baseTitle: string): Promise<string> {
  const admin = getSupabaseAdminClient();
  const base = slugify(baseTitle) || "untitled";
  let candidate = base;
  for (let attempt = 1; attempt < 50; attempt++) {
    const { data } = await admin.from("materials").select("id").eq("slug", candidate).maybeSingle();
    if (!data && (await claim(candidate))) return candidate;
    candidate = `${base}-${attempt + 1}`;
  }
  candidate = `${base}-${randomUUID().slice(0, 8)}`;
  await claim(candidate);
  return candidate;
}
