"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import type { RankedJob, SortKey } from "@/lib/analytics/jobs";
import { formatMoney } from "@/lib/fx/convert";
import { STAGE_META } from "@/lib/stages";
import { cn, formatDate, formatSalary } from "@/lib/utils";

/*
 * Every job in view, one row each, sortable by any column. Sorting lives in
 * the URL beside the filters, so "sorted by pay, interviewing only" is one
 * link. Rows with nothing to sort by stay at the bottom in both directions —
 * a missing salary is not the lowest salary.
 *
 * On a phone the table scrolls sideways with the job column pinned, rather
 * than collapsing into cards: the point of a table is comparing a column top
 * to bottom, and cards make that impossible.
 */

type Column = {
  key: SortKey;
  label: string;
  align?: "right";
  /** First click sorts this way: numbers high-first, text A-first. */
  firstDir: "asc" | "desc";
};

const COLUMNS: Column[] = [
  { key: "combined", label: "Score", align: "right", firstDir: "desc" },
  { key: "pay", label: "Pay", align: "right", firstDir: "desc" },
  { key: "fit", label: "Fit", align: "right", firstDir: "desc" },
  { key: "stage", label: "Stage", firstDir: "desc" },
  { key: "workMode", label: "Mode", firstDir: "asc" },
  { key: "location", label: "Location", firstDir: "asc" },
  { key: "applied", label: "Applied", align: "right", firstDir: "desc" },
];

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <span className="bg-surface-3 hidden h-1 w-10 overflow-hidden rounded-full sm:inline-block">
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
        }}
      />
    </span>
  );
}

export function JobTable({
  jobs,
  currency,
  sort,
  dir,
}: {
  jobs: RankedJob[];
  currency: string;
  sort: SortKey;
  dir: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const sortBy = (column: SortKey, firstDir: "asc" | "desc") => {
    const next = new URLSearchParams(params.toString());
    const nextDir = column === sort ? (dir === "desc" ? "asc" : "desc") : firstDir;
    if (column === "combined") next.delete("sort");
    else next.set("sort", column);
    if (nextDir === "desc") next.delete("dir");
    else next.set("dir", nextDir);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const header = (
    key: SortKey,
    label: string,
    firstDir: "asc" | "desc",
    align?: "right",
  ) => {
    const active = sort === key;
    const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
    return (
      <th
        scope="col"
        aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
        className={cn(
          "px-3 py-2.5 font-medium whitespace-nowrap",
          align === "right" && "text-right",
        )}
      >
        <button
          type="button"
          onClick={() => sortBy(key, firstDir)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 transition-colors",
            active ? "text-ink" : "hover:text-ink",
          )}
        >
          {label}
          <Icon className={cn("size-3", !active && "opacity-40")} />
        </button>
      </th>
    );
  };

  if (!jobs.length) {
    return (
      <p className="text-ink-muted px-4 py-12 text-center text-sm">
        Nothing matches these filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="text-ink-muted border-line border-b text-left text-[11px] tracking-wide uppercase">
          <tr>
            <th
              scope="col"
              className="bg-surface sticky left-0 z-10 px-3 py-2.5 font-medium"
            >
              <button
                type="button"
                onClick={() => sortBy("company", "asc")}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1",
                  sort === "company" ? "text-ink" : "hover:text-ink",
                )}
              >
                Job
                {sort === "company" ? (
                  dir === "desc" ? (
                    <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUp className="size-3" />
                  )
                ) : (
                  <ArrowUpDown className="size-3 opacity-40" />
                )}
              </button>
            </th>
            {COLUMNS.map((c) => header(c.key, c.label, c.firstDir, c.align))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const stage = STAGE_META[job.stage];
            const top = job.combinedRank != null && job.combinedRank <= 3;
            const original = formatSalary(
              job.salaryMin,
              job.salaryMax,
              job.currency ?? "USD",
            );
            return (
              <tr
                key={job.id}
                className="border-line hover:bg-surface-2/60 group border-b last:border-0"
              >
                <td className="bg-surface group-hover:bg-surface-2 sticky left-0 z-10 max-w-64 px-3 py-2.5">
                  <Link href={`/pipeline/${job.id}`} className="block min-w-0">
                    <span className="text-ink flex items-center gap-1.5 font-medium">
                      {top ? (
                        <Star
                          className="size-3.5 shrink-0"
                          style={{
                            color: "var(--warning)",
                            fill: "var(--warning)",
                          }}
                          aria-label={`Top ${job.combinedRank} on the combined score`}
                        />
                      ) : null}
                      <span className="truncate">{job.company}</span>
                    </span>
                    <span className="text-ink-muted block truncate text-xs">
                      {job.title}
                    </span>
                  </Link>
                </td>
                <td className="tnum px-3 py-2.5 text-right">
                  {job.combined != null ? (
                    <span className="inline-flex items-center gap-2">
                      <Bar value={job.combined} color="var(--brand)" />
                      <span className="text-ink font-semibold">{job.combined}</span>
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-right whitespace-nowrap">
                  <span
                    className={
                      job.pay != null ? "text-ink font-medium" : "text-ink-muted"
                    }
                  >
                    {formatMoney(job.pay, currency)}
                  </span>
                  {original && job.pay != null ? (
                    <span className="text-ink-muted block text-[11px]">
                      {original}
                    </span>
                  ) : original ? (
                    <span className="text-ink-muted block text-[11px]">
                      {original} · no rate
                    </span>
                  ) : null}
                </td>
                <td className="tnum px-3 py-2.5 text-right">
                  {job.fitScore != null ? (
                    <span className="inline-flex items-center gap-2">
                      <Bar value={job.fitScore} color="var(--series-3)" />
                      <span className="text-ink">{job.fitScore}</span>
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: `var(${stage.token})` }}
                      aria-hidden
                    />
                    {stage.label}
                  </span>
                </td>
                <td className="text-ink-2 px-3 py-2.5 text-xs capitalize">
                  {job.workMode ?? <span className="text-ink-muted">—</span>}
                </td>
                <td className="text-ink-2 max-w-48 truncate px-3 py-2.5 text-xs">
                  {job.location ?? <span className="text-ink-muted">—</span>}
                </td>
                <td className="text-ink-2 tnum px-3 py-2.5 text-right text-xs whitespace-nowrap">
                  {job.appliedAt ? (
                    formatDate(job.appliedAt)
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
