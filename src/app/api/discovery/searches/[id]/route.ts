import { JOB_SOURCE_KINDS, type JobSourceKind } from "@/db/schema";
import { failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deleteJobSearch, updateJobSearch } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(request);

    const patch: Record<string, unknown> = {};
    if ("label" in body) patch.label = String(body.label ?? "").trim();
    if ("titleQuery" in body)
      patch.titleQuery = String(body.titleQuery ?? "").trim();
    if ("location" in body) {
      patch.location = String(body.location ?? "").trim() || null;
    }
    if ("remoteOnly" in body) patch.remoteOnly = Boolean(body.remoteOnly);
    if ("active" in body) patch.active = Boolean(body.active);
    if ("minSalary" in body) {
      const value = Number(body.minSalary);
      patch.minSalary = Number.isFinite(value) && value > 0 ? value : null;
    }
    if (Array.isArray(body.sources)) {
      patch.sources = (body.sources as string[]).filter((s): s is JobSourceKind =>
        JOB_SOURCE_KINDS.includes(s as JobSourceKind),
      );
    }

    const search = updateJobSearch(user.id, id, patch);
    if (!search) return notFound("Search not found.");
    return ok({ search });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = deleteJobSearch(user.id, id);
    if (result.changes === 0) return notFound("Search not found.");
    return ok({ deleted: true });
  } catch (error) {
    return failed(error);
  }
}
