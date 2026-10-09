import {
  generateHandbookDrills,
  generateHandbookOutline,
  generateHandbookPart,
} from "@/lib/ai";
import type { HandbookPlan } from "@/lib/ai/schemas";
import { badRequest, failed, notFound, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { asHandbookContent, type HandbookContent } from "@/lib/handbook/render";
import {
  deleteHandbook,
  logHandbookBuilt,
  startHandbook,
  updateHandbookContent,
} from "@/lib/mutations";
import {
  getApplication,
  getHandbook,
  getLatestAnalysis,
  listActionables,
} from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

/*
 * A handbook is built in steps, one request each.
 *
 * The first version did it in one request and one response per phase, and the
 * plan truncated: six taught parts do not fit in the output budget of the
 * Claude Code CLI, which has no flag to raise it and says nothing when it
 * clips. Providers cap output in different places, so the fix is not a bigger
 * number — it is to never ask for more than a page at a time.
 *
 * So the client drives: outline, then one call per part, then the drills. Each
 * request is short enough to survive a proxy, progress is honest because it is
 * real, and a failure halfway costs one step rather than the document.
 */

/** What the client needs to know to ask for the next step. */
function plan(content: HandbookContent) {
  const parts = content.plan.parts;
  const nextPart = parts.findIndex((p) => !p.body?.trim());
  return {
    title: content.plan.title,
    parts: parts.length,
    partsWritten: parts.filter((p) => p.body?.trim()).length,
    partTitles: parts.map((p) => p.short || p.title),
    nextStep:
      nextPart >= 0
        ? ({ step: "part", index: nextPart } as const)
        : content.drills.flashcards.length
          ? null
          : ({ step: "drills" } as const),
  };
}

const EMPTY_DRILLS: HandbookContent["drills"] = {
  flashcards: [],
  glossary: [],
  stories: [],
  asks: [],
  checklist: [],
  sources: [],
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    // Read loosely and coerce: the three steps take different fields, and a
    // union here buys nothing a `Number()` does not.
    const body = await readJson<{
      step?: string;
      index?: unknown;
      regenerate?: boolean;
    }>(request);
    const step = body.step ?? "outline";

    const app = getApplication(user.id, id);
    if (!app) return notFound("Application not found.");

    /* ---- step 1: the spine ---- */
    if (step === "outline") {
      const existing = getHandbook(user.id, id);
      if (existing && !body.regenerate) {
        const content = asHandbookContent(existing.content);
        if (content) return ok({ reused: true, ...plan(content) });
      }

      // A handbook is mostly a close reading of the posting. Without one there
      // is nothing to teach from and the result is generic advice.
      if (!app.description?.trim()) {
        return badRequest(
          "This application has no posting text, so there is nothing to build a handbook from. Paste the job description first.",
        );
      }

      const analysis = getLatestAnalysis(user.id, id);
      const actionables = listActionables(user.id, id).map((a) => ({
        kind: a.kind,
        title: a.title,
        detail: a.detail,
        rationale: a.rationale,
        pattern: a.pattern,
        difficulty: a.difficulty,
      }));
      const run = await generateHandbookOutline(
        user.id,
        app,
        analysis,
        actionables,
      );

      const content: HandbookContent = {
        plan: { ...run.result, parts: run.result.parts.map((p) => ({ ...p })) },
        drills: EMPTY_DRILLS,
      };
      const row = startHandbook(user.id, id, {
        title: run.result.title,
        content,
        parts: run.result.parts.length,
        provider: run.provider,
        model: run.model,
      });
      if (!row) return notFound("Application not found.");
      return ok(plan(content));
    }

    /* ---- the remaining steps need a handbook already started ---- */
    const row = getHandbook(user.id, id);
    if (!row) return badRequest("Start the handbook with the outline step first.");
    const content = asHandbookContent(row.content);
    if (!content) {
      return badRequest("This handbook's content cannot be read. Rebuild it.");
    }

    if (step === "part") {
      const index = Number(body.index);
      const part = content.plan.parts[index];
      if (!part) return badRequest(`There is no part ${String(body.index)}.`);

      const analysis = getLatestAnalysis(user.id, id);
      const siblings = content.plan.parts
        .filter((_, i) => i !== index)
        .map((p) => `${p.title} — ${p.intent}`);

      // The outline named the prep items this part teaches, by title. Match
      // them back to the real rows so the writer gets each one's detail and
      // the reason it was assigned — a title alone produces a reading list.
      const wanted = new Set(
        (part.covers ?? []).map((t) => t.trim().toLowerCase()),
      );
      const covers = listActionables(user.id, id)
        .filter((a) => wanted.has(a.title.trim().toLowerCase()))
        .map((a) => ({
          kind: a.kind,
          title: a.title,
          detail: a.detail,
          rationale: a.rationale,
          pattern: a.pattern,
          difficulty: a.difficulty,
        }));

      const run = await generateHandbookPart(
        user.id,
        app,
        analysis,
        {
          title: part.title,
          tldr: part.tldr,
          intent: part.intent,
          emphasis: part.emphasis,
          minutes: part.minutes,
        },
        siblings,
        covers,
      );

      const parts = [...content.plan.parts];
      parts[index] = { ...part, ...run.result };
      const next: HandbookContent = {
        ...content,
        plan: { ...content.plan, parts } as HandbookPlan,
      };
      updateHandbookContent(user.id, id, next);
      return ok(plan(next));
    }

    if (step === "drills") {
      const analysis = getLatestAnalysis(user.id, id);
      const run = await generateHandbookDrills(
        user.id,
        app,
        analysis,
        content.plan.parts.map((p) => p.title),
      );
      const next: HandbookContent = { ...content, drills: run.result };
      updateHandbookContent(user.id, id, next);
      logHandbookBuilt(user.id, id, content.plan.title, content.plan.parts.length);
      return ok({
        ...plan(next),
        cards: run.result.flashcards.length,
        terms: run.result.glossary.length,
      });
    }

    return badRequest(`Unknown step: ${String(step)}`);
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!getHandbook(user.id, id)) {
      return notFound("No handbook for this application.");
    }
    deleteHandbook(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return failed(error);
  }
}
