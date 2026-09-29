"use client";

import { useRouter } from "next/navigation";
import SearchableAppPage from "@/app/components/shell/SearchableAppPage";
import DetailHeader from "@/app/components/shared/DetailHeader";
import NoResults from "@/app/components/shared/NoResults";
import Loader from "@/app/components/Loader";
import NoteThreadCard from "@/app/components/reader/notes/NoteThreadCard";
import NoteBookContext from "@/app/components/reader/notes/NoteBookContext";
import { communityFeedItemHref, usePostThread } from "@/lib/community/useCommunityFeed";
import { useThreadInteraction } from "@/lib/reader/useThreadInteraction";
import { resolveBookThumbnailSrc } from "@/lib/materials/image";
import type { FeedItem } from "@/lib/community/feed";

/** The thread itself, rendered by the same NoteThreadCard the feed and the
 * reader's own panels use — so a note read from a notification behaves
 * exactly like one read anywhere else (react, reply inline, edit, expand).
 * Split from PostView proper because the thread's interaction hook needs
 * the fetched note to exist: hooks can't mount behind a loading branch. */
function PostThread({ item, focusId }: { item: FeedItem; focusId: string | null }) {
  const { ui, actions, expandedIds, toggleExpanded } = useThreadInteraction({
    materialId: item.material?.id ?? null,
    ranges: item.note.ranges,
    allNotes: [item.note, ...item.replies],
  });

  return (
    <NoteThreadCard
      // NoteBookContext is both the quote card and the way out: it fuses
      // the highlighted passage with its book strip under one deep link
      // into the reader at that exact passage. So this page never opens the
      // reader itself — it shows the note, and the quote is the door.
      {...(item.material
        ? {
            header: (
              <NoteBookContext
                href={communityFeedItemHref(item) ?? ""}
                title={item.material.title}
                author={item.material.author}
                section={item.label ?? undefined}
                coverUrl={resolveBookThumbnailSrc(item.material)}
                materialType={item.material.materialType}
                excerpt={item.excerpt}
              />
            ),
          }
        : {})}
      note={item.note}
      replies={item.replies}
      // Always open: a feed card earns its collapsed state by sitting among
      // other cards, and there's nothing else on this page to collapse for.
      expanded={expandedIds.has(item.note.id)}
      initialShowAll
      focusReplyId={focusId ?? undefined}
      onToggleExpand={() => toggleExpanded(item.note.id)}
      ui={ui}
      actions={actions}
    />
  );
}

/** A single note and its replies on their own page — where a notification
 * (in app or pushed) lands. Notifications used to deep-link straight into
 * the reader at the note's passage, which meant a tap loaded a whole book
 * to show one reply. This shows the thread that was actually reacted to or
 * replied to, and leaves the book one tap away. A reaction to a *book*
 * never comes here at all — that notification points at the material's own
 * details page, since there's no thread involved. */
export default function PostView({ postId }: { postId: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = usePostThread(postId);

  return (
    <SearchableAppPage>
      <DetailHeader
        onBack={() => router.back()}
        title={"Back"}
      />

      <div className="mx-auto max-w-[640px] py-2">
        {isLoading ? (
          <div className="relative min-h-[240px]">
            <Loader confined />
          </div>
        ) : isError || !data ? (
          <NoResults message="This note isn't available — it may have been deleted, or it's private." />
        ) : (
          <PostThread item={data} focusId={data.focusId} />
        )}
      </div>
    </SearchableAppPage>
  );
}
