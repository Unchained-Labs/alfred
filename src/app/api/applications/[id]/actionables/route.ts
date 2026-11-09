import { requireUser } from "@/lib/auth";
import { failed, notFound, ok } from "@/lib/api";
import { submit } from "@/lib/jobs/worker";
import { getApplication } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

/** Queues a new prep plan. It replaces only untouched AI suggestions. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const application = getApplication(user.id, id);
    if (!application) return notFound("Application not found.");

    const job = submit({
      userId: user.id,
      applicationId: id,
      kind: "actionables",
      dedupeKey: `actionables:${id}`,
      label: "Prep plan",
      priority: 4,
    });
    return ok({ job }, 202);
  } catch (error) {
    return failed(error);
  }
}
