import { requireUser } from "@/lib/auth";
import { failed, notFound, ok } from "@/lib/api";
import { submit } from "@/lib/jobs/worker";
import { getApplication } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

/**
 * Queues a fit analysis and returns the job at once; the panel polls it. A
 * second press while one is pending returns the same job rather than a second.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const application = getApplication(user.id, id);
    if (!application) return notFound("Application not found.");

    const job = submit({
      userId: user.id,
      applicationId: id,
      kind: "analysis",
      dedupeKey: `analysis:${id}`,
      label: "Fit analysis",
      priority: 3,
    });
    return ok({ job }, 202);
  } catch (error) {
    return failed(error);
  }
}
