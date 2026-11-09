"use client";

import { useRouter } from "next/navigation";
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
import type { RankedJob } from "@/lib/analytics/jobs";
import { formatMoney } from "@/lib/fx/convert";
import { STAGE_META } from "@/lib/stages";

/*
 * Pay against fit, one point per job that has both.
 *
 * The top-right corner is the answer: well paid and a good match. The dashed
 * lines are the medians of what is in view, so the corners are always "better
 * than your typical job on both" rather than against some absolute bar that a
 * junior and a principal search would read completely differently.
 *
 * Points are coloured by stage, using the board's own stage colours, so a
 * cluster of wishlist in the top-right is visibly work not yet started.
 * Clicking one opens the application.
 */

type Point = RankedJob & { x: number; y: number };

function PointTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload?: Point }[];
  currency: string;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="border-line bg-surface max-w-60 rounded-lg border px-2.5 py-1.5 shadow-[var(--shadow-pop)]">
      <p className="text-ink truncate text-xs font-semibold">{p.company}</p>
      <p className="text-ink-muted truncate text-[11px]">{p.title}</p>
      <p className="text-ink-2 mt-1 text-[11px]">
        {formatMoney(p.pay, currency)} · fit {p.fitScore}/100 ·{" "}
        {STAGE_META[p.stage].label.toLowerCase()}
      </p>
    </div>
  );
}

export function PayFitScatter({
  jobs,
  currency,
  medianPay,
  medianFit,
}: {
  jobs: RankedJob[];
  currency: string;
  medianPay: number | null;
  medianFit: number | null;
}) {
  const router = useRouter();
  const points: Point[] = jobs
    .filter((j) => j.pay != null && j.fitScore != null)
    .map((j) => ({ ...j, x: j.fitScore!, y: j.pay! }));

  if (!points.length) {
    return (
      <div className="grid h-full min-h-56 place-items-center">
        <p className="text-ink-muted max-w-64 text-center text-xs leading-relaxed">
          No job in view has both a salary and a fit score. Add salaries to postings
          and run an analysis, and each becomes a point here.
        </p>
      </div>
    );
  }

  const stages = [...new Set(points.map((p) => p.stage))];

  return (
    <div className="h-full min-h-56 w-full">
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeWidth={1} />
          <XAxis
            type="number"
            dataKey="x"
            name="Fit"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            label={{
              value: "Fit",
              position: "insideBottomRight",
              offset: -2,
              fill: "var(--ink-muted)",
              fontSize: 10,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Pay"
            domain={[0, "auto"]}
            tickFormatter={(v: number) => formatMoney(v, currency)}
            tick={{ fill: "var(--ink-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={58}
          />
          <ZAxis range={[90, 90]} />
          <RTooltip content={<PointTooltip currency={currency} />} />
          {medianFit != null ? (
            <ReferenceLine
              x={medianFit}
              stroke="var(--axis)"
              strokeDasharray="3 3"
            />
          ) : null}
          {medianPay != null ? (
            <ReferenceLine
              y={medianPay}
              stroke="var(--axis)"
              strokeDasharray="3 3"
            />
          ) : null}
          {stages.map((stage) => (
            <Scatter
              key={stage}
              name={STAGE_META[stage].label}
              data={points.filter((p) => p.stage === stage)}
              fill={`var(${STAGE_META[stage].token})`}
              fillOpacity={0.9}
              cursor="pointer"
              onClick={(p: { payload?: Point }) => {
                if (p?.payload?.id) router.push(`/pipeline/${p.payload.id}`);
              }}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {stages.map((stage) => (
          <span
            key={stage}
            className="text-ink-muted flex items-center gap-1.5 text-[11px]"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: `var(${STAGE_META[stage].token})` }}
              aria-hidden
            />
            {STAGE_META[stage].label} (
            {points.filter((p) => p.stage === stage).length})
          </span>
        ))}
        <span className="text-ink-muted text-[11px]">
          · dashed lines are the medians
        </span>
      </div>
    </div>
  );
}
