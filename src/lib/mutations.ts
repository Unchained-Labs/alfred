import { and, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  type ActionableStatus,
  actionables,
  type Application,
  type ApplicationStage,
  applications,
  analyses,
  events,
  exercises,
  type ExerciseTest,
  mailMessages,
  type NewActionable,
  questions,
  type RubricCriterion,
  submissions,
} from "@/db/schema";
import type {
  ActionablePlan,
  CodeExercise,
  JobAnalysis,
  Questionnaire,
  WrittenExercise,
} from "@/lib/ai/schemas";
import { NotEarnedError } from "@/lib/errors";
import { requiresExercise } from "@/lib/exercises";
import { ownsApplication } from "@/lib/queries";
import { stageLabel } from "@/lib/stages";

/*
 * Like queries.ts, every entry point takes the owner explicitly. Writes that
 * target an existing row verify ownership first and return undefined when it
 * does not match, so a guessed id reads as "not found" rather than acting on
 * another account's data.
 */

/** Stages whose entry implies the application was actually submitted. */
const SUBMITTED_STAGES: ApplicationStage[] = [
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
  "accepted",
  "rejected",
];

function logEvent(input: {
  userId: string;
  applicationId: string;
  type: "created" | "stage_change" | "note" | "email" | "interview" | "task" | "ai";
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  db.insert(events)
    .values({
      userId: input.userId,
      applicationId: input.applicationId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      metadata: input.metadata,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .run();
}

function nextBoardOrder(userId: string, stage: ApplicationStage): number {
  const row = db
    .select({ top: max(applications.boardOrder) })
    .from(applications)
    .where(and(eq(applications.stage, stage), eq(applications.userId, userId)))
    .get();
  return (row?.top ?? 0) + 1;
}

/* ------------------------------------------------------------------ *
 * Applications
 * ------------------------------------------------------------------ */

export type ApplicationInput = {
  company: string;
  title: string;
  description?: string | null;
  location?: string | null;
  workMode?: string | null;
  seniority?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  jobUrl?: string | null;
  stage?: ApplicationStage;
  priority?: number;
  contactName?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  tags?: string[];
  appliedAt?: Date | null;
  nextActionAt?: Date | null;
  nextActionLabel?: string | null;
  source?: string;
};

export function createApplication(
  userId: string,
  input: ApplicationInput,
): Application {
  const stage = input.stage ?? "wishlist";

  // Entering a submitted stage without an explicit date means "today".
  const appliedAt =
    input.appliedAt ?? (SUBMITTED_STAGES.includes(stage) ? new Date() : null);

  const created = db
    .insert(applications)
    .values({
      ...input,
      userId,
      stage,
      appliedAt,
      source: input.source ?? "manual",
      boardOrder: nextBoardOrder(userId, stage),
      tags: input.tags ?? [],
    })
    .returning()
    .get();

  logEvent({
    userId,
    applicationId: created.id,
    type: "created",
    title: `Tracking ${created.title} at ${created.company}`,
    metadata: { to: stage, source: created.source },
  });

  return created;
}

export function updateApplication(
  userId: string,
  id: string,
  patch: Partial<ApplicationInput>,
): Application | undefined {
  const before = db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .get();
  if (!before) return undefined;

  const stageChanged = patch.stage != null && patch.stage !== before.stage;

  // Backfill appliedAt the first time an application reaches a submitted stage.
  const appliedAt =
    patch.appliedAt !== undefined
      ? patch.appliedAt
      : stageChanged &&
          before.appliedAt == null &&
          SUBMITTED_STAGES.includes(patch.stage!)
        ? new Date()
        : before.appliedAt;

  const updated = db
    .update(applications)
    .set({
      ...patch,
      appliedAt,
      boardOrder: stageChanged
        ? nextBoardOrder(userId, patch.stage!)
        : before.boardOrder,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id))
    .returning()
    .get();

  if (stageChanged) {
    logEvent({
      userId,
      applicationId: id,
      type: "stage_change",
      title: `${stageLabel(before.stage)} → ${stageLabel(patch.stage!)}`,
      metadata: { from: before.stage, to: patch.stage },
    });
  }

  return updated;
}

export function moveApplication(
  userId: string,
  id: string,
  stage: ApplicationStage,
  boardOrder?: number,
): Application | undefined {
  const before = db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .get();
  if (!before) return undefined;

  const appliedAt =
    before.appliedAt == null && SUBMITTED_STAGES.includes(stage)
      ? new Date()
      : before.appliedAt;

  const updated = db
    .update(applications)
    .set({
      stage,
      appliedAt,
      boardOrder: boardOrder ?? nextBoardOrder(userId, stage),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id))
    .returning()
    .get();

  if (before.stage !== stage) {
    logEvent({
      userId,
      applicationId: id,
      type: "stage_change",
      title: `${stageLabel(before.stage)} → ${stageLabel(stage)}`,
      metadata: { from: before.stage, to: stage },
    });
  }

  return updated;
}

export function deleteApplication(userId: string, id: string) {
  return db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .run();
}

export function addNote(userId: string, applicationId: string, body: string) {
  if (!ownsApplication(userId, applicationId)) return;
  logEvent({
    userId,
    applicationId,
    type: "note",
    title: "Note",
    body,
  });
  db.update(applications)
    .set({ updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .run();
}

/* ------------------------------------------------------------------ *
 * AI results → rows
 * ------------------------------------------------------------------ */

export function saveAnalysis(
  userId: string,
  applicationId: string,
  analysis: JobAnalysis,
  provider: string,
  model: string,
) {
  const saved = db
    .insert(analyses)
    .values({ applicationId, ...analysis, provider, model })
    .returning()
    .get();

  logEvent({
    userId,
    applicationId,
    type: "ai",
    title: `Fit analysis: ${analysis.fitScore}/100`,
    body: analysis.verdict,
    metadata: { provider, model, fitScore: analysis.fitScore },
  });

  return saved;
}

export function saveActionables(
  userId: string,
  applicationId: string,
  plan: ActionablePlan,
  provider: string,
  model: string,
) {
  // Regenerating replaces the untouched AI suggestions but keeps anything the
  // user has already started or finished, and anything they added by hand.
  db.delete(actionables)
    .where(
      and(
        eq(actionables.applicationId, applicationId),
        eq(actionables.status, "todo"),
        eq(actionables.aiGenerated, true),
      ),
    )
    .run();

  const rows: NewActionable[] = plan.items.map((item) => ({
    userId,
    applicationId,
    kind: item.kind,
    title: item.title,
    detail: item.detail,
    rationale: item.rationale,
    difficulty: item.difficulty ?? null,
    pattern: item.pattern ?? null,
    estMinutes: item.estMinutes,
    url: item.url ?? null,
    priority: item.priority,
    tags: item.tags,
    aiGenerated: true,
  }));

  const inserted = rows.length
    ? db.insert(actionables).values(rows).returning().all()
    : [];

  logEvent({
    userId,
    applicationId,
    type: "ai",
    title: `Generated ${inserted.length} prep actionables`,
    body: plan.overview,
    metadata: { provider, model },
  });

  return inserted;
}

export function saveQuestionnaire(
  userId: string,
  applicationId: string,
  questionnaire: Questionnaire,
  provider: string,
  model: string,
) {
  // Keep anything the user has drafted an answer for; replace the rest.
  db.delete(questions)
    .where(
      and(
        eq(questions.applicationId, applicationId),
        sql`(${questions.userAnswer} is null or ${questions.userAnswer} = '')`,
      ),
    )
    .run();

  const existing = db
    .select({ max: max(questions.sortOrder) })
    .from(questions)
    .where(eq(questions.applicationId, applicationId))
    .get();
  const offset = (existing?.max ?? -1) + 1;

  const rows = questionnaire.questions.map((question, index) => ({
    userId,
    applicationId,
    question: question.question,
    category: question.category,
    probing: question.probing,
    suggestedAnswer: question.suggestedAnswer,
    sortOrder: offset + index,
  }));

  const inserted = rows.length
    ? db.insert(questions).values(rows).returning().all()
    : [];

  logEvent({
    userId,
    applicationId,
    type: "ai",
    title: `Drafted ${inserted.length} interview questions`,
    metadata: { provider, model },
  });

  return inserted;
}

/* ------------------------------------------------------------------ *
 * Actionables & questions
 * ------------------------------------------------------------------ */

/**
 * Refuses to let a gated item be called done without a passing submission
 * behind it.
 *
 * This lives in the data layer rather than in the route on purpose. It is the
 * one invariant the whole exercises feature rests on, and a check in a handler
 * is a check somebody adds a second handler around. Here, every path that can
 * write `done` goes through it.
 *
 * Returns the row when the change is allowed, throws NotEarnedError when it is
 * not, and null when the item does not belong to this user.
 */
function assertCompletable(userId: string, id: string) {
  const item = db
    .select({
      kind: actionables.kind,
      title: actionables.title,
      verifiedAt: actionables.verifiedAt,
    })
    .from(actionables)
    .where(and(eq(actionables.id, id), eq(actionables.userId, userId)))
    .get();

  if (!item) return null;
  if (!requiresExercise(item.kind) || item.verifiedAt) return item;

  // One escape hatch, and it is for Alfred's mistakes rather than the
  // candidate's: when the generated tests reject the generator's own solution,
  // the check is known-broken and nobody should be held to it.
  const broken = db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(eq(exercises.actionableId, id), eq(exercises.selfCheckPassed, false)),
    )
    .get();
  if (broken) return item;

  throw new NotEarnedError(
    `"${item.title}" is completed by doing it, not by marking it. Open it, do the work, and submit — or skip it if you would rather not.`,
  );
}

export function setActionableStatus(
  userId: string,
  id: string,
  status: ActionableStatus,
) {
  if (status === "done" && !assertCompletable(userId, id)) return undefined;

  return db
    .update(actionables)
    .set({
      status,
      completedAt: status === "done" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(actionables.id, id), eq(actionables.userId, userId)))
    .returning()
    .get();
}

export function updateActionable(
  userId: string,
  id: string,
  patch: Partial<NewActionable>,
) {
  // A general patch can carry a status like any other field, so it passes the
  // same gate — otherwise `{title, status}` would be the way around it.
  if (patch.status === "done" && !assertCompletable(userId, id)) return undefined;

  return (
    db
      .update(actionables)
      // The owner is never patchable, whatever the caller passes.
      .set({ ...patch, userId, updatedAt: new Date() })
      .where(and(eq(actionables.id, id), eq(actionables.userId, userId)))
      .returning()
      .get()
  );
}

export function createActionable(userId: string, input: NewActionable) {
  return db
    .insert(actionables)
    .values({ ...input, userId })
    .returning()
    .get();
}

export function deleteActionable(userId: string, id: string) {
  return db
    .delete(actionables)
    .where(and(eq(actionables.id, id), eq(actionables.userId, userId)))
    .run();
}

export function answerQuestion(
  userId: string,
  id: string,
  patch: { userAnswer?: string | null; confidence?: number | null },
) {
  return db
    .update(questions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(questions.id, id), eq(questions.userId, userId)))
    .returning()
    .get();
}

/* ------------------------------------------------------------------ *
 * Mail linking
 * ------------------------------------------------------------------ */

export function linkMailToApplication(
  userId: string,
  mailId: string,
  applicationId: string,
  options?: { advanceToStage?: ApplicationStage },
) {
  const mail = db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.id, mailId), eq(mailMessages.userId, userId)))
    .get();
  if (!mail) return undefined;
  // Linking writes an event onto the application, so the caller must own both.
  if (!ownsApplication(userId, applicationId)) return undefined;

  db.update(mailMessages)
    .set({ applicationId, status: "linked" })
    .where(and(eq(mailMessages.id, mailId), eq(mailMessages.userId, userId)))
    .run();

  logEvent({
    userId,
    applicationId,
    type: "email",
    title: mail.subject ?? "(no subject)",
    body: mail.snippet,
    metadata: {
      from: mail.fromAddress,
      classification: mail.classification,
      mailId,
    },
    occurredAt: mail.receivedAt,
  });

  if (options?.advanceToStage) {
    moveApplication(userId, applicationId, options.advanceToStage);
  }

  return db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.id, mailId), eq(mailMessages.userId, userId)))
    .get();
}

