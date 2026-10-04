import { APPLICATION_STAGES, type ApplicationStage } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { moveApplication } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ stage?: string; boardOrder?: number }>(request);
    const stage = body.stage as ApplicationStage;

    if (!stage || !APPLICATION_STAGES.includes(stage)) {
      return badRequest(`Unknown stage: ${String(body.stage)}`);
    }

    const application = moveApplication(user.id, id, stage, body.boardOrder);
    if (!application) return notFound("Application not found.");
    return ok({ application });
  } catch (error) {
    return failed(error);
  }
}
