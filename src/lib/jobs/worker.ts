import type { AiJob, AiJobKind, AiJobLane } from "@/db/schema";
import { AiError, AiNotConfiguredError } from "@/lib/ai/types";
import { ConfigError, InputError, NotEarnedError } from "@/lib/errors";
import {
  claim,
  enqueue,
  type EnqueueInput,
  fail,
  pruneFinished,
  requeueInterrupted,
  succeed,
} from "./queue";
import { JobStopped, jobScope } from "./scope";

/*
 * The worker: claims jobs and runs them, a bounded number at a time.
 *
 * One process, two lanes. `background` is everything a person did not wait
 * for — the pipeline queued when an application is created, a handbook's dozen
 * steps — and runs ALFRED_AI_CONCURRENCY at a time (default 1: the claude-code
 * provider spawns a whole CLI per call, and this has to share a small machine).
 * `interactive` is a request held open for an answer — parse this posting,
 * grade this answer — and has its own slot, so it never waits behind a
 * background pipeline.
 */

/** A failure no retry can fix. Thrown by handlers for missing inputs. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export type JobContext = {
  /** Queue follow-up work — a handbook outline queues its parts. */
  enqueue: (input: EnqueueInput) => AiJob;
};

export type JobHandler = (job: AiJob, ctx: JobContext) => Promise<unknown>;
export type HandlerMap = Partial<Record<AiJobKind, JobHandler>>;

/**
 * Credentials that stopped working. Retrying spends attempts on a certainty:
 * the next call fails the same way until someone signs in again.
 */
const SIGNED_OUT =
  /not logged in|failed to authenticate|oauth session expired|could not be refreshed|invalid api key|rejected the api key|authentication_error|\b401\b/i;

/** Sorts a thrown error into what the queue records and whether to retry. */
export function classify(error: unknown): { message: string; permanent: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  if (SIGNED_OUT.test(message)) {
    return {
      message: `The AI provider is signed out or its credentials expired — ${message.slice(0, 300)}. Sign in again (for Claude Code: run \`claude\` and /login), then retry.`,
      permanent: true,
    };
  }
  // A job that ran to its ceiling would most likely do so again, and one that
  // was stopped was stopped on purpose: neither goes round on its own. Retry
  // is a button.
  if (error instanceof JobTimeout || error instanceof JobStopped) {
    return { message, permanent: true };
  }
  if (
    error instanceof PermanentJobError ||
    error instanceof AiNotConfiguredError ||
    error instanceof ConfigError ||
    error instanceof InputError ||
    error instanceof NotEarnedError
  ) {
    return { message, permanent: true };
  }
  // Everything else — a CLI that exited non-zero, a timeout, JSON that did not
  // parse or match the schema, a dropped connection — is worth another go.
  return { message, permanent: false };
}

const intFromEnv = (name: string, fallback: number, min = 1) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
};

export const LIMITS: Record<AiJobLane, number> = {
  background: intFromEnv("ALFRED_AI_CONCURRENCY", 1),
  interactive: intFromEnv("ALFRED_AI_INTERACTIVE_CONCURRENCY", 1),
};

/**
 * How long a background job runs before it asks whether to keep going. It
 * does not stop there: it keeps working while it waits for an answer, and
 * "Keep going" gives it this long again before the next question. This used
 * to be the provider's hard per-call timeout, which killed long handbook
 * steps at five minutes and retried them, identically, twice more.
 */
export const CHECK_IN_MS = intFromEnv("ALFRED_AI_CHECK_IN_MS", 5 * 60_000, 10_000);

/**
 * The ceiling, per job: past it the job is stopped whether or not anyone
 * answered. Every provider call inside the job gets the time remaining.
 */
export const JOB_TIMEOUT_MS = intFromEnv(
  "ALFRED_AI_JOB_TIMEOUT_MS",
  30 * 60_000,
  10_000,
);

/**
 * Interactive jobs hold an HTTP request open, so they keep the short ceiling
 * the provider used to impose on everything.
 */
export const INTERACTIVE_TIMEOUT_MS = intFromEnv(
  "ALFRED_AI_INTERACTIVE_TIMEOUT_MS",
  5 * 60_000,
  10_000,
);

class JobTimeout extends AiError {
  constructor(ms: number) {
    super(
      `Still not done after ${Math.round(ms / 60_000)} minutes, so Alfred stopped it. Retry starts it again from the beginning.`,
      undefined,
      true,
    );
  }
}

type Waiter = { resolve: (job: AiJob) => void; reject: (error: unknown) => void };

/** Process-wide state, on globalThis so dev-mode module reloads share one worker. */
type WorkerState = {
  started: boolean;
  handlers: HandlerMap;
  running: Record<AiJobLane, number>;
  timer: ReturnType<typeof setInterval> | null;
  waiters: Map<string, Waiter[]>;
  /** Closures for interactive jobs: they live with the request, not the DB. */
  inline: Map<string, () => Promise<unknown>>;
  /** One per running job: Stop aborts it, which kills the provider call. */
  controllers: Map<string, AbortController>;
  pumping: boolean;
};

const g = globalThis as unknown as { __alfredAiWorker?: WorkerState };
const state: WorkerState = (g.__alfredAiWorker ??= {
  started: false,
  handlers: {},
  running: { background: 0, interactive: 0 },
  timer: null,
  waiters: new Map(),
  inline: new Map(),
  controllers: new Map(),
  pumping: false,
});
// A worker state from before this field existed (dev reloads) lacks it.
state.controllers ??= new Map();

