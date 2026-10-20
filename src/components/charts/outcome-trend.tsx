"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendWeek } from "@/lib/analytics/compute";

/*
 * Applications sent, screenings reached and rejections taken, by week.
 *
 * The encoding is deliberately mixed. Sends are a bar — a volume you chose —
 * while replies and rejections are lines, because they are consequences of
 * earlier cohorts arriving later. Drawn as three grouped bars they would
 * invite a same-week comparison that is simply false: this week's rejections
 * belong to applications sent a month ago. The lag between the bar and the red
 * line is the most useful thing on the chart.
 */
function weekLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

const SERIES = [
  { key: "applied", label: "Sent", color: "var(--series-1)" },
  { key: "advanced", label: "Reached screening", color: "var(--series-3)" },
  { key: "rejected", label: "Rejected", color: "var(--critical)" },
] as const;

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="border-line bg-surface rounded-lg border px-2.5 py-1.5 shadow-[var(--shadow-pop)]">
      <p className="text-ink-muted text-[11px]">Week of {weekLabel(label)}</p>
      {SERIES.map((series) => {
        const row = payload.find((item) => item.dataKey === series.key);
        if (!row?.value) return null;
        return (
          <p key={series.key} className="text-ink text-xs">
            <span
              className="mr-1.5 inline-block size-2 rounded-[2px] align-middle"
              style={{ backgroundColor: series.color }}
            />
            {series.label}: <strong>{row.value}</strong>
          </p>
        );
      })}
    </div>
  );
}

export function OutcomeTrend({
  trend,
  weeks,
}: {
  trend: TrendWeek[];
  weeks: number;
}) {
  const total = trend.reduce(
    (sum, row) => sum + row.applied + row.advanced + row.rejected,
    0,
  );

  if (total === 0) {
    return (
      <div className="grid h-full min-h-48 place-items-center">
        <p className="text-ink-muted max-w-64 text-center text-xs leading-relaxed">
          Nothing happened in the last {weeks} weeks. Send an application and the
          three series start here.
        </p>
      </div>
    );
  }

  const max = Math.max(
    ...trend.map((row) => Math.max(row.applied, row.advanced, row.rejected)),
    1,
  );

  return (
    <div className="h-full min-h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={trend}
          margin={{ top: 6, right: 6, bottom: 0, left: -24 }}
        >
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="week"
            tickFormatter={weekLabel}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            domain={[0, Math.max(max, 2)]}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <RTooltip
            content={<TrendTooltip />}
            cursor={{ fill: "var(--surface-2)" }}
          />
          <Bar
            dataKey="applied"
            fill="var(--series-1)"
            fillOpacity={0.55}
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="advanced"
            stroke="var(--series-3)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rejected"
            stroke="var(--critical)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {SERIES.map((series) => (
          <span
            key={series.key}
            className="text-ink-muted flex items-center gap-1.5 text-[11px]"
          >
            <span
              className={
                series.key === "applied"
                  ? "size-2 rounded-[2px]"
                  : "h-[2px] w-4 rounded-full"
              }
              style={{ backgroundColor: series.color }}
              aria-hidden
            />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}
