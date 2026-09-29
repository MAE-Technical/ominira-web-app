import type { Metadata } from "next";
import PostView from "@/app/components/community/PostView";

export const metadata: Metadata = {
  title: "Post",
  description: "A note from the community, with its replies.",
};

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostView postId={id} />;
}
