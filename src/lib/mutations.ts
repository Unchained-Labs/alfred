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

export function setActionableStatus(
  userId: string,
  id: string,
  status: ActionableStatus,
) {
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
