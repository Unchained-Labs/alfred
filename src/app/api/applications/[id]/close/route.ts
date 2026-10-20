import { type ApplicationStage, TERMINAL_STAGES } from "@/db/schema";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { closeApplication } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

/**
 * Closes an application.
 *
 * Its own route rather than a flag on `move`, because the three things that
 * happen here — recording the outcome, keeping what the company said, and
 * clearing the dead prep — belong to one decision the user makes once. Moving
 * between live stages stays on `move` and carries none of this.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{
      stage?: string;
      outcomeNote?: string;
      clearTasks?: boolean;
    }>(request);

    const stage = body.stage as ApplicationStage;
    if (!TERMINAL_STAGES.includes(stage)) {
      return badRequest(
        `Closing needs an outcome: ${TERMINAL_STAGES.join(", ")}. Use the move endpoint to change a live stage.`,
      );
    }

    const result = closeApplication(user.id, id, {
      stage,
      outcomeNote: body.outcomeNote,
      clearTasks: Boolean(body.clearTasks),
    });
    if (!result) return notFound("Application not found.");

    return ok({ application: result.application, cleared: result.cleared });
  } catch (error) {
    return failed(error);
  }
}
