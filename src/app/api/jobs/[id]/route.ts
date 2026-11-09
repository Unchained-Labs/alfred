import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancel, getJob, retry } from "@/lib/jobs/queue";
import { wake } from "@/lib/jobs/worker";

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

/** `{ action: "retry" }` or `{ action: "cancel" }`. */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action } = await readJson<{ action?: string }>(request);
    if (!getJob(user.id, id)) return notFound("Job not found.");

    if (action === "cancel") return ok({ job: cancel(user.id, id) });
    if (action === "retry") {
      const job = retry(user.id, id);
      wake();
      return ok({ job });
    }
    return badRequest(`Unknown action: ${String(action)}`);
  } catch (error) {
    return failed(error);
  }
}
