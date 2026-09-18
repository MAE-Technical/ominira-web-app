"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Megaphone, Bell } from "lucide-react";
import SearchableAppPage from "@/app/components/shell/SearchableAppPage";
import Loader from "@/app/components/Loader";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useNotifications, type NotificationItem } from "@/lib/notifications/useNotifications";
import { useMarkNotificationsRead } from "@/lib/notifications/useMarkNotificationsRead";
import { apiFetch } from "@/lib/api/client";
import { formatTimeAgo } from "@/lib/reader/timeAgo";

const ICON_BY_KIND = { reaction: Heart, reply: MessageCircle, broadcast: Megaphone } as const;

function NotificationRow({ item }: { item: NotificationItem }) {
  const Icon = ICON_BY_KIND[item.kind];
  return (
    <Link
      href={item.url}
      className={`flex items-start gap-3 px-3.5 py-3 no-underline ${
        item.read ? "" : "bg-[var(--reader-surface-hover)]"
      }`}
    >
      <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[var(--reader-border)] text-[var(--reader-text-muted)]">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-semibold text-[var(--reader-text)]">{item.title}</p>
        <p className="mt-0.5 mb-0 text-[13px] text-[var(--reader-text-muted)]">{item.body}</p>
        <p className="mt-1 mb-0 text-xs font-medium text-[var(--reader-text-subtle)]">
          {formatTimeAgo(new Date(item.createdAt).getTime())}
        </p>
      </div>
      {!item.read && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[var(--reader-accent)]" />}
    </Link>
  );
}

export default function NotificationsView() {
  const isAuthenticated = useIsAuthenticated();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();

  // Only the pages fetched by "Load more" live in local state — the first
  // page comes straight from useNotifications()'s query data, concatenated
  // below, so there's no effect syncing query data into local state (and no
  // risk of the two drifting after a cache invalidation like markRead's).
  const [extraItems, setExtraItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = [...(data?.items ?? []), ...extraItems];
  const nextCursor = cursor === undefined ? (data?.nextCursor ?? null) : cursor;

  // Opening this page is the "seen it" signal — clears the bell badge the
  // same way opening an inbox does, no per-item tap required.
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (isAuthenticated && data && data.unreadCount > 0) markReadMutate(undefined);
  }, [isAuthenticated, data, markReadMutate]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<{ items: NotificationItem[]; nextCursor: string | null }>(
        `/notifications?cursor=${encodeURIComponent(nextCursor)}`
      );
      setExtraItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SearchableAppPage>
      <h1 className="mt-1 mb-6 font-serif text-2xl font-semibold text-[var(--reader-text)]">Notifications</h1>

      {!isAuthenticated ? (
        <p className="text-sm text-[var(--reader-text-muted)]">Log in to see your notifications.</p>
      ) : isLoading ? (
        <div className="relative min-h-[240px]">
          <Loader confined />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Bell size={22} className="text-[var(--reader-text-subtle)]" />
          <p className="m-0 text-sm text-[var(--reader-text-muted)]">No notifications yet.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-[var(--reader-border)]">
            {items.map((item, i) => (
              <div key={item.id} className={i > 0 ? "border-t border-[var(--reader-border)]" : ""}>
                <NotificationRow item={item} />
              </div>
            ))}
          </div>

          {nextCursor && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-[var(--reader-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </SearchableAppPage>
  );
}
