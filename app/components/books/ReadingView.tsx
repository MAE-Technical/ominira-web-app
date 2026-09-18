"use client";

import SearchableAppPage from "@/app/components/shell/SearchableAppPage";
import BookListRow from "@/app/components/shell/BookListRow";
import ReadingAuthPrompt from "@/app/components/books/ReadingAuthPrompt";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useContinueReading } from "@/lib/auth/useContinueReading";

export default function ReadingView() {
  const isAuthenticated = useIsAuthenticated();
  const { data: items, isLoading } = useContinueReading();

  // Signed-out readers land here with no reading list to show. Rather than
  // the same generic "join the movement" pitch the home feed uses,
  // ReadingAuthPrompt gates a preview of this page's own layout — see its
  // header comment — so the nudge to log in or join is specific to what's
  // actually missing: their list.
  if (!isAuthenticated) {
    return (
      <SearchableAppPage>
        <div className="mt-1 mb-7">
          <h1 className="m-0 font-serif text-2xl font-bold text-[var(--reader-text)]">Reading</h1>
        </div>
        <ReadingAuthPrompt />
      </SearchableAppPage>
    );
  }

  return (
    <SearchableAppPage>
      <div className="mt-1 mb-7">
        <h1 className="m-0 font-serif text-2xl font-bold text-[var(--reader-text)]">Reading</h1>
        {/* <p className="mt-1 mb-0 font-literata text-sm text-[var(--reader-text-muted)]">Right where you left off.</p> */}
      </div>

      {isLoading ? (
        // Same 1-col mobile / 2-col desktop grid the real rows below render
        // into (not space-y-3's single column) — otherwise the skeleton
        // collapses to one column on desktop and the layout visibly jumps
        // to two the moment real rows swap in.
        <div className="grid grid-cols-1 gap-x-10 shell:grid-cols-2">
          {Array.from({ length: 10 }).map((_, index) => <div key={index} className="my-2 h-36 animate-pulse rounded-sm bg-[var(--reader-surface-hover)]" />)}
        </div>
      ) : !items?.length ? (
        <p className="text-sm text-[var(--reader-text-muted)]">Start a book from the library and it will appear here.</p>
      ) : (
        // Same list-row card (and 1-col mobile / 2-col desktop layout) as
        // the Library catalogue — every item here is already in progress,
        // so BookListRow's own progress bar (fed by the same
        // reading-position-store useContinueReading just populated) shows
        // on every row without any special-casing. resumeTarget is what
        // additionally sends each row straight into the reader at this
        // reader's own real section/passage instead of the book-detail page
        // — every item here already carries its own reader_activities
        // sectionId/passageIndex straight from GET /continue-reading, no
        // client-store read needed.
        <div className="grid grid-cols-1 shell:grid-cols-2 shell:gap-x-10">
          {items.map((item) => (
            <BookListRow
              key={item.material.id}
              material={item.material}
              resumeTarget={{ sectionId: item.sectionId, passageIndex: item.passageIndex, audioTimeMs: item.audioTimeMs }}
            />
          ))}
        </div>
      )}
    </SearchableAppPage>
  );
}
