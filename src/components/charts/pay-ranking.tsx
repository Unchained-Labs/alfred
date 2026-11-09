import Link from "next/link";
import * as React from "react";
import type { RankedJob } from "@/lib/analytics/jobs";
import { formatMoney } from "@/lib/fx/convert";

/*
 * Jobs ranked by pay, each drawn as its salary RANGE on one shared scale with
 * the comparable midpoint marked. A bar per job would hide the thing that
 * matters most when two postings look close: one says 420–600k and the other
 * says exactly 500k, and only the range shows that the first could be either
 * the best or the worst offer on the board.
 */
export function PayRanking({
  jobs,
  currency,
  limit = 10,
}: {
  jobs: RankedJob[];
  currency: string;
  limit?: number;
}) {
  const paid = jobs
    .filter((j) => j.pay != null)
    .sort((a, b) => b.pay! - a.pay!)
    .slice(0, limit);

  if (!paid.length) {
    return (
      <p className="text-ink-muted px-1 py-8 text-center text-xs">
        No salaries in view. Postings with a stated salary are ranked here.
      </p>
    );
  }

  const max = Math.max(...paid.map((j) => j.payHigh ?? j.pay!));
  const pct = (v: number) => `${(v / max) * 100}%`;

  return (
    <ol className="space-y-3">
      {paid.map((job, i) => {
        const low = job.payLow ?? job.pay!;
        const high = job.payHigh ?? job.pay!;
        return (
          <li key={job.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <Link
                href={`/pipeline/${job.id}`}
                className="text-ink-2 hover:text-ink min-w-0 truncate text-xs font-medium"
              >
                <span className="text-ink-muted tnum mr-1.5">{i + 1}</span>
                {job.company}
                <span className="text-ink-muted font-normal"> · {job.title}</span>
              </Link>
              <span className="tnum text-ink shrink-0 text-xs font-semibold">
                {formatMoney(job.pay, currency)}
              </span>
            </div>
            <div
              className="bg-surface-3 relative h-2 rounded-full"
              title={`${formatMoney(low, currency)} – ${formatMoney(high, currency)}`}
            >
              <span
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: pct(low),
                  width: `max(6px, ${pct(high - low)})`,
                  background: "color-mix(in oklab, var(--brand) 45%, transparent)",
                }}
              />
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface)]"
                style={{ left: pct(job.pay!), background: "var(--brand)" }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
