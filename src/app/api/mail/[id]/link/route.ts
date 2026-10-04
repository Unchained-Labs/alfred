import { APPLICATION_STAGES, type ApplicationStage } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { applicationFromMail, linkMailToApplication } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{
      applicationId?: string;
      createNew?: boolean;
      advanceToStage?: string;
    }>(request);

    if (body.createNew) {
      const application = applicationFromMail(user.id, id);
      if (!application) {
        return badRequest(
          "Alfred could not tell which company this is from. Add the application manually.",
        );
      }
      return ok({ application }, 201);
    }

    if (!body.applicationId) return badRequest("Pick an application to link to.");

    const stage = body.advanceToStage as ApplicationStage | undefined;
    if (stage && !APPLICATION_STAGES.includes(stage)) {
      return badRequest(`Unknown stage: ${body.advanceToStage}`);
    }

    const mail = linkMailToApplication(user.id, id, body.applicationId, {
      advanceToStage: stage,
    });
    if (!mail) return notFound("Email not found.");
    return ok({ mail });
  } catch (error) {
    return failed(error);
  }
}
