"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import Tooltip from "@/app/components/reader/Tooltip";
import { useUnreadNotificationsCount } from "@/lib/notifications/useNotifications";

// Just a link to /notifications with an unread badge, not an in-header
// popover — the actual feed lives on its own page (NotificationsView),
// which is also where opening it clears the badge. Borderless (ported from
// wip/notes-ui-and-schema-refactor's Profile Dropdown and Edit `.icon-btn`)
// — plain icon, no ring, unlike the old bordered-surface treatment.
export default function NotificationsMenu() {
  const { data: unreadCount } = useUnreadNotificationsCount();
  const hasUnread = !!unreadCount && unreadCount > 0;

  return (
    <Tooltip label="Notifications" side="bottom" align="end">
      <Link
        href="/notifications"
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative flex h-9 w-9 flex-none items-center justify-center rounded-full text-[var(--reader-text-muted)] no-underline hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)]"
      >
        <Bell size={18} />
        {hasUnread && (
          <span className="absolute -top-1 -right-0.5 flex h-4.5 min-w-4.5 px-1 items-center justify-center rounded-full bg-[var(--reader-accent)] text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}