function settle(job: AiJob | undefined, error?: unknown) {
  if (!job) return;
  const waiting = state.waiters.get(job.id);
  if (!waiting) return;
  if (job.status === "queued" || job.status === "running") return; // retrying
  state.waiters.delete(job.id);
  for (const w of waiting) {
    if (job.status === "succeeded") w.resolve(job);
    else w.reject(error ?? new AiError(job.error ?? `Job ${job.status}.`));
  }
}

const ctx: JobContext = {
  enqueue: (input) => {
    const job = enqueue(input);
    queueMicrotask(wake);
    return job;
  },
};

async function execute(job: AiJob, handlers: HandlerMap) {
  const inline = state.inline.get(job.id);
  const handler = inline ? () => inline() : handlers[job.kind];

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit =
    job.lane === "interactive" ? INTERACTIVE_TIMEOUT_MS : JOB_TIMEOUT_MS;
  const controller = new AbortController();
  state.controllers.set(job.id, controller);
  try {
    if (!handler) {
      throw new PermanentJobError(
        job.lane === "interactive"
          ? "The request that asked for this is gone. Try again."
          : `No handler for ${job.kind}.`,
      );
    }
    const scope = {
      jobId: job.id,
      deadline: Date.now() + limit,
      signal: controller.signal,
    };
    const result = await Promise.race([
      jobScope.run(scope, () => (handler as JobHandler)(job, ctx)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new JobTimeout(limit));
          controller.abort(); // and end the call still running inside it
        }, limit);
      }),
      // Stop rejects at once, whatever the handler is waiting on.
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new JobStopped()),
          { once: true },
        );
      }),
    ]);
    const done = succeed(job.id, result ?? null);
    if (done) state.inline.delete(job.id);
    settle(done);
  } catch (error) {
    const { message, permanent } = classify(error);
    if (!permanent)
      console.warn(
        `[alfred] job ${job.kind} attempt ${job.attempts} failed: ${message}`,
      );
    const after = fail(job.id, message, { permanent });
    if (after && after.status !== "queued") state.inline.delete(job.id);
    settle(after, error);
  } finally {
    clearTimeout(timer);
    state.controllers.delete(job.id);
  }
}

/**
 * Ends a running job's provider call — the CLI process is killed, the HTTP
 * request aborted. The caller marks the job cancelled first, so the failure
 * this causes is recorded against a job that is no longer running and changes
 * nothing.
 */
export function stop(id: string): boolean {
  const controller = state.controllers.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
}

/**
 * Fills every free slot. Exported for tests, which pass their own handlers and
 * await the returned promise instead of a timer.
 */
export async function pump(handlers: HandlerMap = state.handlers): Promise<void> {
  const inflight: Promise<void>[] = [];
  for (const lane of ["interactive", "background"] as AiJobLane[]) {
    while (state.running[lane] < LIMITS[lane]) {
      const job = claim(lane, new Date(), CHECK_IN_MS);
      if (!job) break;
      state.running[lane]++;
      inflight.push(
        execute(job, handlers).finally(() => {
          state.running[lane]--;
          // A finished job frees a slot and may unblock its dependents.
          queueMicrotask(wake);
        }),
      );
    }
  }
  await Promise.all(inflight);
}

/** Runs the queue now instead of at the next tick. Cheap; call it after enqueue. */
export function wake() {
  if (!state.started) return;
  void pump().catch((error) => console.error("[alfred] job worker:", error));
}

/**
 * Starts the worker once per process. Called from instrumentation.ts; safe to
 * call again. The tick catches backoffs coming due — everything else wakes it
 * directly.
 */
export function startWorker(handlers: HandlerMap) {
  state.handlers = handlers;
  if (state.started) return;
  state.started = true;
  const interrupted = requeueInterrupted();
  if (interrupted)
    console.log(
      `[alfred] requeued ${interrupted} AI job(s) interrupted by a restart`,
    );
  pruneFinished();
  state.timer = setInterval(wake, 5_000);
  state.timer.unref?.();
  console.log(
    `[alfred] AI job worker on — background ×${LIMITS.background}, interactive ×${LIMITS.interactive}`,
  );
  wake();
}

/** Queues a background job and nudges the worker. What API routes call. */
export function submit(input: EnqueueInput): AiJob {
  return ctx.enqueue(input);
}

/** Resolves when the job succeeds; rejects with its error when it is finally given up on. */
export function awaitJob(job: AiJob): Promise<AiJob> {
  return new Promise((resolve, reject) => {
    const list = state.waiters.get(job.id) ?? [];
    list.push({ resolve, reject });
    state.waiters.set(job.id, list);
  });
}

/**
 * Runs `fn` through the interactive lane and waits for it: same concurrency
 * limit, same retry policy, same record in the queue view as everything else,
 * but the result comes straight back to the caller.
 *
 * The closure is kept in memory, not the database. If the process restarts,
 * the request waiting for it is gone too, so there is nothing to resume.
 */
export async function runInteractive<T>(
  meta: {
    userId: string;
    kind: AiJobKind;
    applicationId?: string | null;
    label?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  if (!state.started) return fn(); // scripts and tests: no worker, just run it
  let value: T | undefined;
  const job = enqueue({
    ...meta,
    lane: "interactive",
    priority: 0,
    maxAttempts: 2,
  });
  state.inline.set(job.id, async () => {
    value = await fn();
    return null;
  });
  const done = awaitJob(job);
  wake();
  await done;
  return value as T;
}
