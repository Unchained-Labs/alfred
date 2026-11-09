import { NextResponse } from "next/server";
import { answerHandbookQuestion } from "@/lib/ai";
import { badRequest, failed, notFound, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createRateLimit, parseAskRequest, sameSiteJson } from "@/lib/handbook/ask";
import { renderMarkdown } from "@/lib/handbook/markdown";
import { asHandbookContent } from "@/lib/handbook/render";
import { cleanScene } from "@/lib/handbook/scenes";
import { runInteractive } from "@/lib/jobs/worker";
import { getHandbook } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

// Fifteen questions in ten minutes per person. Generous for study, and a
// ceiling on what a stuck key or a loop in the page can cost.
const allow = createRateLimit(15, 10 * 60 * 1000);

/**
 * The handbook's ask panel: a passage, a question, an answer — and a scene
 * when a picture answers better, in the same data shape the handbook draws.
 *
 * The answer's markdown is rendered HERE, by the handbook's own renderer, so
 * the page receives escaped HTML exactly like the rest of the document. The
 * scene is validated against the schema before it is sent.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    if (!sameSiteJson(request)) {
      return NextResponse.json(
        { error: "This endpoint only answers the handbook page itself." },
        { status: 403 },
      );
    }

    const row = getHandbook(user.id, id);
    const content = row ? asHandbookContent(row.content) : null;
    if (!row || !content) return notFound("No handbook for this application.");

    const parsed = parseAskRequest(await request.json().catch(() => null));
    if (!parsed.ok) return badRequest(parsed.error);

    if (!allow(user.id)) {
      return NextResponse.json(
        {
          error: "That is a lot of questions in a few minutes — give it a moment.",
        },
        { status: 429 },
      );
    }

    const { question, selection, part, context } = parsed.value;
    const run = await runInteractive(
      {
        userId: user.id,
        kind: "handbook_ask",
        applicationId: id,
        label: "Handbook question",
      },
      () =>
        answerHandbookQuestion(user.id, {
          handbookTitle: content.plan.title,
          partTitle: part,
          selection,
          question,
          context,
        }),
    );

    return ok({
      html: renderMarkdown(run.result.answer),
      scene: run.result.scene ? cleanScene(run.result.scene) : null,
    });
  } catch (error) {
    return failed(error);
  }
}
