import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  type AiJob,
  type AiJobKind,
  type AiJobLane,
  type AiJobStatus,
  aiJobs,
} from "@/db/schema";

/*
 * The queue's bookkeeping, and nothing else: no provider, no handler, no
 * timer. Everything here is a synchronous SQLite statement, which is what makes
 * it testable against a scratch database (scripts/check-queue.ts) and what
 * makes a claim atomic — better-sqlite3 runs one statement at a time, and the
 * claim runs inside an IMMEDIATE transaction besides.
 *
 * Statuses move one way, with two exceptions that are both a person's choice:
 *
 *   queued ──claim──▶ running ──▶ succeeded
 *      ▲                 │
 *      └──transient──────┤ (attempts left: back to queued, later)
 *                        └──▶ failed     ──retry──▶ queued
 *   queued/running ──cancel──▶ cancelled ──retry──▶ queued
 */

export const PENDING: AiJobStatus[] = ["queued", "running"];
export const TERMINAL: AiJobStatus[] = ["succeeded", "failed", "cancelled"];

export type EnqueueInput = {
  userId: string | null;
  kind: AiJobKind;
  applicationId?: string | null;
  lane?: AiJobLane;
  payload?: unknown;
  priority?: number;
  maxAttempts?: number;
  dependsOn?: string[];
  dedupeKey?: string | null;
  label?: string | null;
  runAfter?: Date;
};

function pendingByKey(key: string): AiJob | undefined {
  return db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.dedupeKey, key), inArray(aiJobs.status, PENDING)))
    .get();
}

/**
 * Queues a job, or returns the one already pending under the same dedupe key.
 *
 * The key is checked first and enforced again by a partial unique index, so a
 * double click that races itself still ends with one job: the loser's insert
 * fails and it returns the winner's row.
 */
export function enqueue(input: EnqueueInput): AiJob {
  if (input.dedupeKey) {
    const existing = pendingByKey(input.dedupeKey);
    if (existing) return existing;
  }
  try {
    return db
      .insert(aiJobs)
      .values({
        userId: input.userId,
        applicationId: input.applicationId ?? null,
        kind: input.kind,
        lane: input.lane ?? "background",
        payload: input.payload ?? null,
        priority: input.priority ?? 5,
        maxAttempts: input.maxAttempts ?? 3,
        dependsOn: input.dependsOn ?? [],
        dedupeKey: input.dedupeKey ?? null,
        label: input.label ?? null,
        runAfter: input.runAfter ?? new Date(),
      })
      .returning()
      .get();
  } catch (error) {
    const existing = input.dedupeKey ? pendingByKey(input.dedupeKey) : undefined;
    if (existing) return existing;
    throw error;
  }
}

/** Every job a cancelled one was holding up, transitively. */
function cancelDependents(rootId: string, now: Date) {
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const waiting = db
      .select({ id: aiJobs.id, dependsOn: aiJobs.dependsOn })
      .from(aiJobs)
      .where(eq(aiJobs.status, "queued"))
      .all()
      .filter((row) => row.dependsOn.includes(id));
    for (const row of waiting) {
      db.update(aiJobs)
        .set({
          status: "cancelled",
          error: "Cancelled: a step it needed was cancelled.",
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(aiJobs.id, row.id))
        .run();
      queue.push(row.id);
    }
  }
}

/**
 * Takes the next runnable job in a lane and marks it running.
 *
 * Runnable means queued, due, and every dependency succeeded. A job whose
 * dependency FAILED stays queued — retrying that dependency is how a person
 * unblocks it — while one whose dependency was CANCELLED is cancelled too,
 * because nothing will ever run the step it was waiting for.
 */
export function claim(
  lane: AiJobLane,
  now = new Date(),
  checkInMs: number | null = null,
): AiJob | null {
  const take = sqlite.transaction((): AiJob | null => {
    const candidates = db
      .select()
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.status, "queued"),
          eq(aiJobs.lane, lane),
          sql`${aiJobs.runAfter} <= ${now.getTime()}`,
        ),
      )
      .orderBy(aiJobs.priority, aiJobs.createdAt)
      .limit(100)
      .all();

    for (const job of candidates) {
      if (job.dependsOn.length) {
        const deps = db
          .select({ id: aiJobs.id, status: aiJobs.status })
          .from(aiJobs)
          .where(inArray(aiJobs.id, job.dependsOn))
          .all();
        if (deps.some((d) => d.status === "cancelled")) {
          db.update(aiJobs)
            .set({
              status: "cancelled",
              error: "Cancelled: a step it needed was cancelled.",
              finishedAt: now,
              updatedAt: now,
            })
            .where(eq(aiJobs.id, job.id))
            .run();
          cancelDependents(job.id, now);
          continue;
        }
        // A dependency that was deleted (its application went) counts as done:
        // the cascade removes this job too, so it is moot either way.
        if (deps.some((d) => d.status !== "succeeded")) continue;
      }

      const claimed = db
        .update(aiJobs)
        .set({
          status: "running",
          attempts: job.attempts + 1,
          startedAt: now,
          checkInAt:
            checkInMs && lane === "background"
              ? new Date(now.getTime() + checkInMs)
              : null,
          finishedAt: null,
          updatedAt: now,
        })
        .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, "queued")))
        .returning()
        .get();
      if (claimed) return claimed;
    }
    return null;
  });
  return take.immediate();
}

