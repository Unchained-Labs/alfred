import { failed, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listJobs, queueDepth } from "@/lib/jobs/queue";

/**
 * Recent AI jobs, newest first. `?applicationId=` narrows to one application,
 * which is what the status strip on its page polls.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const applicationId = url.searchParams.get("applicationId") ?? undefined;
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
    );
    return ok({
      jobs: listJobs(user.id, { applicationId, limit }),
      depth: queueDepth(user.id),
    });
  } catch (error) {
    return failed(error);
  }
}
