"use client";

import { AlertTriangle, Check, Clock, Loader2, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { AiJob, AiJobKind } from "@/db/schema";
import { cn } from "@/lib/utils";
import { ApplicationJobsContext, useApplicationJobsContext } from "./jobs-context";
import { isPending, jobAction, useApplicationJobs } from "./use-queued-job";

export { useApplicationJobsContext };

/*
 * One poller per application page, shared by the status strip and by the
 * panels that need to know about jobs they did not start themselves (the
 * handbook's parts are queued by its outline job, not by a click).
 */

export function ApplicationJobsProvider({
  applicationId,
  initialJobs,
  children,
}: {
  applicationId: string;
  initialJobs: AiJob[];
  children: React.ReactNode;
}) {
  const value = useApplicationJobs(applicationId, initialJobs);
  return (
    <ApplicationJobsContext.Provider value={value}>
      {children}
    </ApplicationJobsContext.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * The strip
 * ------------------------------------------------------------------ */

const STEPS: { label: string; kinds: AiJobKind[] }[] = [
  { label: "Analysis", kinds: ["analysis"] },
  { label: "Prep plan", kinds: ["actionables"] },
  { label: "Questions", kinds: ["questionnaire"] },
  {
    label: "Handbook",
    kinds: ["handbook_outline", "handbook_part", "handbook_lab", "handbook_drills"],
  },
  { label: "Exercises", kinds: ["exercise"] },
];

type StepState = {
  label: string;
  status: "running" | "queued" | "failed" | "done";
  detail: string | null;
  failed: AiJob[];
};

/**
 * Collapses a step's jobs into one chip. Only the latest round counts: a
 * failure that a later run of the same step has since fixed is history, not
 * state.
 */
function stepState(label: string, jobs: AiJob[]): StepState | null {
  if (!jobs.length) return null;
  // Newest per dedupe key (or per id for unkeyed jobs).
  const latest = new Map<string, AiJob>();
  for (const job of jobs) {
    const key = job.dedupeKey ?? job.id;
    const seen = latest.get(key);
    if (!seen || seen.createdAt < job.createdAt) latest.set(key, job);
  }
  const current = [...latest.values()];
  const failed = current.filter((j) => j.status === "failed");
  const running = current.filter((j) => j.status === "running");
  const queued = current.filter((j) => j.status === "queued");
  const done = current.filter((j) => j.status === "succeeded");
  const total = current.filter((j) => j.status !== "cancelled").length;

  const progress = total > 1 ? ` ${done.length}/${total}` : "";
  if (running.length) {
    return {
      label,
      status: "running",
      detail: `${running[0].label ?? "running"}${progress}`,
      failed,
    };
  }
  if (queued.length) {
    const waiting = queued.some((j) => j.error) ? "waiting to retry" : "queued";
    return { label, status: "queued", detail: `${waiting}${progress}`, failed };
  }
  if (failed.length) {
    return { label, status: "failed", detail: failed[0].error, failed };
  }
  if (!done.length) return null;
  return {
    label,
    status: "done",
    detail: total > 1 ? `${done.length} done` : null,
    failed,
  };
}

const ICON = {
  running: Loader2,
  queued: Clock,
  failed: AlertTriangle,
  done: Check,
} as const;

const TINT = {
  running: "var(--brand)",
  queued: "var(--ink-muted)",
  failed: "var(--critical)",
  done: "var(--good)",
} as const;

/**
 * "Analysis ✓ · Prep plan running · Handbook queued 2/8" — what Alfred is
 * doing for this application, at a glance. Hidden once everything has settled
 * and nothing failed: a strip of green ticks is noise.
 */
export function GenerationStrip() {
  const ctx = useApplicationJobsContext();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  if (!ctx) return null;

  const steps = STEPS.map((s) =>
    stepState(
      s.label,
      ctx.jobs.filter((j) => s.kinds.includes(j.kind)),
    ),
  ).filter((s): s is StepState => Boolean(s));

  const active = steps.some((s) => s.status === "running" || s.status === "queued");
  const failures = steps.flatMap((s) => s.failed);
  if (!active && !failures.length) return null;

  async function act(action: "retry" | "cancel") {
    setBusy(true);
    try {
      const targets =
        action === "retry" ? failures : ctx!.jobs.filter((j) => isPending(j));
      await Promise.all(targets.map((j) => jobAction(j.id, action)));
      ctx!.refresh();
      toast.success(action === "retry" ? "Retrying" : "Cancelled");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="border-line bg-surface flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className="text-ink font-medium">Alfred is preparing:</span>
      {steps.map((s) => {
        const Icon = ICON[s.status];
        return (
          <span
            key={s.label}
            className="inline-flex max-w-full items-center gap-1.5"
            title={s.detail ?? undefined}
          >
            <Icon
              className={cn(
                "size-3.5 shrink-0",
                s.status === "running" && "animate-spin",
              )}
              style={{ color: TINT[s.status] }}
            />
            <span className="text-ink">{s.label}</span>
            {s.detail && s.status !== "failed" ? (
              <span className="text-ink-muted max-w-56 truncate">{s.detail}</span>
            ) : null}
            {s.status === "failed" ? (
              <span style={{ color: TINT.failed }}>failed</span>
            ) : null}
          </span>
        );
      })}
      <span className="ml-auto flex items-center gap-1">
        {failures.length ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => act("retry")}
            loading={busy}
          >
            <RotateCcw className="size-3.5" />
            Retry failed
          </Button>
        ) : null}
        {active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => act("cancel")}
            disabled={busy}
          >
            <X className="size-3.5" />
            Stop
          </Button>
        ) : null}
      </span>
      {failures[0]?.error ? (
        <p className="text-ink-muted w-full text-[11px] leading-relaxed">
          {failures[0].error}
        </p>
      ) : null}
    </div>
  );
}
