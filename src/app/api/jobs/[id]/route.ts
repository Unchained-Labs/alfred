import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancel, getJob, keepGoing, retry } from "@/lib/jobs/queue";
import { CHECK_IN_MS, stop, wake } from "@/lib/jobs/worker";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const job = getJob(user.id, id);
    if (!job) return notFound("Job not found.");
    return ok({ job });
  } catch (error) {
    return failed(error);
  }
}

/**
 * `{ action }`:
 * - `retry`: a failed or cancelled job goes back in the queue.
 * - `cancel`: a queued job is dropped; a running one is stopped, its provider
 *   call killed, not left to finish into a job nobody wants.
 * - `continue`: a running job past its check-in gets another period.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action } = await readJson<{ action?: string }>(request);
    const job = getJob(user.id, id);
    if (!job) return notFound("Job not found.");

    if (action === "cancel") {
      const wasRunning = job.status === "running";
      const cancelled = cancel(user.id, id);
      if (wasRunning) stop(id);
      wake(); // its slot is free
      return ok({ job: cancelled });
    }
    if (action === "continue") {
      return ok({ job: keepGoing(user.id, id, CHECK_IN_MS) });
    }
    if (action === "retry") {
      const retried = retry(user.id, id);
      wake();
      return ok({ job: retried });
    }
    return badRequest(`Unknown action: ${String(action)}`);
  } catch (error) {
    return failed(error);
  }
}
