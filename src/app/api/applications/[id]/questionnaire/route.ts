import { generateQuestionnaire } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { failed, notFound, ok, readJson } from "@/lib/api";
import { saveQuestionnaire } from "@/lib/mutations";
import { getApplication, getLatestAnalysis, listQuestions } from "@/lib/queries";
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

    const { result, provider, model } = await generateQuestionnaire(
      user.id,
      application,
      getLatestAnalysis(user.id, id),
      count,
    );
    saveQuestionnaire(user.id, id, result, provider, model);

    return ok({ questions: listQuestions(user.id, id) });
  } catch (error) {
    return failed(error);
  }
}
