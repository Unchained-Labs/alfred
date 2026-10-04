import type { ApplicationStage } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { asDate, failed, notFound, ok, readJson } from "@/lib/api";
import { deleteApplication, updateApplication } from "@/lib/mutations";
import {
  getApplication,
  getLatestAnalysis,
  listActionables,
  listEvents,
  listQuestions,
} from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const application = getApplication(user.id, id);
    if (!application) return notFound("Application not found.");

    return ok({
      application,
      analysis: getLatestAnalysis(user.id, id),
      actionables: listActionables(user.id, id),
      questions: listQuestions(user.id, id),
      events: listEvents(user.id, id),
    });
  } catch (error) {
    return failed(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);

    const patch: Record<string, unknown> = {};
    for (const key of [
      "company",
      "title",
      "description",
      "location",
      "workMode",
      "seniority",
      "salaryMin",
      "salaryMax",
      "currency",
      "jobUrl",
      "notes",
      "nextActionLabel",
      "contactName",
      "contactEmail",
      "tags",
      "archived",
    ]) {
      if (key in body) patch[key] = body[key];
    }
    if ("stage" in body) patch.stage = body.stage as ApplicationStage;
    if ("priority" in body) patch.priority = Number(body.priority);
    if ("appliedAt" in body) patch.appliedAt = asDate(body.appliedAt);
    if ("nextActionAt" in body) patch.nextActionAt = asDate(body.nextActionAt);

    const application = updateApplication(user.id, id, patch);
    if (!application) return notFound("Application not found.");
    return ok({ application });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = deleteApplication(user.id, id);
    // Scoped delete: zero rows means it is not theirs (or never existed), and
    // reporting success would imply otherwise.
    if (result.changes === 0) return notFound("Application not found.");
    return ok({ deleted: true });
  } catch (error) {
    return failed(error);
  }
}
