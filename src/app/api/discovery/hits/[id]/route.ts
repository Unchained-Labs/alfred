import { JOB_HIT_STATUSES, type JobHitStatus } from "@/db/schema";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { saveJobHitAsApplication, setJobHitStatus } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

/**
 * Acts on a discovered posting.
 *
 * `{ save: true }` is the interesting one: it creates the tracked application
 * and links the hit to it, rather than just flipping a flag. The hit is kept —
 * it records where the job came from, and deleting it would let the next run
 * rediscover the same posting as new.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ status?: string; save?: boolean }>(request);

    if (body.save) {
      const result = saveJobHitAsApplication(user.id, id);
      if (!result) return notFound("That posting is not on your list.");
      return ok({
        application: result.application,
        created: result.created,
      });
    }

    const status = body.status as JobHitStatus;
    if (!JOB_HIT_STATUSES.includes(status)) {
      return badRequest(`Unknown status: ${String(body.status)}`);
    }
    const hit = setJobHitStatus(user.id, id, status);
    if (!hit) return notFound("That posting is not on your list.");
    return ok({ hit });
  } catch (error) {
    return failed(error);
  }
}
