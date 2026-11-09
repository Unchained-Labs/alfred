import type { AiJob, Application, ExerciseTest } from "@/db/schema";
import {
  analyzeJob,
  type CodeExercise,
  generateActionables,
  generateCodeExercise,
  generateHandbookDrills,
  generateHandbookOutline,
  generateHandbookPart,
  generateQuestionnaire,
  generateWrittenExercise,
} from "@/lib/ai";
import type { HandbookPlan } from "@/lib/ai/schemas";
import { exerciseKindFor, type RunReport } from "@/lib/exercises";
import { asHandbookContent, type HandbookContent } from "@/lib/handbook/render";
import {
  logHandbookBuilt,
  saveActionables,
  saveAnalysis,
  saveCodeExercise,
  saveQuestionnaire,
  saveWrittenExercise,
  setExerciseSelfCheck,
  startHandbook,
  updateHandbookContent,
} from "@/lib/mutations";
import {
  getActionable,
  getApplication,
  getExerciseByActionable,
  getHandbook,
  getLatestAnalysis,
  listActionables,
} from "@/lib/queries";
import { type HandlerMap, type JobContext, PermanentJobError } from "./worker";

/*
 * What each background job kind does. These are the bodies of the API routes
 * that used to run the same calls inline, moved here unchanged in what they
 * write: analyses, actionables, questions, handbooks and exercises land in the
 * same rows as before, so nothing that reads them had to change.
 *
 * Handlers re-read everything they need when they run, not when they were
 * queued. A job can wait minutes behind others; by then the posting may have
 * been edited or a prep item deleted, and acting on the snapshot would write
 * results about a version of the application that no longer exists.
 */

type Payload = Record<string, unknown>;
const payloadOf = (job: AiJob): Payload =>
  job.payload && typeof job.payload === "object" ? (job.payload as Payload) : {};

function applicationFor(job: AiJob): Application {
  if (!job.userId || !job.applicationId) {
    throw new PermanentJobError("This job is not attached to an application.");
  }
  const app = getApplication(job.userId, job.applicationId);
  if (!app) throw new PermanentJobError("The application was deleted.");
  return app;
}

function requirePosting(app: Application, what: string) {
  if (!app.description?.trim()) {
    throw new PermanentJobError(
      `This application has no posting text, so there is nothing to build ${what} from. Paste the job description, then retry.`,
    );
  }
}

const prepItem = (a: {
  kind: string;
  title: string;
  detail: string | null;
  rationale: string | null;
  pattern: string | null;
  difficulty: string | null;
}) => ({
  kind: a.kind,
  title: a.title,
  detail: a.detail,
  rationale: a.rationale,
  pattern: a.pattern,
  difficulty: a.difficulty,
});

/* ------------------------------------------------------------------ *
 * Exercises — moved from api/actionables/[id]/exercise
 * ------------------------------------------------------------------ */

const testsOf = (exercise: CodeExercise): ExerciseTest[] =>
  exercise.tests.map((test) => ({
    name: test.name,
    call: test.call,
    expect: test.expect,
    hidden: test.hidden,
  }));

/**
 * Generates a coding exercise and proves it is solvable before anyone is asked
 * to solve it, by running the generator's own solution against the generator's
 * own tests. Two attempts, because one carelessly computed expected value is
 * common and invisible to the candidate; keeps the least broken if both fail.
 */
async function buildCodeExercise(
  userId: string,
  app: Application,
  item: Parameters<typeof generateCodeExercise>[2],
) {
  // Imported lazily: the runner spawns Python and is only needed here.
  const { runPythonTests } = await import("@/lib/runner/python");
  let best: { exercise: CodeExercise; report: RunReport; meta: string[] } | null =
    null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = await generateCodeExercise(userId, app, item);
    const report = await runPythonTests(
      run.result.referenceSolution,
      testsOf(run.result),
    );
    const candidate = {
      exercise: run.result,
      report,
      meta: [run.provider, run.model],
    };
    if (report.passed) return candidate;
    const passing = (r: RunReport) => r.outcomes.filter((o) => o.passed).length;
    if (!best || passing(report) > passing(best.report)) best = candidate;
  }
  return best!;
}

function selfCheckDetail(report: RunReport): string {
  if (report.setupError) {
    return `The reference solution did not run: ${report.setupError.split("\n").pop()}`;
  }
  if (report.timedOut) return "The reference solution did not finish in time.";
  const failed = report.outcomes.filter((outcome) => !outcome.passed);
  return `${failed.length} of ${report.outcomes.length} generated tests reject the generator's own solution (${failed
    .slice(0, 3)
    .map((outcome) => outcome.name)
    .join(", ")}). Treat them as a guide rather than a verdict.`;
}

