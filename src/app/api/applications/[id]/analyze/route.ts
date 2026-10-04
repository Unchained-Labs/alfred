import { analyzeJob } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { failed, notFound, ok } from "@/lib/api";
import { saveAnalysis } from "@/lib/mutations";
import { getApplication } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const application = getApplication(user.id, id);
    if (!application) return notFound("Application not found.");

    const { result, provider, model } = await analyzeJob(user.id, application);
    const analysis = saveAnalysis(user.id, id, result, provider, model);
    return ok({ analysis });
  } catch (error) {
    return failed(error);
  }
}
