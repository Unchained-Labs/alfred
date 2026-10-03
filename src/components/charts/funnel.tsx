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
 */
export function Funnel({ rows }: { rows: FunnelRow[] }) {
  const top = rows[0]?.count ?? 0;

  if (!top) {
    return (
      <p className="px-1 py-6 text-center text-xs text-ink-muted">
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
          previous && previous > 0 ? Math.round((row.count / previous) * 100) : null;

        return (
          <div key={row.stage} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-ink-2">{meta.label}</span>
              <span className="flex items-baseline gap-2">
                {conversion != null ? (
                  <span className="tnum text-[11px] text-ink-muted">
                    {conversion}% carried
                  </span>
                ) : null}
                <span className="tnum text-xs font-semibold text-ink">
                  {row.count}
                </span>
              </span>
            </div>

            <Tooltip
              content={
                <span>
                  <strong className="text-ink">{row.count}</strong> reached{" "}
                  {meta.label.toLowerCase()}
                  {conversion != null ? ` — ${conversion}% of the previous stage` : ""}
                </span>
              }
            >
              {/* The track is a lighter plane, not a ramp step, so the fill
                  always reads as the data. */}
              <div className="h-2.5 w-full cursor-default overflow-hidden rounded-sm bg-surface-2">
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-500 ease-out"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: `var(${meta.token})`,
                  }}
                />
              </div>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