export function ignoreMail(userId: string, mailId: string) {
  return db
    .update(mailMessages)
    .set({ status: "ignored" })
    .where(and(eq(mailMessages.id, mailId), eq(mailMessages.userId, userId)))
    .returning()
    .get();
}

/** Creates an application straight from a triaged email. */
export function applicationFromMail(
  userId: string,
  mailId: string,
): Application | undefined {
  const mail = db
    .select()
    .from(mailMessages)
    .where(and(eq(mailMessages.id, mailId), eq(mailMessages.userId, userId)))
    .get();
  if (!mail?.detectedCompany) return undefined;

  const created = createApplication(userId, {
    company: mail.detectedCompany,
    title: mail.detectedTitle ?? "Unknown role",
    stage: mail.suggestedStage ?? "applied",
    source: "email",
    contactEmail: mail.fromAddress,
    contactName: mail.fromName,
    notes: mail.snippet,
    appliedAt: mail.receivedAt,
  });

  linkMailToApplication(userId, mailId, created.id);
  return created;
}

/* ------------------------------------------------------------------ *
 * Exercises & submissions
 * ------------------------------------------------------------------ */

type ExerciseMeta = { provider: string; model: string };

/**
 * Replaces any exercise already attached to this prep item.
 *
 * Delete-then-insert rather than an upsert, because the submissions hanging
 * off the old row were attempts at a DIFFERENT problem. Keeping them would
 * leave a history that reads like progress against tests that no longer
 * exist. They cascade, and `verifiedAt` is cleared with them: a verified item
 * whose evidence has been deleted is exactly the lie this feature removes.
 */
