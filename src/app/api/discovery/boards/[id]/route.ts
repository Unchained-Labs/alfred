import { failed, notFound, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deleteJobBoard } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = deleteJobBoard(user.id, id);
    if (result.changes === 0) return notFound("Board not found.");
    return ok({ deleted: true });
  } catch (error) {
    return failed(error);
  }
}
