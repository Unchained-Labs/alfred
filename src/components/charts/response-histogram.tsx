"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResponseTimes } from "@/lib/analytics/compute";

/*
 * How long a reply takes once an application is sent.
 *
 * A distribution rather than an average, because the shape is the point: a
 * clump inside a week and a long tail call for different follow-up habits than
 * a flat spread, and a mean of eleven days hides both.
 *
 * One series, so no legend — the card title names it.
 */
function HistogramTooltip({
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
    <div className="border-line bg-surface rounded-lg border px-2.5 py-1.5 shadow-[var(--shadow-pop)]">
      <p className="text-ink-muted text-[11px]">Replied in {label}</p>
      <p className="text-ink text-xs font-semibold">
        {count} {count === 1 ? "application" : "applications"}
      </p>
    </div>
  );
}

export function ResponseHistogram({ response }: { response: ResponseTimes }) {
  if (response.n === 0) {
    return (
      <div className="grid h-full min-h-44 place-items-center">
        <p className="text-ink-muted max-w-60 text-center text-xs leading-relaxed">
          {response.stillWaiting > 0
            ? `Nothing has been answered yet — ${response.stillWaiting} ${response.stillWaiting === 1 ? "application is" : "applications are"} still waiting.`
            : response.unobservable > 0
              ? // Saying "no replies yet" here would contradict the note
                // directly below it, which explains that a reply did arrive —
                // just before Alfred was watching.
                "Nothing with a measurable lag yet. The next application you send from here will have one."
              : "No replies recorded yet. This fills in as companies come back to you."}
        </p>
      </div>
    );
  }

  const max = Math.max(...response.buckets.map((bucket) => bucket.count), 1);

  return (
    <div className="h-full min-h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={response.buckets}
          margin={{ top: 6, right: 6, bottom: 0, left: -24 }}
        >
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
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
            content={<HistogramTooltip />}
            cursor={{ fill: "var(--surface-2)" }}
          />
          <Bar
            dataKey="count"
            fill="var(--series-1)"
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
