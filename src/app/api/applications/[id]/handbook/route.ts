import { failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancelPendingFor } from "@/lib/jobs/queue";
import { submit } from "@/lib/jobs/worker";
import { deleteHandbook } from "@/lib/mutations";
import { getApplication, getHandbook } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

const HANDBOOK_KINDS = [
  "handbook_outline",
  "handbook_part",
  "handbook_drills",
] as const;

/*
 * A handbook is built in steps — outline, one job per part, then the drills —
 * because six taught parts do not fit in one response from the Claude Code
 * CLI, which clips its output silently. The steps used to be driven by the
 * browser, one request each, so closing the tab stopped the build halfway.
 * Now this queues the outline; its job queues the parts and the drills, and the
 * worker runs them whether or not anyone is watching.
 *
 * Without `regenerate`, an existing outline is kept and only its unwritten
 * steps are queued, so this is also how a half-built handbook gets finished.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ regenerate?: boolean }>(request);

    const app = getApplication(user.id, id);
    if (!app) return notFound("Application not found.");

    if (body.regenerate) cancelPendingFor(user.id, id, [...HANDBOOK_KINDS]);

    const job = submit({
      userId: user.id,
      applicationId: id,
      kind: "handbook_outline",
      payload: { regenerate: Boolean(body.regenerate) },
      dedupeKey: `handbook:${id}`,
      label:
        getHandbook(user.id, id) && !body.regenerate
          ? "Finish the handbook"
          : "Handbook outline",
      priority: 6,
    });
    return ok({ job }, 202);
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!getHandbook(user.id, id)) {
      return notFound("No handbook for this application.");
    }
    cancelPendingFor(user.id, id, [...HANDBOOK_KINDS]);
    deleteHandbook(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return failed(error);
  }
}
