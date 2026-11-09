import { failed, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { HANDBOOK_JOB_KINDS } from "@/lib/jobs/handlers";
import { cancelPendingFor } from "@/lib/jobs/queue";
import { submit } from "@/lib/jobs/worker";
import { listHandbookApplicationIds } from "@/lib/queries";

/**
 * Queues every handbook this account has for a rebuild.
 *
 * `mode: "rewrite"` regenerates each one from the outline down — new prose
 * written for the lab, new scenes, cells, problems and drills. `mode:
 * "upgrade"` keeps the text that is there and only adds what is missing,
 * which for a handbook written before labs existed means its scenes, cells
 * and problems. Either way it is ordinary queued work: the worker runs it
 * one job at a time, and the queue in Settings shows it.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ mode?: string }>(request);
    const rewrite = body.mode !== "upgrade";

    const ids = listHandbookApplicationIds(user.id);
    const jobs = ids.map((applicationId) => {
      if (rewrite)
        cancelPendingFor(user.id, applicationId, [...HANDBOOK_JOB_KINDS]);
      return submit({
        userId: user.id,
        applicationId,
        kind: "handbook_outline",
        payload: { regenerate: rewrite },
        dedupeKey: `handbook:${applicationId}`,
        label: rewrite
          ? "Rewrite the handbook"
          : "Add scenes and labs to the handbook",
        priority: 8,
      });
    });
    return ok({ handbooks: ids.length, jobs }, 202);
  } catch (error) {
    return failed(error);
  }
}
