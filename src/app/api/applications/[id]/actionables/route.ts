import { generateActionables } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { failed, notFound, ok } from "@/lib/api";
import { saveActionables } from "@/lib/mutations";
import { getApplication, getLatestAnalysis, listActionables } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const application = getApplication(user.id, id);
    if (!application) return notFound("Application not found.");

    const { result, provider, model } = await generateActionables(
      user.id,
      application,
      getLatestAnalysis(user.id, id),
    );
    saveActionables(user.id, id, result, provider, model);

    return ok({
      overview: result.overview,
      actionables: listActionables(user.id, id),
    });
  } catch (error) {
    return failed(error);
  }
}
