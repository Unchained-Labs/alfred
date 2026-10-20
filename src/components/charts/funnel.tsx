"use client";

import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ApplicationStage } from "@/db/schema";
import { STAGE_META } from "@/lib/stages";

export type FunnelRow = { stage: ApplicationStage; count: number };

/**
 * Conversion funnel as horizontal bars on a single baseline.
 *
 * Stages are *ordinal*, so they take the one-hue blue ramp rather than
 * categorical slots — the reader sees the order in the color. One series, so
 * no legend box; every bar is directly labeled with its count and the
 * step-to-step conversion, which also supplies the relief for the lighter
 * ramp steps.
 *
 * `exits` adds the losses as a second, shorter bar on the same scale. Without
 * it the chart can only show survivors, which makes "you keep getting rejected
 * at the technical round" indistinguishable from "you rarely reach it" — and
 * those two call for opposite responses. The full breakdown lives on the
 * Analytics page; this is the version that fits on a dashboard.
 */
export function Funnel({
  rows,
  exits,
}: {
  rows: FunnelRow[];
  /** Applications that ended at each stage, by stage. */
  exits?: Partial<Record<ApplicationStage, number>>;
}) {
  const top = rows[0]?.count ?? 0;

  if (!top) {
    return (
      <p className="text-ink-muted px-1 py-6 text-center text-xs">
        No applications sent yet — the funnel fills in once you apply.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row, index) => {
        const meta = STAGE_META[row.stage];
        const widthPct = Math.max((row.count / top) * 100, row.count > 0 ? 1.5 : 0);
        const previous = index > 0 ? rows[index - 1].count : null;
        const conversion =
          previous && previous > 0
            ? Math.round((row.count / previous) * 100)
            : null;
        const lost = exits?.[row.stage] ?? 0;
        const lostPct = lost > 0 ? Math.max((lost / top) * 100, 1.5) : 0;

        return (
          <div key={row.stage} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-ink-2 text-xs font-medium">{meta.label}</span>
              <span className="flex items-baseline gap-2">
                {/* Not in --critical: it has no dark-mode variant and lands
                    at 3.7:1 on the dark surface, under AA for text this size.
                    The red bar below carries the colour; this only has to be
                    readable, and a step stronger than the muted "% carried"
                    beside it. */}
                {lost > 0 ? (
                  <span className="tnum text-ink-2 text-[11px]">
                    {lost} ended here
                  </span>
                ) : null}
                {conversion != null ? (
                  <span className="tnum text-ink-muted text-[11px]">
                    {conversion}% carried
                  </span>
                ) : null}
                <span className="tnum text-ink text-xs font-semibold">
                  {row.count}
                </span>
              </span>
            </div>

            <Tooltip
              content={
                <span>
                  <strong className="text-ink">{row.count}</strong> reached{" "}
                  {meta.label.toLowerCase()}
                  {conversion != null
                    ? ` — ${conversion}% of the previous stage`
                    : ""}
                  {lost > 0 ? `. ${lost} ended here.` : ""}
                </span>
              }
            >
              {/* The track is a lighter plane, not a ramp step, so the fill
                  always reads as the data. */}
              <div className="bg-surface-2 h-2.5 w-full cursor-default overflow-hidden rounded-sm">
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-500 ease-out"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: `var(${meta.token})`,
                  }}
                />
              </div>
            </Tooltip>

            {/* Same baseline, same scale, so the loss reads directly against
                the arrivals above it. */}
            {lost > 0 ? (
              <div className="mt-0.5 h-1 w-full">
                <div
                  className="h-full rounded-r-[2px]"
                  style={{
                    width: `${lostPct}%`,
                    backgroundColor: "var(--critical)",
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
