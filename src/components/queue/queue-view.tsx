"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hand,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { StatTile } from "@/components/charts/stat-tile";
import { jobAction } from "@/components/jobs/use-queued-job";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import type { AiJob, AiJobKind, AiJobStatus } from "@/db/schema";
import { elapsedSeconds, formatElapsed, isWaitingOnYou } from "@/lib/jobs/status";
import { formatDateTime } from "@/lib/utils";

/*
 * The AI queue: every generation Alfred runs, as it runs.
 *
 * Top to bottom in the order you would act on it — what is waiting for your
 * answer, what is running, what is next, then the record of everything that
 * finished, with per-kind numbers for spotting the step that is always slow
 * or always failing. Polls every two seconds while anything is pending, and
 * the timers tick every second between polls.
 */

type Named = Record<string, { company: string; title: string }>;
type Limits = {
  checkInMs: number;
  timeoutMs: number;
  interactiveTimeoutMs: number;
  concurrency: { background: number; interactive: number };
};
type Payload = {
  jobs: AiJob[];
  applications: Named;
  limits: Limits;
  now: number;
};

const KIND_LABEL: Record<AiJobKind, string> = {
  analysis: "Fit analysis",
  actionables: "Actionables",
  questionnaire: "Questionnaire",
  handbook_outline: "Handbook outline",
  handbook_part: "Handbook part",
  handbook_drills: "Handbook drills",
  handbook_lab: "Handbook scenes & lab",
  handbook_ask: "Handbook question",
  exercise: "Exercise",
  parse_job: "Read a posting",
  parse_resume: "Read a résumé",
  grade_answer: "Grade an answer",
  triage_email: "Sort an email",
};

const TINT: Record<AiJobStatus, string | undefined> = {
  queued: undefined,
  running: "var(--brand)",
  succeeded: "var(--good)",
  failed: "var(--critical)",
  cancelled: undefined,
};

