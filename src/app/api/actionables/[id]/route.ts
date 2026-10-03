import { ACTIONABLE_STATUSES, type ActionableStatus } from "@/db/schema";
import { asDate, badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import {
  deleteActionable,
  setActionableStatus,
  updateActionable,
} from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);

    // A status-only change goes through the dedicated path so completedAt stays
    // consistent with the status.
    if ("status" in body && Object.keys(body).length === 1) {
      const status = body.status as ActionableStatus;
      if (!ACTIONABLE_STATUSES.includes(status)) {
        return badRequest(`Unknown status: ${String(body.status)}`);
      }
      const actionable = setActionableStatus(id, status);
      if (!actionable) return notFound("Actionable not found.");
      return ok({ actionable });
    }

    const patch: Record<string, unknown> = {};
    for (const key of [
      "title",
      "detail",
      "rationale",
      "pattern",
      "url",
      "difficulty",
      "tags",
    ]) {
      if (key in body) patch[key] = body[key];
    }
    if ("estMinutes" in body) patch.estMinutes = Number(body.estMinutes);
    if ("priority" in body) patch.priority = Number(body.priority);
    if ("dueAt" in body) patch.dueAt = asDate(body.dueAt);
    if ("status" in body) patch.status = body.status;

    const actionable = updateActionable(id, patch);
    if (!actionable) return notFound("Actionable not found.");
    return ok({ actionable });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    deleteActionable(id);
    return ok({ deleted: true });
  } catch (error) {
    return failed(error);
  }
}
