"use client";

import { Briefcase, ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { BoardCardData } from "@/components/applications/application-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { ALL_STAGES, STAGE_META } from "@/lib/stages";
import { isOverdue, useNow } from "@/lib/use-now";
import { formatDate, formatSalary, initials, relativeDay } from "@/lib/utils";

const STAGE_ORDER = new Map(ALL_STAGES.map((stage, index) => [stage, index]));

export function ApplicationList({
  applications,
}: {
  applications: BoardCardData[];
}) {
  const now = useNow();
  const rows = React.useMemo(
    () =>
      [...applications].sort(
        (a, b) =>
          (STAGE_ORDER.get(a.stage) ?? 99) - (STAGE_ORDER.get(b.stage) ?? 99) ||
          b.updatedAt.getTime() - a.updatedAt.getTime(),
      ),
    [applications],
  );

  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          icon={Briefcase}
          title="Nothing tracked yet"
          description="Add an application to get started."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* The table view that relief for low-contrast hues depends on. */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-line text-ink-muted border-b">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Stage
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Fit
              </th>
              <th
                scope="col"
                className="hidden px-4 py-2.5 font-medium sm:table-cell"
              >
                Compensation
              </th>
              <th
                scope="col"
                className="hidden px-4 py-2.5 font-medium md:table-cell"
              >
                Applied
              </th>
              <th
                scope="col"
                className="hidden px-4 py-2.5 font-medium lg:table-cell"
              >
                Next action
              </th>
              <th scope="col" className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((app) => {
              const meta = STAGE_META[app.stage];
              const salary = formatSalary(
                app.salaryMin,
                app.salaryMax,
                app.currency ?? "USD",
              );
              const overdue = isOverdue(app.nextActionAt, now);

              return (
                <tr key={app.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="bg-surface-3 text-ink-2 grid size-7 shrink-0 place-items-center rounded-md text-[9px] font-semibold">
                        {initials(app.company)}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/pipeline/${app.id}`}
                          className="text-ink block max-w-56 truncate font-medium hover:underline"
                        >
                          {app.title}
                        </Link>
                        <p className="text-ink-muted max-w-56 truncate text-[11px]">
                          {app.company}
                          {app.location ? ` · ${app.location}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tint={`var(${meta.token})`}>{meta.label}</Badge>
                  </td>
                  <td className="tnum text-ink-2 px-4 py-2.5">
                    {app.fitScore ?? "—"}
                  </td>
                  <td className="text-ink-2 hidden px-4 py-2.5 sm:table-cell">
                    {salary ?? "—"}
                  </td>
                  <td className="text-ink-muted hidden px-4 py-2.5 md:table-cell">
                    {app.appliedAt ? formatDate(app.appliedAt) : "—"}
                  </td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    {app.nextActionAt ? (
                      <span
                        style={{
                          color: overdue ? "var(--critical)" : "var(--ink-2)",
                        }}
                      >
                        {app.nextActionLabel ?? "Follow up"}{" "}
                        <span className="text-ink-muted">
                          {relativeDay(app.nextActionAt)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {app.jobUrl ? (
                      <a
                        href={app.jobUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Open the posting for ${app.title}`}
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
  );
}
