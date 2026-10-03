import { generateActionables } from "@/lib/ai";
import { failed, notFound, ok } from "@/lib/api";
import { saveActionables } from "@/lib/mutations";
import { getApplication, getLatestAnalysis, listActionables } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const application = getApplication(id);
    if (!application) return notFound("Application not found.");

    const { result, provider, model } = await generateActionables(
      application,
      getLatestAnalysis(id),
    );
    saveActionables(id, result, provider, model);

    return ok({ overview: result.overview, actionables: listActionables(id) });
  } catch (error) {
    return failed(error);
  }
}
