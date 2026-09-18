// Shared between server (notify.ts, API routes) and client (useNotifications.ts)
// — kept in its own file so client components importing this type never pull
// in notify.ts's server-only imports (getSupabaseAdminClient, web-push).
export type NotificationKind = "reaction" | "reply" | "broadcast";
