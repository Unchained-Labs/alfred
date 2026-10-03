import { analyzeJob } from "@/lib/ai";
import { failed, notFound, ok } from "@/lib/api";
import { saveAnalysis } from "@/lib/mutations";
import { getApplication } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const application = getApplication(id);
    if (!application) return notFound("Application not found.");

    const { result, provider, model } = await analyzeJob(application);
    const analysis = saveAnalysis(id, result, provider, model);
    return ok({ analysis });
  } catch (error) {
    return failed(error);
  }
}
