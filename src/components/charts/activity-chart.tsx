"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ActivityPoint = { date: string; count: number };

function tickLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

function ActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const count = payload[0].value ?? 0;
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-[var(--shadow-pop)]">
      <p className="text-[11px] text-ink-muted">{tickLabel(label)}</p>
      <p className="text-xs font-semibold text-ink">
        {count} {count === 1 ? "application" : "applications"}
      </p>
    </div>
  );
}

/**
 * Applications sent per day. One series, so no legend — the card title names
 * it. Crosshair + tooltip is the default interaction for an area chart.
 */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const max = Math.max(...data.map((point) => point.count), 1);

  return (
    <div className="h-full min-h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -24 }}>
          <defs>
            {/* ~10% wash, per the area-fill spec. */}
            <linearGradient id="activity-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Hairline, solid, recessive. */}
          <CartesianGrid
            stroke="var(--grid)"
            strokeWidth={1}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={tickLabel}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            minTickGap={28}
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
            content={<ActivityTooltip />}
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="url(#activity-wash)"
            activeDot={{
              r: 4,
              fill: "var(--series-1)",
              stroke: "var(--surface)",
              strokeWidth: 2,
            }}
            dot={false}
            // Recharts clips the area to zero width until its entry animation
            // runs; a throttled rAF (background tab) leaves the chart blank.
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
