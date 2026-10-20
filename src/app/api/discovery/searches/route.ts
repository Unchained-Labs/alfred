import { JOB_SOURCE_KINDS, type JobSourceKind } from "@/db/schema";
import { badRequest, failed, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createJobSearch } from "@/lib/mutations";
import { listJobSearches } from "@/lib/queries";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ searches: listJobSearches(user.id) });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);

    const titleQuery = String(body.titleQuery ?? "").trim();
    if (!titleQuery) {
      return badRequest(
        "A search needs something to look for — a job title, or a few comma-separated titles.",
      );
    }

    const sources = Array.isArray(body.sources)
      ? (body.sources as string[]).filter((s): s is JobSourceKind =>
          JOB_SOURCE_KINDS.includes(s as JobSourceKind),
        )
      : [];
    if (!sources.length) {
      return badRequest("Pick at least one source for this search.");
    }

    const label = String(body.label ?? "").trim() || titleQuery;
    const minSalary =
      body.minSalary == null || body.minSalary === ""
        ? null
        : Number(body.minSalary);

    const search = createJobSearch(user.id, {
      label,
      titleQuery,
      location: String(body.location ?? "").trim() || null,
      remoteOnly: Boolean(body.remoteOnly),
      minSalary: Number.isFinite(minSalary) ? minSalary : null,
      sources,
      active: body.active === undefined ? true : Boolean(body.active),
    });
    return ok({ search }, 201);
  } catch (error) {
    return failed(error);
  }
}
