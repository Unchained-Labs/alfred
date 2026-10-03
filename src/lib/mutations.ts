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
  mailMessages,
  type NewActionable,
  questions,
} from "@/db/schema";
import type { ActionablePlan, JobAnalysis, Questionnaire } from "@/lib/ai/schemas";
import { stageLabel } from "@/lib/stages";

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
  applicationId: string;
  type: "created" | "stage_change" | "note" | "email" | "interview" | "task" | "ai";
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  db.insert(events)
    .values({
      applicationId: input.applicationId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      metadata: input.metadata,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .run();
}

function nextBoardOrder(stage: ApplicationStage): number {
  const row = db
    .select({ top: max(applications.boardOrder) })
    .from(applications)
    .where(eq(applications.stage, stage))
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

export function createApplication(input: ApplicationInput): Application {
  const stage = input.stage ?? "wishlist";

  // Entering a submitted stage without an explicit date means "today".
  const appliedAt =
    input.appliedAt ?? (SUBMITTED_STAGES.includes(stage) ? new Date() : null);

  const created = db
    .insert(applications)
    .values({
      ...input,
      stage,
      appliedAt,
      source: input.source ?? "manual",
      boardOrder: nextBoardOrder(stage),
      tags: input.tags ?? [],
    })
    .returning()
    .get();

  logEvent({
    applicationId: created.id,
    type: "created",
    title: `Tracking ${created.title} at ${created.company}`,
    metadata: { to: stage, source: created.source },
  });

  return created;
}

export function updateApplication(
  id: string,
  patch: Partial<ApplicationInput>,
): Application | undefined {
  const before = db.select().from(applications).where(eq(applications.id, id)).get();
  if (!before) return undefined;

  const stageChanged = patch.stage != null && patch.stage !== before.stage;

  // Backfill appliedAt the first time an application reaches a submitted stage.
  const appliedAt =
    patch.appliedAt !== undefined
      ? patch.appliedAt
      : stageChanged && before.appliedAt == null && SUBMITTED_STAGES.includes(patch.stage!)
        ? new Date()
        : before.appliedAt;

  const updated = db
    .update(applications)
    .set({
      ...patch,
      appliedAt,
      boardOrder: stageChanged ? nextBoardOrder(patch.stage!) : before.boardOrder,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id))
    .returning()
    .get();

  if (stageChanged) {
    logEvent({
      applicationId: id,
      type: "stage_change",
      title: `${stageLabel(before.stage)} → ${stageLabel(patch.stage!)}`,
      metadata: { from: before.stage, to: patch.stage },
    });
  }

  return updated;
}

export function moveApplication(
  id: string,
  stage: ApplicationStage,
  boardOrder?: number,
): Application | undefined {
  const before = db.select().from(applications).where(eq(applications.id, id)).get();
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
      boardOrder: boardOrder ?? nextBoardOrder(stage),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id))
    .returning()
    .get();

  if (before.stage !== stage) {
    logEvent({
      applicationId: id,
      type: "stage_change",
      title: `${stageLabel(before.stage)} → ${stageLabel(stage)}`,
      metadata: { from: before.stage, to: stage },
    });
  }

  return updated;
}

export function deleteApplication(id: string) {
  return db.delete(applications).where(eq(applications.id, id)).run();
}

export function addNote(applicationId: string, body: string) {
  logEvent({
    applicationId,
    type: "note",
    title: "Note",
    body,
  });
  db.update(applications)
    .set({ updatedAt: new Date() })
    .where(eq(applications.id, applicationId))
    .run();
}

/* ------------------------------------------------------------------ *
 * AI results → rows
 * ------------------------------------------------------------------ */

export function saveAnalysis(
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
    applicationId,
    type: "ai",
    title: `Fit analysis: ${analysis.fitScore}/100`,
    body: analysis.verdict,
    metadata: { provider, model, fitScore: analysis.fitScore },
  });

  return saved;
}

export function saveActionables(
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
    applicationId,
    type: "ai",
    title: `Generated ${inserted.length} prep actionables`,
    body: plan.overview,
    metadata: { provider, model },
  });

  return inserted;
}

export function saveQuestionnaire(
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

export function setActionableStatus(id: string, status: ActionableStatus) {
  return db
    .update(actionables)
    .set({
      status,
      completedAt: status === "done" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(actionables.id, id))
    .returning()
    .get();
}

export function updateActionable(id: string, patch: Partial<NewActionable>) {
  return db
    .update(actionables)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(actionables.id, id))
    .returning()
    .get();
}

export function createActionable(input: NewActionable) {
  return db.insert(actionables).values(input).returning().get();
}

export function deleteActionable(id: string) {
  return db.delete(actionables).where(eq(actionables.id, id)).run();
}

export function answerQuestion(
  id: string,
  patch: { userAnswer?: string | null; confidence?: number | null },
) {
  return db
    .update(questions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(questions.id, id))
    .returning()
    .get();
}

/* ------------------------------------------------------------------ *
 * Mail linking
 * ------------------------------------------------------------------ */

export function linkMailToApplication(
  mailId: string,
  applicationId: string,
  options?: { advanceToStage?: ApplicationStage },
) {
  const mail = db
    .select()
    .from(mailMessages)
    .where(eq(mailMessages.id, mailId))
    .get();
  if (!mail) return undefined;

  db.update(mailMessages)
    .set({ applicationId, status: "linked" })
    .where(eq(mailMessages.id, mailId))
    .run();

  logEvent({
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
    moveApplication(applicationId, options.advanceToStage);
  }

  return db.select().from(mailMessages).where(eq(mailMessages.id, mailId)).get();
}

export function ignoreMail(mailId: string) {
  return db
    .update(mailMessages)
    .set({ status: "ignored" })
    .where(eq(mailMessages.id, mailId))
    .returning()
    .get();
}

/** Creates an application straight from a triaged email. */
export function applicationFromMail(mailId: string): Application | undefined {
  const mail = db
    .select()
    .from(mailMessages)
    .where(eq(mailMessages.id, mailId))
    .get();
  if (!mail?.detectedCompany) return undefined;

  const created = createApplication({
    company: mail.detectedCompany,
    title: mail.detectedTitle ?? "Unknown role",
    stage: mail.suggestedStage ?? "applied",
    source: "email",
    contactEmail: mail.fromAddress,
    contactName: mail.fromName,
    notes: mail.snippet,
    appliedAt: mail.receivedAt,
  });

  linkMailToApplication(mailId, created.id);
  return created;
}
