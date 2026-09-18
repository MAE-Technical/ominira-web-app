import type { Metadata } from "next";
import NotificationsView from "@/app/components/notifications/NotificationsView";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Reactions, replies, and announcements — everything that's happened since you last checked.",
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
