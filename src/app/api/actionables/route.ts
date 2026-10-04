import {
  ACTIONABLE_KINDS,
  type ActionableKind,
  DIFFICULTIES,
  type Difficulty,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { badRequest, asDate, failed, ok, readJson } from "@/lib/api";
import { createActionable } from "@/lib/mutations";
import { listActionables } from "@/lib/queries";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const applicationId =
      new URL(request.url).searchParams.get("applicationId") ?? undefined;
    return ok({ actionables: listActionables(user.id, applicationId) });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const title = String(body.title ?? "").trim();
    if (!title) return badRequest("A title is required.");

    const kind = body.kind as ActionableKind;
    if (!ACTIONABLE_KINDS.includes(kind)) {
      return badRequest(`Unknown actionable kind: ${String(body.kind)}`);
    }

    const difficulty = body.difficulty as Difficulty | null;

    const actionable = createActionable(user.id, {
      applicationId: (body.applicationId as string) ?? null,
      kind,
      title,
      detail: (body.detail as string) ?? null,
      difficulty:
        difficulty && DIFFICULTIES.includes(difficulty) ? difficulty : null,
      pattern: (body.pattern as string) ?? null,
      estMinutes: body.estMinutes != null ? Number(body.estMinutes) : null,
      url: (body.url as string) ?? null,
      priority: Number(body.priority ?? 2),
      tags: (body.tags as string[]) ?? [],
      dueAt: asDate(body.dueAt),
      aiGenerated: false,
    });

    return ok({ actionable }, 201);
  } catch (error) {
    return failed(error);
  }
}
