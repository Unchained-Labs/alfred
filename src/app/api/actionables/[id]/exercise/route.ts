import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exerciseKindFor } from "@/lib/exercises";
import { cancelByKey } from "@/lib/jobs/queue";
import { submit } from "@/lib/jobs/worker";
import { getActionable, getExerciseByActionable } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

/**
 * Queues an exercise for a prep item. The work — writing it, and for code,
 * running the generator's own solution against its own tests before anyone is
 * asked to solve it — is in lib/jobs/handlers.ts.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ regenerate?: boolean }>(request);

    const actionable = getActionable(user.id, id);
    if (!actionable) return notFound("Prep item not found.");

    if (!exerciseKindFor(actionable.kind)) {
      return badRequest(
        "This kind of prep item has nothing to check — mark it done when you have done it.",
      );
    }

    // Generation is slow and costs a provider call, so an existing exercise is
    // returned as-is unless the caller explicitly asks for a new one.
    const existing = getExerciseByActionable(user.id, id);
    if (existing && !body.regenerate)
      return ok({ exercise: existing, reused: true });

    if (!actionable.applicationId) {
      return badRequest(
        "This item is not attached to an application, so there is no role to tailor an exercise to.",
      );
    }

    // A pending automatic build for the same item would otherwise be returned
    // by dedupe — and it would not regenerate.
    if (body.regenerate) cancelByKey(user.id, `exercise:${id}`);
    const job = submit({
      userId: user.id,
      applicationId: actionable.applicationId,
      kind: "exercise",
      payload: { actionableId: id, regenerate: Boolean(body.regenerate) },
      dedupeKey: `exercise:${id}`,
      label: `Exercise: ${actionable.title}`,
      priority: 4,
    });
    return ok({ job }, 202);
  } catch (error) {
    return failed(error);
  }
}