export function succeed(
  id: string,
  result: unknown,
  now = new Date(),
): AiJob | undefined {
  // Only a RUNNING job can succeed: one cancelled mid-flight stays cancelled,
  // whatever its handler eventually returned.
  return db
    .update(aiJobs)
    .set({
      status: "succeeded",
      result: result ?? null,
      error: null,
      permanent: false,
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(eq(aiJobs.id, id), eq(aiJobs.status, "running")))
    .returning()
    .get();
}

/** Exponential: 30s, 60s, 120s… capped at 15 minutes. Interactive: 2s flat. */
export function backoffMs(lane: AiJobLane, attempts: number): number {
  if (lane === "interactive") return 2_000;
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);
}

/**
 * Records a failure. A transient one with attempts left goes back to the queue
 * after a backoff; anything else is final until someone presses Retry.
 */
export function fail(
  id: string,
  message: string,
  options: { permanent: boolean },
  now = new Date(),
): AiJob | undefined {
  const job = db.select().from(aiJobs).where(eq(aiJobs.id, id)).get();
  if (!job || job.status !== "running") return job;

  const again = !options.permanent && job.attempts < job.maxAttempts;
  return db
    .update(aiJobs)
    .set(
      again
        ? {
            status: "queued",
            error: message,
            permanent: false,
            runAfter: new Date(now.getTime() + backoffMs(job.lane, job.attempts)),
            updatedAt: now,
          }
        : {
            status: "failed",
            error: message,
            permanent: options.permanent,
            finishedAt: now,
            updatedAt: now,
          },
    )
    .where(eq(aiJobs.id, id))
    .returning()
    .get();
}

/**
 * "Keep going": a running job past its check-in gets another period before it
 * asks again. Anything not running is returned untouched.
 */
export function keepGoing(
  userId: string,
  id: string,
  periodMs: number,
  now = new Date(),
): AiJob | undefined {
  const job = getJob(userId, id);
  if (!job || job.status !== "running") return job;
  return db
    .update(aiJobs)
    .set({ checkInAt: new Date(now.getTime() + periodMs), updatedAt: now })
    .where(and(eq(aiJobs.id, id), eq(aiJobs.status, "running")))
    .returning()
    .get();
}

/** Cancels a pending job and everything waiting on it. Finished jobs are left alone. */
export function cancel(
  userId: string,
  id: string,
  now = new Date(),
): AiJob | undefined {
  const job = getJob(userId, id);
  if (!job || !PENDING.includes(job.status)) return job;
  const cancelled = db
    .update(aiJobs)
    .set({
      status: "cancelled",
      error: "Cancelled.",
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(aiJobs.id, id))
    .returning()
    .get();
  cancelDependents(id, now);
  return cancelled;
}

/** Cancels the pending job under a dedupe key, if there is one. */
export function cancelByKey(userId: string, key: string, now = new Date()) {
  const job = pendingByKey(key);
  return job && job.userId === userId ? cancel(userId, job.id, now) : undefined;
}

/**
 * Cancels an application's pending jobs of the given kinds. Rebuilding a
 * handbook uses it: parts queued against the old outline would otherwise write
 * into the new one by index.
 */
export function cancelPendingFor(
  userId: string,
  applicationId: string,
  kinds: AiJobKind[],
  now = new Date(),
): number {
  const pending = db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.userId, userId),
        eq(aiJobs.applicationId, applicationId),
        inArray(aiJobs.kind, kinds),
        inArray(aiJobs.status, PENDING),
      ),
    )
    .all();
  for (const job of pending) cancel(userId, job.id, now);
  return pending.length;
}

/**
 * Puts a failed or cancelled job back in the queue with a fresh set of
 * attempts. Dependents that were cancelled with it come back too, so retrying
 * the outline of a cancelled handbook brings back its parts.
 */
