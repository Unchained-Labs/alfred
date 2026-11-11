import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { badRequest, failed, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  cancel,
  jobIdsWithStatus,
  listJobs,
  queueDepth,
  retry,
} from "@/lib/jobs/queue";
import {
  CHECK_IN_MS,
  INTERACTIVE_TIMEOUT_MS,
  JOB_TIMEOUT_MS,
  LIMITS,
  wake,
} from "@/lib/jobs/worker";

/**
 * Recent AI jobs, newest first. `?applicationId=` narrows to one application,
 * which is what the status strip on its page polls. The queue page also reads
 * `applications` (to name each job's application) and `limits`.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const applicationId = url.searchParams.get("applicationId") ?? undefined;
    const limit = Math.min(
      500,
      Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
    );
    const jobs = listJobs(user.id, { applicationId, limit });

    const ids = [
      ...new Set(jobs.map((j) => j.applicationId).filter((id) => id !== null)),
    ];
    const named = ids.length
      ? db
          .select({
            id: applications.id,
            company: applications.company,
            title: applications.title,
            userId: applications.userId,
          })
          .from(applications)
          .where(inArray(applications.id, ids))
          .all()
          .filter((a) => a.userId === user.id)
      : [];

    return ok({
      jobs,
      depth: queueDepth(user.id),
      applications: Object.fromEntries(
        named.map((a) => [a.id, { company: a.company, title: a.title }]),
      ),
      limits: {
        checkInMs: CHECK_IN_MS,
        timeoutMs: JOB_TIMEOUT_MS,
        interactiveTimeoutMs: INTERACTIVE_TIMEOUT_MS,
        concurrency: LIMITS,
      },
      now: Date.now(),
    });
  } catch (error) {
    return failed(error);
  }
}

/**
 * Bulk actions from the queue page. `{ action: "retry-failed" }` puts every
 * failed background job back; `{ action: "cancel-queued" }` drops everything
 * waiting (running jobs are left to finish — stop those one at a time).
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { action } = await readJson<{ action?: string }>(request);

    if (action === "retry-failed") {
      const ids = jobIdsWithStatus(user.id, "failed", "background");
      for (const id of ids) retry(user.id, id);
      wake();
      return ok({ count: ids.length });
    }
    if (action === "cancel-queued") {
      const ids = jobIdsWithStatus(user.id, "queued");
      for (const id of ids) cancel(user.id, id);
      return ok({ count: ids.length });
    }
    return badRequest(`Unknown action: ${String(action)}`);
  } catch (error) {
    return failed(error);
  }
}
