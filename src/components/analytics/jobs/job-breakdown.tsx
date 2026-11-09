import * as React from "react";
import type { JobBreakdownRow } from "@/lib/analytics/jobs";
import { formatMoney } from "@/lib/fx/convert";

/*
 * One attribute's slices: how many jobs, what they pay at the median, how well
 * they fit. The count bar is relative to the biggest slice; pay and fit are
 * printed rather than drawn, because with a handful of jobs per slice a bar
 * would claim a precision the median does not have.
 */
export function JobBreakdown({
  rows,
  currency,
  emptyLabel,
}: {
  rows: JobBreakdownRow[];
  currency: string;
  emptyLabel: string;
}) {
  if (!rows.length) {
    return (
      <p className="text-ink-muted px-1 py-5 text-center text-xs">{emptyLabel}</p>
    );
  }
  const most = Math.max(...rows.map((r) => r.n));
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-ink-2 truncate text-xs font-medium capitalize">
              {row.key}
            </span>
            <span className="tnum flex shrink-0 items-baseline gap-3 text-[11px]">
              <span className="text-ink-muted">{row.n}</span>
              <span className="text-ink w-14 text-right font-medium">
                {formatMoney(row.medianPay, currency)}
              </span>
              <span className="text-ink-2 w-12 text-right">
                {row.medianFit != null ? `fit ${Math.round(row.medianFit)}` : "—"}
              </span>
            </span>
          </div>
          <div className="bg-surface-3 h-1.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.n / most) * 100}%`,
                background: "var(--series-1)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
