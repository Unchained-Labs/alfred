"use client";

import {
  ArrowDown,
  ArrowUp,
  Archive,
  Briefcase,
  ExternalLink,
  Search,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import type { Application, ApplicationStage } from "@/db/schema";
import { ALL_STAGES, STAGE_META } from "@/lib/stages";
import { isOverdue, useNow } from "@/lib/use-now";
import { cn, formatDate, formatSalary, initials, relativeDay } from "@/lib/utils";

export type JobRow = Application & {
  fitScore: number | null;
  /** Prep items attached to this job, and how many are finished. */
  prepTotal: number;
  prepDone: number;
};

type SortKey =
  "company" | "title" | "stage" | "fit" | "salary" | "applied" | "next" | "updated";

const STAGE_RANK = new Map(ALL_STAGES.map((stage, index) => [stage, index]));

/** Sort values. Null sorts last in both directions — "unknown" is not "zero". */
function valueOf(row: JobRow, key: SortKey): string | number | null {
  switch (key) {
    case "company":
      return row.company.toLowerCase();
    case "title":
      return row.title.toLowerCase();
    case "stage":
      return STAGE_RANK.get(row.stage) ?? 99;
    case "fit":
      return row.fitScore;
    case "salary":
      return row.salaryMax ?? row.salaryMin;
    case "applied":
      return row.appliedAt?.getTime() ?? null;
    case "next":
      return row.nextActionAt?.getTime() ?? null;
    case "updated":
      return row.updatedAt.getTime();
  }
}

const COLUMNS: {
  key: SortKey;
  label: string;
  /** Tailwind visibility — the narrower the screen, the fewer columns. */
  show?: string;
  align?: string;
  numeric?: boolean;
}[] = [
  { key: "title", label: "Role" },
  { key: "stage", label: "Stage" },
  { key: "fit", label: "Fit", numeric: true },
  { key: "salary", label: "Compensation", show: "hidden sm:table-cell" },
  { key: "applied", label: "Applied", show: "hidden lg:table-cell" },
  { key: "next", label: "Next action", show: "hidden xl:table-cell" },
  { key: "updated", label: "Updated", show: "hidden md:table-cell" },
];

/**
 * Every job in one table: searchable, sortable, and including the closed and
 * archived ones that the board deliberately hides.
 *
 * The board answers "what do I do next". This answers "what have I got", which
 * is a different question and wants a different shape — one row per job, dense,
 * and sortable by the thing you happen to care about today.
 *
 * On overflow: the page scrolls normally and the table scrolls horizontally
 * inside its own card. Nothing here is given a fixed height, so no amount of
 * filter chrome can squeeze the rows.
 */
export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const now = useNow();
  const [query, setQuery] = React.useState("");
  const [stage, setStage] = React.useState<"all" | ApplicationStage>("all");
  const [showArchived, setShowArchived] = React.useState(false);
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: "updated",
    desc: true,
  });

  const archivedCount = React.useMemo(
    () => jobs.filter((j) => j.archived).length,
    [jobs],
  );

  const stagesPresent = React.useMemo(
    () => ALL_STAGES.filter((s) => jobs.some((j) => j.stage === s)),
    [jobs],
  );

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = jobs.filter((job) => {
      if (!showArchived && job.archived) return false;
      if (stage !== "all" && job.stage !== stage) return false;
      if (!needle) return true;
      // Everything a person might half-remember about a job.
      return [
        job.company,
        job.title,
        job.location,
        job.seniority,
        job.workMode,
        job.source,
        job.contactName,
        ...(job.tags ?? []),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });

    return filtered.sort((a, b) => {
      const av = valueOf(a, sort.key);
      const bv = valueOf(b, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.desc ? -cmp : cmp;
    });
  }, [jobs, query, stage, showArchived, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, desc: !prev.desc }
        : // Text reads better A-Z first; numbers and dates read better biggest first.
          { key, desc: key !== "company" && key !== "title" },
    );
  }

  if (!jobs.length) {
    return (
      <Card>
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Add one with the button in the header, or paste a posting and let Alfred parse it."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters wrap rather than squash, and never scroll away — the page
          scrolls, so they stay where you left them relative to the rows. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="text-ink-muted pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, role, location, tag…"
            aria-label="Search jobs"
            className="pl-8"
          />
        </div>

        <div className="border-line bg-surface-2 flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
          <StageChip
            active={stage === "all"}
            onClick={() => setStage("all")}
            label="All"
          />
          {stagesPresent.map((candidate) => (
            <StageChip
              key={candidate}
              active={stage === candidate}
              onClick={() => setStage(candidate)}
              label={STAGE_META[candidate].label}
              tint={`var(${STAGE_META[candidate].token})`}
            />
          ))}
        </div>

        {archivedCount > 0 ? (
          <label className="text-ink-muted inline-flex cursor-pointer items-center gap-2 text-xs whitespace-nowrap">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="size-3.5 cursor-pointer accent-[var(--brand)]"
            />
            <Archive className="size-3" />
            {archivedCount} archived
          </label>
        ) : null}
      </div>

      <p className="text-ink-muted text-xs">
        {rows.length === jobs.length
          ? `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`
          : `${rows.length} of ${jobs.length} shown`}
      </p>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="Nothing matches"
            description="Clear the search or pick a different stage."
            compact
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* The table keeps its own scrollbar. A min width stops the columns
              collapsing into unreadable slivers on a narrow screen. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-xs">
              <thead>
                <tr className="border-line text-ink-muted border-b">
                  {COLUMNS.map((col) => {
                    const active = sort.key === col.key;
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={
                          active ? (sort.desc ? "descending" : "ascending") : "none"
                        }
                        className={cn("font-medium", col.show)}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className={cn(
                            "hover:text-ink flex w-full cursor-pointer items-center gap-1 px-4 py-2.5 transition-colors",
                            col.numeric && "justify-end",
                            active && "text-ink",
                          )}
                        >
                          {col.label}
                          {active ? (
                            sort.desc ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUp className="size-3" />
                            )
                          ) : null}
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="px-4 py-2.5">
                    <span className="sr-only">Posting</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((job) => {
                  const meta = STAGE_META[job.stage];
                  const salary = formatSalary(
                    job.salaryMin,
                    job.salaryMax,
                    job.currency ?? "USD",
                  );
                  const overdue = isOverdue(job.nextActionAt, now);

                  return (
                    <tr
                      key={job.id}
                      className={cn(
                        "hover:bg-surface-2 transition-colors",
                        job.archived && "opacity-60",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="bg-surface-3 text-ink-2 grid size-7 shrink-0 place-items-center rounded-md text-[9px] font-semibold"
                          >
                            {initials(job.company)}
                          </span>
                          <div className="min-w-0">
                            {/* Truncation with a title attribute: a long role
                                name must not widen the table. */}
                            <Link
                              href={`/pipeline/${job.id}`}
                              title={job.title}
                              className="text-ink block max-w-[18rem] truncate font-medium hover:underline"
                            >
                              {job.title}
                            </Link>
                            <p
                              className="text-ink-muted max-w-[18rem] truncate text-[11px]"
                              title={`${job.company}${job.location ? ` · ${job.location}` : ""}`}
                            >
                              {job.company}
                              {job.location ? ` · ${job.location}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge tint={`var(${meta.token})`}>{meta.label}</Badge>
                          {job.archived ? <Badge>archived</Badge> : null}
                        </div>
                      </td>

                      <td className="tnum text-ink-2 px-4 py-2.5 text-right">
                        {job.fitScore ?? "—"}
                      </td>

                      <td className="text-ink-2 hidden px-4 py-2.5 sm:table-cell">
                        <span className="whitespace-nowrap">{salary ?? "—"}</span>
                      </td>

                      <td className="text-ink-muted hidden px-4 py-2.5 whitespace-nowrap lg:table-cell">
                        {job.appliedAt ? formatDate(job.appliedAt) : "—"}
                      </td>

                      <td className="hidden max-w-[14rem] px-4 py-2.5 xl:table-cell">
                        {job.nextActionAt ? (
                          <span
                            className="block truncate"
                            title={`${job.nextActionLabel ?? "Follow up"} ${relativeDay(job.nextActionAt)}`}
                            style={{
                              color: overdue ? "var(--critical)" : "var(--ink-2)",
                            }}
                          >
                            {job.nextActionLabel ?? "Follow up"}{" "}
                            <span className="text-ink-muted">
                              {relativeDay(job.nextActionAt)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>

                      <td className="text-ink-muted hidden px-4 py-2.5 whitespace-nowrap md:table-cell">
                        {relativeDay(job.updatedAt)}
                        {job.prepTotal > 0 ? (
                          <span className="tnum text-ink-muted ml-2 text-[10px]">
                            prep {job.prepDone}/{job.prepTotal}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        {job.jobUrl ? (
                          <a
                            href={job.jobUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Open the posting for ${job.title}`}
                            className="text-ink-muted hover:text-ink inline-grid size-6 place-items-center rounded transition-colors"
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StageChip({
  active,
  onClick,
  label,
  tint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
        active ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
      )}
    >
      {tint ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: tint }}
        />
      ) : null}
      {label}
    </button>
  );
}
