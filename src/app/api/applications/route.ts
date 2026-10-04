import type { ApplicationStage } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { badRequest, failed, ok, readJson } from "@/lib/api";
import { createApplication } from "@/lib/mutations";
import { listApplications } from "@/lib/queries";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ applications: listApplications(user.id) });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const company = String(body.company ?? "").trim();
    const title = String(body.title ?? "").trim();
    if (!company || !title) return badRequest("Company and title are required.");

    const application = createApplication(user.id, {
      company,
      title,
      description: (body.description as string) ?? null,
      location: (body.location as string) ?? null,
      workMode: (body.workMode as string) ?? null,
      seniority: (body.seniority as string) ?? null,
      salaryMin: (body.salaryMin as number) ?? null,
      salaryMax: (body.salaryMax as number) ?? null,
      currency: (body.currency as string) ?? "USD",
      jobUrl: (body.jobUrl as string) ?? null,
      stage: (body.stage as ApplicationStage) ?? "wishlist",
      priority: Number(body.priority ?? 2),
      tags: (body.tags as string[]) ?? [],
      notes: (body.notes as string) ?? null,
      source: (body.source as string) ?? "manual",
    });

    return ok({ application }, 201);
  } catch (error) {
    return failed(error);
  }
}
