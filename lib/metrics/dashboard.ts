import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";

/**
 * The benchmark each Growth & engagement card is judged against on /admin.
 * `weeklyGrowth` is a change vs last week; the rest are shares (0–1).
 * Starting points drawn from common consumer/community-app norms — tune as
 * Ominira's own history builds up.
 */
export const TARGETS = {
  /** New members and weekly active: +10% on the 7 days before. */
  weeklyGrowth: 0.1,
  /** Share of all members active in the last 30 days. */
  monthlyActive: 0.5,
  /** Weekly active ÷ monthly active. */
  stickiness: 0.5,
  /** Share of last-30-day joiners who started a book. */
  activation: 0.5,
  /** Share of a week's joiners who came back within 7 days. */
  week1Retention: 0.4,
  /** Share of started books that were finished. */
  completion: 0.25,
  /** Share of weekly active members who posted or reacted (the 1-9-90 rule's ~10%). */
  contributors: 0.1,
} as const;

export type DailyActivity = { day: string; active: number; reading: number; newMembers: number; posts: number; reactions: number };

type CoreKey = "members" | "books" | "posts" | "reactions";
type Totals = Record<CoreKey | `${CoreKey}_week` | `${CoreKey}_prev_week`, number>;
type Engagement = Record<
  "wau" | "wau_prev" | "mau" | "contributors" | "recent_members" | "activated" | "cohort" | "retained" | "started" | "finished",
  number
>;

export type DashboardMetrics = { totals: Totals; engagement: Engagement; daily: DailyActivity[] };

/** Every dashboard figure in one call — public.admin_dashboard_metrics()
 * (migrations/20261005_admin_dashboard.sql). Counts arrive as JSON numbers. */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { data, error } = await getSupabaseAdminClient().rpc("admin_dashboard_metrics");
  if (error || !data) throw new Error(`Could not load dashboard metrics: ${error?.message ?? "no data"}`);
  return data as unknown as DashboardMetrics;
}

/** Relative change from `previous` to `current`, or null when there's no
 * baseline to compare against (a 0 → N week isn't a percentage). */
export function growthRate(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

/** `part / whole`, or null when `whole` is 0. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