async function exercise(job: AiJob) {
  const { actionableId, regenerate } = payloadOf(job) as {
    actionableId?: string;
    regenerate?: boolean;
  };
  if (!job.userId || !actionableId)
    throw new PermanentJobError("No prep item given.");
  const actionable = getActionable(job.userId, actionableId);
  if (!actionable) throw new PermanentJobError("The prep item was deleted.");
  const kind = exerciseKindFor(actionable.kind);
  if (!kind) throw new PermanentJobError("This kind of prep item has no exercise.");

  const existing = getExerciseByActionable(job.userId, actionableId);
  if (existing && !regenerate) return { exerciseId: existing.id, reused: true };

  if (!actionable.applicationId) {
    throw new PermanentJobError("This item is not attached to an application.");
  }
  const app = getApplication(job.userId, actionable.applicationId);
  if (!app) throw new PermanentJobError("The application was deleted.");

  const item = { ...prepItem(actionable), estMinutes: actionable.estMinutes };

  if (kind === "written") {
    const run = await generateWrittenExercise(job.userId, app, item);
    const saved = saveWrittenExercise(job.userId, actionableId, run.result, {
      provider: run.provider,
      model: run.model,
    });
    if (!saved) throw new PermanentJobError("The prep item was deleted.");
    return { exerciseId: saved.id };
  }

  const built = await buildCodeExercise(job.userId, app, item);
  const saved = saveCodeExercise(job.userId, actionableId, built.exercise, {
    provider: built.meta[0],
    model: built.meta[1],
  });
  if (!saved) throw new PermanentJobError("The prep item was deleted.");
  setExerciseSelfCheck(
    job.userId,
    saved.id,
    built.report.passed,
    built.report.passed ? null : selfCheckDetail(built.report),
  );
  return { exerciseId: saved.id, selfCheck: built.report.passed };
}

/**
 * Queues exercises for the prep items that can have one and do not yet,
 * highest priority first, up to `limit`. Each is its own job, so one bad
 * problem statement costs that exercise, not the batch.
 */
