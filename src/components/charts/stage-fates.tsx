"use client";

import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { StageFate } from "@/lib/analytics/compute";
import { STAGE_META } from "@/lib/stages";

/*
 * What became of the applications that reached each stage.
 *
 * The conversion funnel next door cannot answer this. A funnel shows
 * survivors, so a narrow stage looks identical whether you are being rejected
 * there or simply never getting that far — and those two call for opposite
 * responses. Splitting each stage's arrivals names the step that is costing
 * you.
 *
 * Bars are normalised to their own arrivals rather than to the widest stage,
 * because the question is proportional ("what share of screenings end badly")
 * and the absolute count is printed alongside anyway.
 */

/** Reading order: progress, then in-flight, then the two kinds of loss. */
const BANDS = [
  { key: "progressed", label: "Moved on", color: "var(--series-3)" },
  { key: "live", label: "Still open", color: "var(--series-1)" },
  { key: "rejected", label: "Rejected", color: "var(--critical)" },
  { key: "withdrawn", label: "Withdrew", color: "var(--stage-withdrawn)" },
] as const;

type BandKey = (typeof BANDS)[number]["key"];

/**
 * `accepted` folds into `progressed`: signing an offer is the funnel's success
 * exit, and a fifth green band would be one more legend entry for a value that
 * is almost always zero or one. The count is named in the tooltip so it is
 * never silently absorbed.
 */
function bands(fate: StageFate): Record<BandKey, number> {
  return {
    progressed: fate.movedOn + fate.accepted,
    live: fate.live,
    rejected: fate.rejected,
    withdrawn: fate.withdrawn,
  };
}

export function StageFates({ fates }: { fates: StageFate[] }) {
  const anyArrivals = fates.some((fate) => fate.reached > 0);

  if (!anyArrivals) {
    return (
      <p className="text-ink-muted px-1 py-6 text-center text-xs">
        Nothing has been sent yet. Once applications start moving, this shows which
        stage they stop at.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {fates.map((fate) => {
        const meta = STAGE_META[fate.stage];
        const values = bands(fate);
        const lost = values.rejected + values.withdrawn;

        return (
          <div key={fate.stage}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-ink-2 text-xs font-medium">{meta.label}</span>
              <span className="flex items-baseline gap-2">
                {/* The red band in the bar is the encoding. Keeping this
                    label out of --critical is deliberate: that token has no
                    dark variant and fails AA as 11px text on the dark
                    surface. */}
                {fate.reached > 0 && lost > 0 ? (
                  <span className="tnum text-ink-2 text-[11px]">
                    {Math.round((lost / fate.reached) * 100)}% lost here
                  </span>
                ) : null}
                <span className="tnum text-ink text-xs font-semibold">
                  {fate.reached}
                </span>
              </span>
            </div>

            {fate.reached === 0 ? (
              // An empty track rather than nothing: the gap in the sequence is
              // itself the finding, and a missing row would read as a layout
              // bug instead of "you have never got this far".
              <div className="bg-surface-2 h-2.5 w-full rounded-sm" />
            ) : (
              <div className="bg-surface-2 flex h-2.5 w-full overflow-hidden rounded-sm">
                {BANDS.map((band) => {
                  const value = values[band.key];
                  if (!value) return null;
                  const share = (value / fate.reached) * 100;
                  const accepted =
                    band.key === "progressed" && fate.accepted > 0
                      ? ` (${fate.accepted} accepted)`
                      : "";
                  return (
                    <Tooltip
                      key={band.key}
                      content={
                        <span>
                          <strong className="text-ink">{value}</strong> of{" "}
                          {fate.reached} that reached {meta.label.toLowerCase()}:{" "}
                          {band.label.toLowerCase()}
                          {accepted}
                        </span>
                      }
                    >
                      <div
                        className="h-full cursor-default"
                        style={{ width: `${share}%`, backgroundColor: band.color }}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="border-line flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
        {BANDS.map((band) => (
          <span
            key={band.key}
            className="text-ink-muted flex items-center gap-1.5 text-[11px]"
          >
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: band.color }}
              aria-hidden
            />
            {band.label}
          </span>
        ))}
      </div>
    </div>
  );
}