function replaceExercise(
  userId: string,
  actionableId: string,
  row: Omit<typeof exercises.$inferInsert, "userId" | "actionableId">,
) {
  const owned = db
    .select({ id: actionables.id })
    .from(actionables)
    .where(and(eq(actionables.id, actionableId), eq(actionables.userId, userId)))
    .get();
  if (!owned) return undefined;

  db.delete(exercises)
    .where(
      and(eq(exercises.actionableId, actionableId), eq(exercises.userId, userId)),
    )
    .run();

  db.update(actionables)
    .set({ verifiedAt: null, updatedAt: new Date() })
    .where(and(eq(actionables.id, actionableId), eq(actionables.userId, userId)))
    .run();

  return db
    .insert(exercises)
    .values({ ...row, userId, actionableId })
    .returning()
    .get();
}

export function saveCodeExercise(
  userId: string,
  actionableId: string,
  exercise: CodeExercise,
  meta: ExerciseMeta,
) {
  const tests: ExerciseTest[] = exercise.tests.map((test) => ({
    name: test.name,
    call: test.call,
    expect: test.expect,
    hidden: test.hidden,
  }));

  return replaceExercise(userId, actionableId, {
    kind: "code",
    brief: exercise.brief,
    language: "python",
    starterCode: exercise.starterCode,
    examples: exercise.examples.map((example) => ({
      input: example.input,
      output: example.output,
      note: example.note,
    })),
    tests,
    referenceSolution: exercise.referenceSolution,
    hints: exercise.hints,
    rubric: [],
    provider: meta.provider,
    model: meta.model,
  });
}