export function retry(
  userId: string,
  id: string,
  now = new Date(),
): AiJob | undefined {
  const job = getJob(userId, id);
  if (
    !job ||
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "succeeded"
  ) {
    return job;
  }
  // A newer pending job with the same key already covers it.
  if (job.dedupeKey && pendingByKey(job.dedupeKey))
    return pendingByKey(job.dedupeKey);

  const revive = (target: string) =>
    db
      .update(aiJobs)
      .set({
        status: "queued",
        attempts: 0,
        error: null,
        permanent: false,
        runAfter: now,
        startedAt: null,
        finishedAt: null,
        updatedAt: now,
      })
      .where(eq(aiJobs.id, target))
      .returning()
      .get();

  const revived = revive(id);
  if (job.status === "cancelled") {
    const stack = [id];
    while (stack.length) {
      const parent = stack.pop()!;
      const children = db
        .select({ id: aiJobs.id, dependsOn: aiJobs.dependsOn })
        .from(aiJobs)
        .where(and(eq(aiJobs.status, "cancelled"), eq(aiJobs.userId, userId)))
        .all()
        .filter((row) => row.dependsOn.includes(parent));
      for (const child of children) {
        revive(child.id);
        stack.push(child.id);
      }
    }
  }
  return revived;
}

/**
 * Jobs left RUNNING belong to a process that is gone — a deploy, a crash, an
 * OOM kill. Put them back, counting the interrupted run as an attempt so a job
 * that reliably kills the process cannot loop forever.
 */
export function requeueInterrupted(now = new Date()): number {
  const stuck = db.select().from(aiJobs).where(eq(aiJobs.status, "running")).all();
  for (const job of stuck) {
    const again = job.lane === "background" && job.attempts < job.maxAttempts;
    db.update(aiJobs)
      .set(
        again
          ? {
              status: "queued",
              runAfter: now,
              error: "Interrupted by a restart; retrying.",
              updatedAt: now,
            }
          : {
              status: "failed",
              // Nobody is waiting for an interactive job after a restart: the
              // request that asked for it died with the process.
              error:
                job.lane === "interactive"
                  ? "Interrupted by a restart. Try again."
                  : "Interrupted by a restart, and out of attempts.",
              finishedAt: now,
              updatedAt: now,
            },
      )
      .where(eq(aiJobs.id, job.id))
      .run();
  }
  return stuck.length;
}

/** Finished jobs older than this are deleted: the queue is a log, not an archive. */
export function pruneFinished(olderThanDays = 30, now = new Date()): number {
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000);
  return db
    .delete(aiJobs)
    .where(and(inArray(aiJobs.status, TERMINAL), lt(aiJobs.updatedAt, cutoff)))
    .run().changes;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export function getJob(userId: string, id: string): AiJob | undefined {
  return db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.id, id), eq(aiJobs.userId, userId)))
    .get();
}

export function listJobs(
  userId: string,
  options: { applicationId?: string; limit?: number } = {},
): AiJob[] {
  return db
    .select()
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.userId, userId),
        options.applicationId
          ? eq(aiJobs.applicationId, options.applicationId)
          : undefined,
      ),
    )
    .orderBy(desc(aiJobs.createdAt))
    .limit(options.limit ?? 100)
    .all();
}

/** The pending job under a key, if it is this user's. */
export function pendingJob(userId: string, key: string): AiJob | null {
  const job = pendingByKey(key);
  return job && job.userId === userId ? job : null;
}

/** The newest pending job of a kind in a list — what a panel shows as running. */
export function pendingOf(jobs: AiJob[], kind: AiJobKind): AiJob | null {
  return jobs.find((j) => j.kind === kind && PENDING.includes(j.status)) ?? null;
}

/** How many jobs are waiting or running, per lane — for the queue header. */
export function queueDepth(userId: string) {
  const rows = db
    .select({ status: aiJobs.status, n: sql<number>`count(*)` })
    .from(aiJobs)
    .where(and(eq(aiJobs.userId, userId), inArray(aiJobs.status, PENDING)))
    .groupBy(aiJobs.status)
    .all();
  return {
    queued: rows.find((r) => r.status === "queued")?.n ?? 0,
    running: rows.find((r) => r.status === "running")?.n ?? 0,
  };
}

/** The ids of this user's jobs in a status, oldest first — for bulk actions. */
export function jobIdsWithStatus(
  userId: string,
  status: AiJobStatus,
  lane?: AiJobLane,
): string[] {
  return db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.userId, userId),
        eq(aiJobs.status, status),
        lane ? eq(aiJobs.lane, lane) : undefined,
      ),
    )
    .orderBy(aiJobs.createdAt)
    .all()
    .map((row) => row.id);
}
