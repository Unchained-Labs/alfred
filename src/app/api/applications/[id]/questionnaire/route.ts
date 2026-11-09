import { requireUser } from "@/lib/auth";
import { failed, notFound, ok, readJson } from "@/lib/api";
import { submit } from "@/lib/jobs/worker";
import { getApplication } from "@/lib/queries";
import { clamp } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const application = getApplication(user.id, id);
    if (!application) return notFound("Application not found.");

    const body = await readJson<{ count?: number }>(request);
    const count = clamp(Number(body.count ?? 12), 5, 25);

    const job = submit({
      userId: user.id,
      applicationId: id,
      kind: "questionnaire",
      payload: { count },
      dedupeKey: `questionnaire:${id}`,
      label: "Interview questions",
      priority: 5,
    });
    return ok({ job }, 202);
  } catch (error) {
    return failed(error);
  }
}