export function saveWrittenExercise(
  userId: string,
  actionableId: string,
  exercise: WrittenExercise,
  meta: ExerciseMeta,
) {
  const rubric: RubricCriterion[] = exercise.rubric.map((criterion) => ({
    id: criterion.id,
    requirement: criterion.requirement,
    weight: criterion.weight,
  }));

  return replaceExercise(userId, actionableId, {
    kind: "written",
    brief: exercise.brief,
    language: "text",
    examples: [],
    tests: [],
    hints: exercise.hints,
    rubric,
    provider: meta.provider,
    model: meta.model,
  });
}

/**
 * Records whether the generator's own solution passes the generator's own
 * tests. A false here is not the candidate's problem, so it downgrades the
 * exercise to ungated practice instead of blocking them on a broken check.
 */
export function setExerciseSelfCheck(
  userId: string,
  exerciseId: string,
  passed: boolean,
  detail: string | null,
) {
  return db
    .update(exercises)
    .set({ selfCheckPassed: passed, selfCheckDetail: detail })
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)))
    .returning()
    .get();
}

/** Every attempt is kept. Progress you can inspect beats a checkbox. */
export function recordSubmission(
  userId: string,
  input: {
    exerciseId: string;
    body: string;
    passed: boolean;
    results?: unknown;
    feedback?: string | null;
    durationMs?: number | null;
  },
) {
  return db
    .insert(submissions)
    .values({ ...input, userId })
    .returning()
    .get();
}

/**
 * The only way an exercise-backed item becomes done. Called after a submission
 * that actually passed, which is why it sets `verifiedAt` and the status in one
 * write — they must never disagree.
 */
export function markActionableVerified(
  userId: string,
  actionableId: string,
  applicationId: string | null,
  title: string,
) {
  const now = new Date();
  const updated = db
    .update(actionables)
    .set({ status: "done", verifiedAt: now, completedAt: now, updatedAt: now })
    .where(and(eq(actionables.id, actionableId), eq(actionables.userId, userId)))
    .returning()
    .get();

  if (updated && applicationId) {
    logEvent({
      userId,
      applicationId,
      type: "task",
      title: `Solved: ${title}`,
      body: "Completed in Alfred against its own checks.",
    });
  }
  return updated;
}