export function queueExercises(
  ctx: JobContext,
  userId: string,
  applicationId: string,
  limit: number,
  after: string[] = [],
) {
  if (limit <= 0) return [];
  const candidates = listActionables(userId, applicationId)
    .filter((a) => a.status !== "done" && exerciseKindFor(a.kind))
    .filter((a) => !getExerciseByActionable(userId, a.id))
    .slice(0, limit);
  return candidates.map((a) =>
    ctx.enqueue({
      userId,
      applicationId,
      kind: "exercise",
      payload: { actionableId: a.id },
      dependsOn: after,
      dedupeKey: `exercise:${a.id}`,
      label: `Exercise: ${a.title}`,
      priority: 7,
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Handbook — the step chain from api/applications/[id]/handbook
 * ------------------------------------------------------------------ */

const EMPTY_DRILLS: HandbookContent["drills"] = {
  flashcards: [],
  glossary: [],
  stories: [],
  asks: [],
  checklist: [],
  sources: [],
};

/**
 * Queues every step of a handbook that is not written yet: one job per part,
 * then the drills once every part has succeeded. Called after the outline, and
 * again by "finish" on a handbook a previous build left half done.
 */
export function queueHandbookSteps(
  ctx: JobContext,
  userId: string,
  applicationId: string,
  content: HandbookContent,
  after: string[] = [],
) {
  const parts = content.plan.parts;
  const partJobs = parts
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => !p.body?.trim())
    .map(({ p, index }) =>
      ctx.enqueue({
        userId,
        applicationId,
        kind: "handbook_part",
        payload: { index },
        dependsOn: after,
        dedupeKey: `handbook-part:${applicationId}:${index}`,
        label: `Handbook part ${index + 1} of ${parts.length}: ${p.short || p.title}`,
        priority: 6,
      }),
    );
  if (content.drills.flashcards.length && !partJobs.length) return partJobs;
  const drills = ctx.enqueue({
    userId,
    applicationId,
    kind: "handbook_drills",
    dependsOn: [...after, ...partJobs.map((j) => j.id)],
    dedupeKey: `handbook-drills:${applicationId}`,
    label: "Handbook cards, glossary and checklist",
    priority: 6,
  });
  return [...partJobs, drills];
}

async function handbookOutline(job: AiJob, ctx: JobContext) {
  const app = applicationFor(job);
  const userId = job.userId!;
  const { regenerate } = payloadOf(job) as { regenerate?: boolean };

  const existing = getHandbook(userId, app.id);
  const current = existing ? asHandbookContent(existing.content) : null;
  if (current && !regenerate) {
    const queued = queueHandbookSteps(ctx, userId, app.id, current);
    return {
      reused: true,
      parts: current.plan.parts.length,
      queued: queued.length,
    };
  }

  requirePosting(app, "a handbook");
  const analysis = getLatestAnalysis(userId, app.id);
  const actionables = listActionables(userId, app.id).map((a) => ({
    ...prepItem(a),
  }));
  const run = await generateHandbookOutline(userId, app, analysis, actionables);
  const content: HandbookContent = {
    plan: { ...run.result, parts: run.result.parts.map((p) => ({ ...p })) },
    drills: EMPTY_DRILLS,
  };
  const row = startHandbook(userId, app.id, {
    title: run.result.title,
    content,
    parts: run.result.parts.length,
    provider: run.provider,
    model: run.model,
  });
  if (!row) throw new PermanentJobError("The application was deleted.");
  const queued = queueHandbookSteps(ctx, userId, app.id, content);
  return { parts: content.plan.parts.length, queued: queued.length };
}

function handbookContentFor(
  userId: string,
  applicationId: string,
): HandbookContent {
  const row = getHandbook(userId, applicationId);
  const content = row ? asHandbookContent(row.content) : null;
  if (!content) {
    throw new PermanentJobError(
      "The handbook's outline is missing. Rebuild the handbook.",
    );
  }
  return content;
}

async function handbookPart(job: AiJob) {
  const app = applicationFor(job);
  const userId = job.userId!;
  const index = Number(payloadOf(job).index);
  const content = handbookContentFor(userId, app.id);
  const part = content.plan.parts[index];
  if (!part) throw new PermanentJobError(`The handbook has no part ${index + 1}.`);
  if (part.body?.trim()) return { index, skipped: true };

  const analysis = getLatestAnalysis(userId, app.id);
  const siblings = content.plan.parts
    .filter((_, i) => i !== index)
    .map((p) => `${p.title} — ${p.intent}`);
  // The outline named the prep items this part teaches, by title. Match them
  // back to the real rows so the writer gets each one's detail and reason.
  const wanted = new Set((part.covers ?? []).map((t) => t.trim().toLowerCase()));
  const covers = listActionables(userId, app.id)
    .filter((a) => wanted.has(a.title.trim().toLowerCase()))
    .map(prepItem);

  const run = await generateHandbookPart(
    userId,
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

  // Re-read before writing: another part may have landed while this one ran.
  const latest = handbookContentFor(userId, app.id);
  const parts = [...latest.plan.parts];
  if (!parts[index])
    throw new PermanentJobError(
      "The handbook was rebuilt while this part was written.",
    );
  parts[index] = { ...parts[index], ...run.result };
  updateHandbookContent(userId, app.id, {
    ...latest,
    plan: { ...latest.plan, parts } as HandbookPlan,
  });
  return { index };
}

async function handbookDrills(job: AiJob) {
  const app = applicationFor(job);
  const userId = job.userId!;
  const content = handbookContentFor(userId, app.id);
  const analysis = getLatestAnalysis(userId, app.id);
  const run = await generateHandbookDrills(
    userId,
    app,
    analysis,
    content.plan.parts.map((p) => p.title),
  );
  const latest = handbookContentFor(userId, app.id);
  updateHandbookContent(userId, app.id, { ...latest, drills: run.result });
  logHandbookBuilt(userId, app.id, latest.plan.title, latest.plan.parts.length);
  return { cards: run.result.flashcards.length, terms: run.result.glossary.length };
}

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

export const handlers: HandlerMap = {
  async analysis(job) {
    const app = applicationFor(job);
    const { result, provider, model } = await analyzeJob(job.userId!, app);
    const saved = saveAnalysis(job.userId!, app.id, result, provider, model);
    return { analysisId: saved?.id ?? null, fitScore: result.fitScore };
  },

  async actionables(job, ctx) {
    const app = applicationFor(job);
    const { result, provider, model } = await generateActionables(
      job.userId!,
      app,
      getLatestAnalysis(job.userId!, app.id),
    );
    const inserted = saveActionables(job.userId!, app.id, result, provider, model);
    // The pipeline asks for exercises by passing a cap; a manual regenerate
    // does not, so pressing "Regenerate" never quietly queues ten more jobs.
    const cap = Number(payloadOf(job).exercises ?? 0);
    const exercises = queueExercises(ctx, job.userId!, app.id, cap);
    return {
      items: inserted.length,
      overview: result.overview,
      exercisesQueued: exercises.length,
    };
  },

  async questionnaire(job) {
    const app = applicationFor(job);
    const count = Math.min(25, Math.max(5, Number(payloadOf(job).count ?? 12)));
    const { result, provider, model } = await generateQuestionnaire(
      job.userId!,
      app,
      getLatestAnalysis(job.userId!, app.id),
      count,
    );
    saveQuestionnaire(job.userId!, app.id, result, provider, model);
    return { questions: result.questions.length };
  },

  handbook_outline: handbookOutline,
  handbook_part: handbookPart,
  handbook_drills: handbookDrills,
  exercise,
};
