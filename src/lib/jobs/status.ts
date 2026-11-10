import type { AiJob } from "@/db/schema";

/*
 * Reads of a job's state that the browser needs too — no database here, so a
 * client component can import it. Polled JSON carries dates as ISO strings,
 * hence the `new Date()` around each.
 */

type Timed = Pick<AiJob, "status" | "checkInAt">;

/** Running past its check-in: still working, and asking whether it should. */
export function isWaitingOnYou(job: Timed, now = Date.now()): boolean {
  return (
    job.status === "running" &&
    job.checkInAt !== null &&
    new Date(job.checkInAt).getTime() <= now
  );
}

/** Seconds since a job started, to now or to when it finished. */
export function elapsedSeconds(
  job: Pick<AiJob, "startedAt" | "finishedAt">,
  now = Date.now(),
): number | null {
  if (!job.startedAt) return null;
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(job.startedAt).getTime()) / 1000));
}

/** "42s", "6m 05s", "1h 02m". */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
