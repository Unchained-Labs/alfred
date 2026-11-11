"use client";

import { RefreshCw, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { isPending, jobAction } from "@/components/jobs/use-queued-job";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import type { AiJob, AiJobStatus } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";

const TINT: Record<AiJobStatus, string | undefined> = {
  queued: undefined,
  running: "var(--brand)",
  succeeded: "var(--good)",
  failed: "var(--critical)",
  cancelled: undefined,
};

function duration(job: AiJob): string | null {
  if (!job.startedAt) return null;
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  const seconds = Math.max(
    0,
    Math.round((end - new Date(job.startedAt).getTime()) / 1000),
  );
  return seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;
}

/**
 * Every AI generation of the last month: what ran, how long it took, what
 * failed and why — with Retry and Cancel. Polls while anything is pending.
 */
export function JobQueueCard() {
  const [jobs, setJobs] = React.useState<AiJob[] | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/jobs?limit=100", {
      cache: "no-store",
    }).catch(() => null);
    if (response?.ok) setJobs(((await response.json()) as { jobs: AiJob[] }).jobs);
  }, []);

  React.useEffect(() => {
    let off = false;
    fetch("/api/jobs?limit=100", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { jobs: AiJob[] } | null) => {
        if (!off && data) setJobs(data.jobs);
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);

  // Every few seconds while anything is pending.
  const anyPending = jobs?.some(isPending) ?? false;
  React.useEffect(() => {
    if (!anyPending) return;
    const timer = setInterval(load, 3_000);
    return () => clearInterval(timer);
  }, [anyPending, load]);

  async function act(job: AiJob, action: "retry" | "cancel") {
    setBusyId(job.id);
    try {
      await jobAction(job.id, action);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = jobs?.filter(isPending).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Generation queue</CardTitle>
          <p className="text-ink-muted mt-0.5 text-xs">
            {pending
              ? `${pending} waiting or running. Failures from a passing hiccup retry on their own, with a growing pause; a signed-out provider does not.`
              : "Everything Alfred has generated recently. Finished jobs are cleared after 30 days."}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/queue">Open AI queue</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      {jobs && !jobs.length ? (
        <EmptyState
          icon={RefreshCw}
          title="Nothing queued yet"
          description="Add an application with its job description and Alfred starts here."
          compact
        />
      ) : (
        <CardBody className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {(jobs ?? []).map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-xs"
              >
                <Badge tint={TINT[job.status]}>{job.status}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate font-medium">
                    {job.applicationId ? (
                      <Link
                        href={`/pipeline/${job.applicationId}`}
                        className="hover:underline"
                      >
                        {job.label ?? job.kind}
                      </Link>
                    ) : (
                      (job.label ?? job.kind)
                    )}
                  </p>
                  <p className="text-ink-muted">
                    {/* Polled JSON carries ISO strings, not Dates. */}
                    {formatDateTime(new Date(job.createdAt))}
                    {duration(job) ? ` · ${duration(job)}` : ""}
                    {job.attempts > 1
                      ? ` · attempt ${job.attempts} of ${job.maxAttempts}`
                      : ""}
                    {job.lane === "interactive" ? " · interactive" : ""}
                  </p>
                  {job.error && job.status !== "succeeded" ? (
                    <p className="text-ink-2 mt-1 leading-relaxed break-words">
                      {job.error}
                    </p>
                  ) : null}
                </div>
                {job.status === "failed" || job.status === "cancelled" ? (
                  job.lane === "background" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act(job, "retry")}
                      loading={busyId === job.id}
                    >
                      <RotateCcw className="size-3.5" />
                      Retry
                    </Button>
                  ) : null
                ) : isPending(job) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act(job, "cancel")}
                    loading={busyId === job.id}
                  >
                    <X className="size-3.5" />
                    Cancel
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      )}
    </Card>
  );
}