const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;
const ts = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function QueueView() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [status, setStatus] = React.useState<"all" | AiJobStatus>("all");
  const [kind, setKind] = React.useState<"all" | AiJobKind>("all");
  const [app, setApp] = React.useState("all");
  const [query, setQuery] = React.useState("");
  // Server minus browser clock, so "running for" is right on a skewed laptop.
  const skew = React.useRef(0);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/jobs?limit=500", {
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as Payload;
    skew.current = payload.now - Date.now();
    setData(payload);
  }, []);

  React.useEffect(() => {
    // Not load() directly: an effect must not set state synchronously.
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const jobs = React.useMemo(() => data?.jobs ?? [], [data]);
  const pending = jobs.some((j) => j.status === "queued" || j.status === "running");

  // Fast while something is in flight, slow otherwise (a job can be queued
  // from another tab or by the pipeline at any time).
  React.useEffect(() => {
    const timer = setInterval(load, pending ? 2_000 : 15_000);
    return () => clearInterval(timer);
  }, [pending, load]);

  React.useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now() + skew.current), 1_000);
    return () => clearInterval(timer);
  }, [pending]);

  async function act(id: string, action: "retry" | "cancel" | "continue") {
    setBusy(id + action);
    try {
      await jobAction(id, action);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function bulk(action: "retry-failed" | "cancel-queued") {
    setBusy(action);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { limits, applications } = data;
  const waiting = jobs.filter((j) => isWaitingOnYou(j, now));
  const running = jobs.filter(
    (j) => j.status === "running" && !isWaitingOnYou(j, now),
  );
  const queued = jobs
    .filter((j) => j.status === "queued")
    .sort(
      (a, b) =>
        (a.lane === "interactive" ? 0 : 1) - (b.lane === "interactive" ? 0 : 1) ||
        a.priority - b.priority ||
        ts(a.createdAt) - ts(b.createdAt),
    );
  const finished = jobs.filter(
    (j) => j.status !== "queued" && j.status !== "running",
  );
  const dayAgo = now - 86_400_000;
  const failedCount = finished.filter((j) => j.status === "failed").length;
  const doneToday = finished.filter(
    (j) => j.status === "succeeded" && ts(j.finishedAt) >= dayAgo,
  ).length;

  const appName = (job: AiJob) => {
    const a = job.applicationId ? applications[job.applicationId] : undefined;
    return a ? `${a.company} — ${a.title}` : null;
  };

  const history = finished.filter((j) => {
    if (status !== "all" && j.status !== status) return false;
    if (kind !== "all" && j.kind !== kind) return false;
    if (app !== "all" && j.applicationId !== app) return false;
    if (query) {
      const hay = `${j.label ?? ""} ${KIND_LABEL[j.kind]} ${appName(j) ?? ""} ${j.error ?? ""}`;
      if (!hay.toLowerCase().includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const kinds = [...new Set(jobs.map((j) => j.kind))];
  const byKind = kinds
    .map((k) => {
      const of = finished.filter((j) => j.kind === k);
      const ok = of.filter((j) => j.status === "succeeded");
      const durations = ok
        .map((j) => elapsedSeconds(j))
        .filter((s): s is number => s !== null);
      return {
        kind: k,
        runs: of.length,
        succeeded: ok.length,
        failed: of.filter((j) => j.status === "failed").length,
        median: median(durations),
        longest: durations.length ? Math.max(...durations) : null,
        retried: of.filter((j) => j.attempts > 1).length,
      };
    })
    .filter((r) => r.runs)
    .sort((a, b) => b.runs - a.runs);

  const appOptions = Object.entries(applications)
    .map(([id, a]) => ({ value: id, label: `${a.company} — ${a.title}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const meta = (job: AiJob) =>
    [
      appName(job),
      job.attempts > 1 ? `attempt ${job.attempts} of ${job.maxAttempts}` : null,
      job.lane === "interactive" ? "interactive" : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const title = (job: AiJob) => (
    <p className="text-ink truncate text-sm font-medium">
      {job.applicationId ? (
        <Link href={`/pipeline/${job.applicationId}`} className="hover:underline">
          {job.label ?? KIND_LABEL[job.kind]}
        </Link>
      ) : (
        (job.label ?? KIND_LABEL[job.kind])
      )}
    </p>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile
          label="Waiting on you"
          value={waiting.length}
          icon={Hand}
          hint={`Asks after ${minutes(limits.checkInMs)}`}
        />
        <StatTile
          label="Running"
          value={running.length + waiting.length}
          icon={Loader2}
          hint={`${limits.concurrency.background} background, ${limits.concurrency.interactive} interactive at once`}
        />
        <StatTile label="Up next" value={queued.length} icon={Clock} />
        <StatTile
          label="Failed"
          value={failedCount}
          icon={AlertTriangle}
          hint="Last 30 days"
        />
        <StatTile label="Done today" value={doneToday} icon={CheckCircle2} />
      </div>

      {waiting.length ? (
        <Card
          className="border-[color-mix(in_oklab,var(--warning)_45%,transparent)]"
          aria-live="polite"
        >
          <CardHeader>
            <div>
              <CardTitle>Taking longer than usual</CardTitle>
              <CardDescription>
                These are still working. Keep going gives each another{" "}
                {minutes(limits.checkInMs)} before it asks again; Stop ends it now.
                Unanswered, a job carries on until it has run{" "}
                {minutes(limits.timeoutMs)} in all.
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-[var(--border)]">
              {waiting.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <Hand
                    className="size-4 shrink-0"
                    style={{ color: "var(--warning)" }}
                  />
                  <div className="min-w-0 flex-1">
                    {title(job)}
                    <p className="text-ink-muted text-xs">
                      Running for{" "}
                      <span className="tnum">
                        {formatElapsed(elapsedSeconds(job, now) ?? 0)}
                      </span>
                      {meta(job) ? ` · ${meta(job)}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => act(job.id, "continue")}
                    loading={busy === job.id + "continue"}
                  >
                    <Play className="size-3.5" />
                    Keep going
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => act(job.id, "cancel")}
                    loading={busy === job.id + "cancel"}
                  >
                    <Square className="size-3.5" />
                    Stop
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Running now</CardTitle>
              <CardDescription>
                The bar fills toward the {minutes(limits.checkInMs)} check-in.
              </CardDescription>
            </div>
          </CardHeader>
          {running.length ? (
            <CardBody className="p-0">
              <ul className="divide-y divide-[var(--border)]">
                {running.map((job) => {
                  const seconds = elapsedSeconds(job, now) ?? 0;
                  const span = job.checkInAt
                    ? ts(job.checkInAt) - ts(job.startedAt)
                    : limits.interactiveTimeoutMs;
                  const share = Math.min(1, (seconds * 1000) / Math.max(1, span));
                  return (
                    <li key={job.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Loader2
                          className="size-4 shrink-0 animate-spin"
                          style={{ color: "var(--brand)" }}
                        />
                        <div className="min-w-0 flex-1">
                          {title(job)}
                          <p className="text-ink-muted text-xs">
                            <span className="tnum">{formatElapsed(seconds)}</span>
                            {meta(job) ? ` · ${meta(job)}` : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(job.id, "cancel")}
                          loading={busy === job.id + "cancel"}
                        >
                          <Square className="size-3.5" />
                          Stop
                        </Button>
                      </div>
                      <div className="bg-surface-3 h-1 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                          style={{
                            width: `${share * 100}%`,
                            background: "var(--brand)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          ) : (
            <EmptyState
              icon={Loader2}
              title={waiting.length ? "Nothing else running" : "Nothing running"}
              description="Generations start here as soon as a slot is free."
              compact
            />
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Up next</CardTitle>
              <CardDescription>In the order they will run.</CardDescription>
            </div>
            {queued.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => bulk("cancel-queued")}
                loading={busy === "cancel-queued"}
              >
                <X className="size-3.5" />
                Cancel all
              </Button>
            ) : null}
          </CardHeader>
          {queued.length ? (
            <CardBody className="max-h-[420px] overflow-auto p-0">
              <ol className="divide-y divide-[var(--border)]">
                {queued.map((job, index) => {
                  const later = ts(job.runAfter) - now;
                  const blockedBy = job.dependsOn.filter((id) => {
                    const dep = jobs.find((j) => j.id === id);
                    return dep && dep.status !== "succeeded";
                  }).length;
                  const why =
                    later > 1_000
                      ? `retrying in ${formatElapsed(Math.round(later / 1000))}${job.error ? ` — ${job.error}` : ""}`
                      : blockedBy
                        ? `after ${blockedBy} earlier step${blockedBy > 1 ? "s" : ""}`
                        : null;
                  return (
                    <li key={job.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="text-ink-muted tnum w-5 pt-0.5 text-right text-xs">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        {title(job)}
                        <p className="text-ink-muted text-xs break-words">
                          {[meta(job), why].filter(Boolean).join(" · ") ||
                            `queued ${formatDateTime(new Date(job.createdAt))}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act(job.id, "cancel")}
                        loading={busy === job.id + "cancel"}
                        aria-label="Cancel"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          ) : (
            <EmptyState
              icon={Clock}
              title="Queue is empty"
              description="Adding an application queues its analysis, prep and handbook here."
              compact
            />
          )}
        </Card>
      </div>

      {byKind.length ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>By kind</CardTitle>
              <CardDescription>
                Finished jobs from the last 30 days. Durations are for the ones that
                succeeded.
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-ink-muted text-left text-xs">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 text-right font-medium">Runs</th>
                  <th className="px-3 py-2 text-right font-medium">Succeeded</th>
                  <th className="px-3 py-2 text-right font-medium">Failed</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Needed a retry
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Typical</th>
                  <th className="px-4 py-2 text-right font-medium">Longest</th>
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-[var(--border)]">
                {byKind.map((r) => (
                  <tr key={r.kind}>
                    <td className="text-ink px-4 py-2">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => setKind(r.kind)}
                      >
                        {KIND_LABEL[r.kind]}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">{r.runs}</td>
                    <td className="px-3 py-2 text-right">
                      {Math.round((r.succeeded / r.runs) * 100)}%
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      style={r.failed ? { color: "var(--critical)" } : undefined}
                    >
                      {r.failed}
                    </td>
                    <td className="px-3 py-2 text-right">{r.retried}</td>
                    <td className="px-3 py-2 text-right">
                      {r.median === null ? "—" : formatElapsed(r.median)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.longest === null ? "—" : formatElapsed(r.longest)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>History</CardTitle>
            <CardDescription>
              {history.length} of {finished.length} finished jobs. Cleared after 30
              days.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {failedCount ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => bulk("retry-failed")}
                loading={busy === "retry-failed"}
              >
                <RotateCcw className="size-3.5" />
                Retry all failed
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={load} aria-label="Refresh">
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </CardHeader>
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-4 pb-3">
          {(["all", "failed", "succeeded", "cancelled"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? "secondary" : "ghost"}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
            >
              {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
            </Button>
          ))}
          <Select
            value={kind}
            onValueChange={(v) => setKind(v as typeof kind)}
            options={[
              { value: "all", label: "Every kind" },
              ...kinds.map((k) => ({ value: k, label: KIND_LABEL[k] })),
            ]}
            ariaLabel="Kind"
            className="h-8 w-44 text-xs"
          />
          <Select
            value={app}
            onValueChange={setApp}
            options={[{ value: "all", label: "Every application" }, ...appOptions]}
            ariaLabel="Application"
            className="h-8 w-56 text-xs"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search label or error…"
            aria-label="Search"
            className="h-8 w-52 text-xs"
          />
        </div>
        {history.length ? (
          <CardBody className="p-0">
            <ul className="divide-y divide-[var(--border)]">
              {history.slice(0, 200).map((job) => {
                const seconds = elapsedSeconds(job);
                return (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-xs"
                  >
                    <Badge tint={TINT[job.status]}>{job.status}</Badge>
                    <div className="min-w-0 flex-1">
                      {title(job)}
                      <p className="text-ink-muted">
                        {formatDateTime(new Date(job.finishedAt ?? job.updatedAt))}
                        {seconds !== null
                          ? ` · took ${formatElapsed(seconds)}`
                          : ""}
                        {meta(job) ? ` · ${meta(job)}` : ""}
                      </p>
                      {job.error && job.status !== "succeeded" ? (
                        <p className="text-ink-2 mt-1 leading-relaxed break-words">
                          {job.error}
                        </p>
                      ) : null}
                    </div>
                    {(job.status === "failed" || job.status === "cancelled") &&
                    job.lane === "background" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act(job.id, "retry")}
                        loading={busy === job.id + "retry"}
                      >
                        <RotateCcw className="size-3.5" />
                        Retry
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing matches"
            description="Change the filters above, or wait for a job to finish."
            compact
          />
        )}
      </Card>
    </div>
  );
}
