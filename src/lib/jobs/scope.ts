import { AsyncLocalStorage } from "node:async_hooks";

/*
 * What a provider call needs to know about the job it runs inside, without
 * every handler passing it down: when the job must be done by, and a signal
 * that fires when someone presses Stop.
 *
 * A provider called outside a job (a connection test, a script) sees no scope
 * and falls back to its own timeout.
 */
export type JobScope = {
  jobId: string;
  /** Epoch ms. The provider kills its call at this point, not before. */
  deadline: number;
  signal: AbortSignal;
};

export const jobScope = new AsyncLocalStorage<JobScope>();

/** Thrown into a provider call when its job is stopped. */
export class JobStopped extends Error {
  constructor(message = "Stopped.") {
    super(message);
    this.name = "JobStopped";
  }
}
