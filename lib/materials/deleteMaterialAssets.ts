import { deletePrefix, putObject } from "@/lib/storage/r2";
import { slugMarker } from "./uniqueSlug";

/**
 * Removes everything a material owns — its whole `books/<slug>/` folder in
 * R2 — except the slug's `.taken` marker, so the slug is never handed out
 * again: the files were cached as immutable, and a new book at the same keys
 * would be served the old one's bytes. Best-effort: called after the
 * `materials` row is already gone (the DB delete is what makes a book
 * disappear), so a failure here leaves orphaned files rather than reversing
 * the delete.
 */
export async function deleteMaterialAssets(slug: string): Promise<{ errors: string[] }> {
  const folder = `books/${slug}/`;
  try {
    const failed = await deletePrefix(folder);
    await putObject(slugMarker(slug), "", "text/plain");
    return { errors: failed.map((key) => `could not remove ${key}`) };
  } catch (err) {
    return { errors: [`${folder}: ${(err as Error).message}`] };
  }
}
