import { CalendarClock, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { Application } from "@/db/schema";
import { STAGE_META } from "@/lib/stages";
import { formatSalary, initials, relativeDay } from "@/lib/utils";
import { Briefcase } from "lucide-react";

export type InPlayJob = Application & {
  fitScore: number | null;
  prepTotal: number;
  prepDone: number;
};

/**
 * The jobs themselves, on the dashboard.
 *
 * Every other panel here is a number or a queue; none of them answered "which
 * jobs do I actually have open", which is the first thing you want to see. One
 * row per application, furthest-along first, carrying the three things that
 * decide what to do about it: how well it fits, how much prep is left, and
 * whether anything is scheduled.
 *
 * A server component — nothing here needs state, and keeping it off the client
 * bundle is free.
 */
export function InPlay({ jobs }: { jobs: InPlayJob[] }) {
  if (!jobs.length) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Nothing in play"
        description="Every application is either closed or archived."
        compact
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {jobs.map((job) => {
        const meta = STAGE_META[job.stage];
        const salary = formatSalary(
          job.salaryMin,
          job.salaryMax,
          job.currency ?? "USD",
        );
        const prepLeft = job.prepTotal - job.prepDone;

        return (
          <li key={job.id}>
            <Link
              href={`/pipeline/${job.id}`}
              className="hover:bg-surface-2 flex items-center gap-3 px-5 py-3 transition-colors"
            >
              <span
                aria-hidden
                className="bg-surface-3 text-ink-2 grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-semibold"
              >
                {initials(job.company)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink truncate text-xs font-medium">{job.title}</p>
                <p className="text-ink-muted truncate text-[11px]">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ""}
                  {salary ? ` · ${salary}` : ""}
                </p>
              </div>

              {/* Prep left is the actionable number — "7 of 12 done" is a
                  status report, "5 left" is a decision. */}
              {prepLeft > 0 ? (
                <span className="text-ink-muted hidden shrink-0 text-[10px] sm:inline">
                  {prepLeft} prep left
                </span>
              ) : job.prepTotal > 0 ? (
                <span
                  className="hidden shrink-0 text-[10px] sm:inline"
                  style={{ color: "var(--good)" }}
                >
                  prep done
                </span>
              ) : null}

              {job.fitScore != null ? (
                <Badge
                  tint={
                    job.fitScore >= 70
                      ? "var(--good)"
                      : job.fitScore >= 50
                        ? "var(--warning)"
                        : "var(--serious)"
                  }
                >
                  <Sparkles className="size-2.5" />
                  {job.fitScore}
                </Badge>
              ) : null}

              <Badge tint={`var(${meta.token})`}>{meta.label}</Badge>

              {job.nextActionAt ? (
                <span className="text-ink-muted hidden shrink-0 items-center gap-1 text-[10px] lg:flex">
                  <CalendarClock className="size-3" />
                  {relativeDay(job.nextActionAt)}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
