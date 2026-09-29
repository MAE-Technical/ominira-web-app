"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { DailyActivity } from "@/lib/metrics/dashboard";

// `day` is a UTC calendar date ("2026-09-29"); format it as UTC so it never
// shifts a day in a browser west of Greenwich.
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const formatDay = (day: string, format = shortDate) => format.format(new Date(`${day}T00:00:00Z`));

/**
 * Daily active members over the last 30 days — one series, so no legend: the
 * card's title names it. A 2px line over a ~10% wash, hairline horizontal
 * grid only, and a crosshair tooltip carrying that day's other activity
 * (new members, posts, reactions) so one line tells the whole day.
 */
export default function ActivityChart({ data }: { data: DailyActivity[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="activity-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--reader-accent)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--reader-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--reader-border)" />
          <XAxis
            dataKey="day"
            tickFormatter={(day: string) => formatDay(day)}
            interval="preserveStartEnd"
            minTickGap={40}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--reader-text-muted)" }}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fontSize: 12, fill: "var(--reader-text-muted)" }}
          />
          <Tooltip
            content={ActivityTooltip}
            cursor={{ stroke: "var(--reader-text-subtle)", strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="active"
            name="Active members"
            stroke="var(--reader-accent)"
            strokeWidth={2}
            fill="url(#activity-wash)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--reader-surface)", fill: "var(--reader-accent)" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = active ? (payload?.[0]?.payload as DailyActivity | undefined) : undefined;
  if (!point) return null;

  return (
    <div className="min-w-[160px] rounded-[var(--radius-sm)] border border-[var(--reader-border)] bg-[var(--reader-surface)] px-3 py-2.5 shadow-lg">
      <p className="m-0 mb-1.5 text-[11px] font-semibold text-[var(--reader-text-muted)]">{formatDay(point.day, longDate)}</p>
      <p className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--reader-text)]">
        <span className="h-2 w-2 rounded-full bg-[var(--reader-accent)]" aria-hidden />
        {point.active.toLocaleString("en")} active
      </p>
      <dl className="m-0 mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[11px] text-[var(--reader-text-muted)]">
        <dt>New members</dt>
        <dd className="m-0 text-right tabular-nums">{point.newMembers}</dd>
        <dt>Posts</dt>
        <dd className="m-0 text-right tabular-nums">{point.posts}</dd>
        <dt>Reactions</dt>
        <dd className="m-0 text-right tabular-nums">{point.reactions}</dd>
      </dl>
    </div>
  );
}
