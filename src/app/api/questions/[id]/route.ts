import { requireUser } from "@/lib/auth";
import { failed, notFound, ok, readJson } from "@/lib/api";
import { answerQuestion } from "@/lib/mutations";
import { clamp } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await readJson<{ userAnswer?: string; confidence?: number }>(
      request,
    );

    const patch: { userAnswer?: string | null; confidence?: number | null } = {};
    if ("userAnswer" in body) patch.userAnswer = body.userAnswer ?? null;
    if ("confidence" in body) {
      patch.confidence =
        body.confidence == null ? null : clamp(Number(body.confidence), 1, 5);
    }

    const question = answerQuestion(user.id, id, patch);
    if (!question) return notFound("Question not found.");
    return ok({ question });
  } catch (error) {
    return failed(error);
  }
}
