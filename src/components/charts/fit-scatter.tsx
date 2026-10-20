"use client";

import * as React from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { FitPoint, FitVersusOutcome } from "@/lib/analytics/compute";
import { FUNNEL_STAGES, STAGE_META } from "@/lib/stages";

/*
 * Fit score against how far the application actually went.
 *
 * This is the one panel that grades Alfred rather than the job hunt. The score
 * is written before anyone has replied, so if the two medians never pull apart
 * the score is decoration and should be read as such. Saying so in the UI is
 * better than quietly hoping nobody checks.
 *
 * The y axis is the funnel, so up is further. Points are coloured by outcome
 * rather than by score, because the interesting pattern is a cluster of red at
 * a high score — a model that likes jobs that do not like you back.
 */

type Group = {
  key: string;
  label: string;
  color: string;
  points: FitPoint[];
};

function group(points: FitPoint[]): Group[] {
  const offer = FUNNEL_STAGES.indexOf("offer");
  const won: FitPoint[] = [];
  const closed: FitPoint[] = [];
  const open: FitPoint[] = [];

  for (const point of points) {
    if (point.outcome === "accepted" || point.furthestIndex >= offer)
      won.push(point);
    else if (point.outcome === "rejected" || point.outcome === "withdrawn")
      closed.push(point);
    else open.push(point);
  }

  return [
    { key: "won", label: "Reached offer", color: "var(--series-3)", points: won },
    { key: "open", label: "Still open", color: "var(--series-1)", points: open },
    {
      key: "closed",
      label: "Closed out",
      color: "var(--critical)",
      points: closed,
    },
  ].filter((entry) => entry.points.length > 0);
}

function PointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: FitPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="border-line bg-surface max-w-56 rounded-lg border px-2.5 py-1.5 shadow-[var(--shadow-pop)]">
      <p className="text-ink truncate text-xs font-semibold">{point.company}</p>
      <p className="text-ink-muted truncate text-[11px]">{point.title}</p>
      <p className="text-ink-2 mt-1 text-[11px]">
        Fit {point.fitScore}/100 · reached{" "}
        {STAGE_META[point.furthestStage].label.toLowerCase()}
      </p>
    </div>
  );
}

export function FitScatter({ fit }: { fit: FitVersusOutcome }) {
  const groups = group(fit.points);

  if (!fit.points.length) {
    return (
      <div className="grid h-full min-h-48 place-items-center">
        <p className="text-ink-muted max-w-64 text-center text-xs leading-relaxed">
          No analysed applications yet. Run an analysis on a few and this shows
          whether the fit score has any bearing on how far they go.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 10, bottom: 0, left: 16 }}>
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} />
          <XAxis
            type="number"
            dataKey="fitScore"
            name="Fit score"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="furthestIndex"
            name="Furthest stage"
            // Padded half a step either side so a point on the top or bottom
            // stage is not sliced in half by the plot edge.
            domain={[-0.5, FUNNEL_STAGES.length - 0.5]}
            ticks={FUNNEL_STAGES.map((_, index) => index)}
            tickFormatter={(value: number) =>
              STAGE_META[FUNNEL_STAGES[value]]?.label ?? ""
            }
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={62}
          />
          <ZAxis range={[70, 70]} />
          <RTooltip content={<PointTooltip />} />

          {fit.medianFitStalled != null && fit.n >= 4 ? (
            <ReferenceLine
              x={fit.medianFitStalled}
              stroke="var(--critical)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ) : null}
          {fit.medianFitAdvanced != null && fit.n >= 4 ? (
            <ReferenceLine
              x={fit.medianFitAdvanced}
              stroke="var(--series-3)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ) : null}

          {groups.map((entry) => (
            <Scatter
              key={entry.key}
              name={entry.label}
              data={entry.points}
              fill={entry.color}
              fillOpacity={0.85}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {groups.map((entry) => (
          <span
            key={entry.key}
            className="text-ink-muted flex items-center gap-1.5 text-[11px]"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            {entry.label} ({entry.points.length})
          </span>
        ))}
      </div>
    </div>
  );
}
