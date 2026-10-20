"use client";

import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { StageDuration } from "@/lib/analytics/compute";
import { STAGE_META } from "@/lib/stages";

/*
 * How long each stage takes, as the middle half of the observed waits with the
 * median marked.
 *
 * A single average would be the obvious chart and the wrong one: waiting times
 * in a job hunt are badly skewed, so one company that took nine weeks drags a
 * mean somewhere no individual application has ever been. The p25–p75 band
 * says "this is the range you should plan for" and the tick says where the
 * middle actually sits.
 *
 * Stages are ordinal, so they take the stage ramp rather than categorical
 * slots — the order is legible in the colour.
 */
export function StageWait({ durations }: { durations: StageDuration[] }) {
  const measured = durations.filter((duration) => duration.n > 0);
  const scale = Math.max(...measured.map((duration) => duration.p75 ?? 0), 1);

  if (!measured.length) {
    return (
      <p className="text-ink-muted px-1 py-6 text-center text-xs">
        No stage has been completed yet. Each one needs an application to go in and
        come out again before there is a duration to report.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {durations.map((duration) => {
        const meta = STAGE_META[duration.stage];
        const hasData = duration.n > 0;
        const p25 = duration.p25 ?? 0;
        const p75 = duration.p75 ?? 0;
        const median = duration.medianDays ?? 0;

        const left = (p25 / scale) * 100;
        // A band with no spread would be invisible, and "every observation
        // landed on the same day" is a real finding worth seeing.
        const width = Math.max(((p75 - p25) / scale) * 100, 1.5);
        const tick = (median / scale) * 100;

        return (
          <div key={duration.stage}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-ink-2 text-xs font-medium">{meta.label}</span>
              <span className="flex items-baseline gap-2">
                {duration.waitingNow > 0 ? (
                  <span className="text-ink-muted text-[11px]">
                    {duration.waitingNow} waiting
                    {duration.waitingLongestDays != null
                      ? `, longest ${Math.round(duration.waitingLongestDays)}d`
                      : ""}
                  </span>
                ) : null}
                {hasData ? (
                  <span className="tnum text-ink text-xs font-semibold">
                    {median}d
                  </span>
                ) : (
                  <span className="text-ink-muted text-[11px]">no data</span>
                )}
              </span>
            </div>

            <Tooltip
              side="top"
              content={
                hasData ? (
                  <span>
                    Middle half took{" "}
                    <strong className="text-ink">
                      {p25}–{p75} days
                    </strong>
                    , median {median}. Longest {duration.longestDays} days. Over{" "}
                    {duration.n} completed {duration.n === 1 ? "visit" : "visits"}
                    {duration.n < 3 ? " — too few to lean on" : ""}.
                  </span>
                ) : (
                  <span>
                    Nothing has completed this stage yet
                    {duration.waitingNow > 0
                      ? `, though ${duration.waitingNow} ${duration.waitingNow === 1 ? "is" : "are"} sitting in it now`
                      : ""}
                    .
                  </span>
                )
              }
            >
              <div className="bg-surface-2 relative h-2.5 w-full cursor-default rounded-sm">
                {hasData ? (
                  <>
                    <div
                      className="absolute inset-y-0 rounded-sm"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: `var(${meta.token})`,
                        opacity: 0.45,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 w-[2px] rounded-full"
                      style={{
                        left: `calc(${tick}% - 1px)`,
                        backgroundColor: `var(${meta.token})`,
                      }}
                    />
                  </>
                ) : null}
              </div>
            </Tooltip>
          </div>
        );
      })}

      <div className="border-line text-ink-muted flex items-center justify-between border-t pt-2.5 text-[11px]">
        <span>0 days</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-4 rounded-sm"
              style={{ backgroundColor: "var(--stage-technical)", opacity: 0.45 }}
              aria-hidden
            />
            middle half
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-[2px] rounded-full"
              style={{ backgroundColor: "var(--stage-technical)" }}
              aria-hidden
            />
            median
          </span>
        </span>
        <span className="tnum">{Math.round(scale)} days</span>
      </div>
    </div>
  );
}
