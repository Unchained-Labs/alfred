"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { AiJob } from "@/db/schema";
import { useApplicationJobsContext } from "./jobs-context";

/*
 * Starting an AI generation now returns a queued job at once (202), and the
 * work happens on the server whether or not this tab stays open. This hook is
 * the browser's side of that: it starts a job, follows it by polling, and
 * refreshes the page's server data when it lands. Given a job that was already
 * pending when the page rendered, it picks that up instead — so a reload
 * mid-generation still shows it running.
 */

const POLL_MS = 2_500;

export const isPending = (job: Pick<AiJob, "status"> | null | undefined) =>
  job?.status === "queued" || job?.status === "running";

export async function fetchJob(id: string): Promise<AiJob | null> {
  const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  if (!response.ok) return null;
  return ((await response.json()) as { job: AiJob }).job;
}

export async function jobAction(
  id: string,
  action: "retry" | "cancel",
): Promise<AiJob | null> {
  const response = await fetch(`/api/jobs/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) return null;
  return ((await response.json()) as { job: AiJob }).job;
}

export function useQueuedJob(
  initial: AiJob | null | undefined,
  handlers: {
    onSucceeded?: (job: AiJob) => void;
    onFailed?: (job: AiJob) => void;
  } = {},
) {
  const router = useRouter();
  const shared = useApplicationJobsContext();
  const [job, setJob] = React.useState<AiJob | null>(
    initial && isPending(initial) ? initial : null,
  );
  const latest = React.useRef(handlers);
  React.useEffect(() => {
    latest.current = handlers;
  });

  const jobId = job?.id;
  const pending = isPending(job);
  React.useEffect(() => {
    if (!jobId || !pending) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const next = await fetchJob(jobId).catch(() => null);
      if (stopped || !next) return;
      setJob(next);
      if (isPending(next)) return;
      clearInterval(timer);
      if (next.status === "succeeded") {
        latest.current.onSucceeded?.(next);
        router.refresh();
      } else {
        latest.current.onFailed?.(next);
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId, pending, router]);

  /**
   * POSTs to a generation endpoint. Returns the response body: a `{ job }` is
   * followed until done; anything else (an existing exercise returned as-is,
   * say) is handed back for the caller to deal with.
   */
  const start = React.useCallback(
    async (url: string, body?: unknown): Promise<Record<string, unknown>> => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok)
        throw new Error((data.error as string) ?? "Could not start it.");
      if (data.job) {
        setJob(data.job as AiJob);
        // The page's status strip learns about it now, not when it finishes.
        shared?.refresh();
      }
      return data;
    },
    [shared],
  );

  const retry = React.useCallback(async () => {
    if (!job) return;
    const next = await jobAction(job.id, "retry");
    if (next) setJob(next);
  }, [job]);

  return { job, busy: pending, start, retry };
}

/**
 * Every recent job for one application, polled while any is pending. When the
 * last pending one settles the page's server data is refreshed, so results
 * written by the worker appear without a reload. Several jobs settling in turn
 * (a handbook's parts) refresh once each, which is what makes progress visible.
 */
export function useApplicationJobs(applicationId: string, initial: AiJob[]) {
  const router = useRouter();
  const [jobs, setJobs] = React.useState<AiJob[]>(initial);
  const [nudge, setNudge] = React.useState(0);

  // New server data (after a refresh, or a job started elsewhere on the page)
  // replaces what this hook last polled — adjusted during render, the way
  // React recommends for state derived from a changing prop.
  const [seen, setSeen] = React.useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setJobs(initial);
  }

  const anyPending = jobs.some(isPending);
  React.useEffect(() => {
    if (!anyPending && nudge === 0) return;
    let stopped = false;
    let lastFinished = jobs.filter((j) => !isPending(j)).length;
    const poll = async () => {
      const response = await fetch(
        `/api/jobs?applicationId=${applicationId}&limit=60`,
        {
          cache: "no-store",
        },
      ).catch(() => null);
      if (stopped || !response?.ok) return;
      const next = ((await response.json()) as { jobs: AiJob[] }).jobs;
      setJobs(next);
      const finished = next.filter((j) => !isPending(j)).length;
      if (finished !== lastFinished) router.refresh();
      lastFinished = finished;
      if (!next.some(isPending)) {
        clearInterval(timer);
        setNudge(0);
      }
    };
    const timer = setInterval(poll, POLL_MS);
    void poll();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // `jobs` is read once to seed the count; re-running on every poll would
    // restart the interval each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPending, nudge, applicationId, router]);

  /** Starts polling now — after something on the page queued a job. */
  const refresh = React.useCallback(() => setNudge((n) => n + 1), []);
  return { jobs, refresh };
}

/** "Queued", "Running", or "Retrying (attempt 2 of 3)" — what the spinner says. */
export function jobPhase(job: AiJob | null): string | null {
  if (!job || !isPending(job)) return null;
  if (job.status === "running")
    return job.attempts > 1
      ? `Retrying (attempt ${job.attempts} of ${job.maxAttempts})`
      : "Running";
  return job.error ? "Waiting to retry" : "Queued";
}
