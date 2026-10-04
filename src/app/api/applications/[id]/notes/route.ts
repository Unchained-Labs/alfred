import { requireUser } from "@/lib/auth";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { addNote } from "@/lib/mutations";
import { getApplication, listEvents } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!getApplication(user.id, id)) return notFound("Application not found.");

    const { body } = await readJson<{ body?: string }>(request);
    if (!body?.trim()) return badRequest("A note needs some text.");

    addNote(user.id, id, body.trim());
    return ok({ events: listEvents(user.id, id) }, 201);
  } catch (error) {
    return failed(error);
  }
}
