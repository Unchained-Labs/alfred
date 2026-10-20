"use client";

import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { type BreakdownRow, MIN_FOR_RATE } from "@/lib/analytics/compute";

/*
 * Response rate sliced by one attribute of the application.
 *
 * The bar is the rate; the number beside it is the sample. Rows below
 * MIN_FOR_RATE get no bar at all rather than a bar with a caveat, because
 * "100%" over a single application is not a weak signal, it is a sentence with
 * no content — and drawn next to a real rate it invites exactly the comparison
 * it cannot support. Those rows still appear, because knowing you have only
 * tried one contract role is itself worth seeing.
 */
export function BreakdownBars({
  rows,
  emptyLabel,
}: {
  rows: BreakdownRow[];
  emptyLabel: string;
}) {
  if (!rows.length) {
    return (
      <p className="text-ink-muted px-1 py-5 text-center text-xs">{emptyLabel}</p>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-ink-2 truncate text-xs font-medium capitalize">
              {row.key}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="text-ink-muted tnum text-[11px]">{row.n} sent</span>
              {row.responseRate != null ? (
                <span className="tnum text-ink text-xs font-semibold">
                  {row.responseRate}%
                </span>
              ) : (
                <span className="text-ink-muted text-[11px]">too few to rate</span>
              )}
            </span>
          </div>

          <Tooltip
            content={
              <span>
                <strong className="text-ink">{row.responded}</strong> of {row.n} got
                a reply
                {row.rejected > 0 ? `, ${row.rejected} rejected` : ""}
                {row.offers > 0 ? `, ${row.offers} reached offer` : ""}
                {row.responseRate == null
                  ? `. Needs ${MIN_FOR_RATE} before a percentage means anything.`
                  : "."}
              </span>
            }
          >
            <div className="bg-surface-2 h-2 w-full cursor-default overflow-hidden rounded-sm">
              {row.responseRate != null ? (
                <div
                  className="h-full rounded-r-[3px]"
                  style={{
                    width: `${Math.max(row.responseRate, 1.5)}%`,
                    backgroundColor: "var(--series-1)",
                  }}
                />
              ) : null}
            </div>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
