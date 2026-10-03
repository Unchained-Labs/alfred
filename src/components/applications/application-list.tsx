"use client";

import { Briefcase, ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { BoardCardData } from "@/components/applications/application-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { ALL_STAGES, STAGE_META } from "@/lib/stages";
import { formatDate, formatSalary, initials, relativeDay } from "@/lib/utils";

const STAGE_ORDER = new Map(ALL_STAGES.map((stage, index) => [stage, index]));

export function ApplicationList({
  applications,
}: {
  applications: BoardCardData[];
}) {
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
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Stage</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Fit</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                Compensation
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">
                Applied
              </th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">
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
              const overdue =
                app.nextActionAt != null &&
                app.nextActionAt.getTime() < Date.now();

              return (
                <tr key={app.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-3 text-[9px] font-semibold text-ink-2">
                        {initials(app.company)}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/pipeline/${app.id}`}
                          className="block max-w-56 truncate font-medium text-ink hover:underline"
                        >
                          {app.title}
                        </Link>
                        <p className="max-w-56 truncate text-[11px] text-ink-muted">
                          {app.company}
                          {app.location ? ` · ${app.location}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tint={`var(${meta.token})`}>{meta.label}</Badge>
                  </td>
                  <td className="tnum px-4 py-2.5 text-ink-2">
                    {app.fitScore ?? "—"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell">
                    {salary ?? "—"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-muted md:table-cell">
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
                        className="inline-grid size-6 place-items-center rounded text-ink-muted transition-colors hover:text-ink"
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
