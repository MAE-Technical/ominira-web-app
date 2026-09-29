import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMaterialDetail, MaterialNotFoundError } from "@/lib/materials/detail";
import MaterialDetailView from "@/app/components/materials/MaterialDetailView";
import { PLATFORM_NAME, PLATFORM_URL } from "@/lib/config/platform";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let material;
  try {
    material = await getMaterialDetail(slug);
  } catch {
    return { title: "Not found" };
  }
  const { title, author, cover, description } = material;
  const url = `${PLATFORM_URL}/library/${slug}`;
  const desc = description || `${title} by ${author} — read or listen on ${PLATFORM_NAME}.`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, url, images: cover ? [{ url: cover, alt: title }] : [], type: "book" },
    twitter: { title, description: desc, images: cover ? [cover] : [] },
  };
}

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let material;
  try {
    material = await getMaterialDetail(slug);
  } catch (err) {
    if (err instanceof MaterialNotFoundError) {
      notFound();
    }
    throw err;
  }
  return <MaterialDetailView material={material} />;
}
