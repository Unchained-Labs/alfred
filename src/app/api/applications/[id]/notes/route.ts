import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { addNote } from "@/lib/mutations";
import { getApplication, listEvents } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!getApplication(id)) return notFound("Application not found.");

    const { body } = await readJson<{ body?: string }>(request);
    if (!body?.trim()) return badRequest("A note needs some text.");

    addNote(id, body.trim());
    return ok({ events: listEvents(id) }, 201);
  } catch (error) {
    return failed(error);
  }
}
