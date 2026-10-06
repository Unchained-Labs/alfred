import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  actionables,
  analyses,
  type Application,
  type ApplicationStage,
  applications,
  events,
  exercises,
  mailMessages,
  questions,
  submissions,
  TERMINAL_STAGES,
} from "@/db/schema";
import { BOARD_STAGES, FUNNEL_STAGES } from "@/lib/stages";

/*
 * Every function here takes the owner as its first argument and filters on it.
 * That is deliberate rather than implicit request context: a missing argument
 * is a type error, so a new call site cannot quietly read another account's
 * pipeline.
 */

const DAY = 86_400_000;

/** Rows belonging to this user. Null owners predate accounts and stay hidden. */
const owned = (userId: string) => eq(applications.userId, userId);

/* ------------------------------------------------------------------ *
 * Applications
 * ------------------------------------------------------------------ */

export function listApplications(
  userId: string,
  options?: { includeArchived?: boolean; stages?: ApplicationStage[] },
) {
  const filters = [owned(userId)];
  if (!options?.includeArchived) filters.push(eq(applications.archived, false));
  if (options?.stages?.length)
    filters.push(inArray(applications.stage, options.stages));

  return db
    .select()
    .from(applications)
    .where(and(...filters))
    .orderBy(
      desc(applications.priority),
      applications.boardOrder,
      desc(applications.updatedAt),
    )
    .all();
}

export function getApplication(
  userId: string,
  id: string,
): Application | undefined {
  return db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), owned(userId)))
    .get();
}

/** True when this user owns that application — the guard for nested writes. */
export function ownsApplication(userId: string, applicationId: string): boolean {
  return Boolean(getApplication(userId, applicationId));
}

export function getLatestAnalysis(userId: string, applicationId: string) {
  // analyses has no owner column of its own; ownership comes from the parent.
  if (!ownsApplication(userId, applicationId)) return null;
  return (
    db
      .select()
      .from(analyses)
      .where(eq(analyses.applicationId, applicationId))
      .orderBy(desc(analyses.createdAt))
      .limit(1)
      .get() ?? null
  );
}

export function listActionables(userId: string, applicationId?: string) {
  const filters = [eq(actionables.userId, userId)];
  if (applicationId) filters.push(eq(actionables.applicationId, applicationId));

  return db
    .select()
    .from(actionables)
    .where(and(...filters))
    .orderBy(
      sql`case ${actionables.status} when 'in_progress' then 0 when 'todo' then 1 when 'done' then 2 else 3 end`,
      desc(actionables.priority),
      actionables.createdAt,
    )
    .all();
}

export function listQuestions(userId: string, applicationId: string) {
  return db
    .select()
    .from(questions)
    .where(
      and(eq(questions.applicationId, applicationId), eq(questions.userId, userId)),
    )
    .orderBy(questions.sortOrder, questions.createdAt)
    .all();
}

export function listEvents(userId: string, applicationId: string, limit = 50) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.applicationId, applicationId), eq(events.userId, userId)))
    .orderBy(desc(events.occurredAt))
    .limit(limit)
    .all();
}

export function listKnownCompanies(userId: string): string[] {
  return db
    .selectDistinct({ company: applications.company })
    .from(applications)
    .where(owned(userId))
    .all()
    .map((row) => row.company);
}

/* ------------------------------------------------------------------ *
 * Dashboard aggregates
 * ------------------------------------------------------------------ */

export type StageCount = { stage: ApplicationStage; count: number };

export function stageCounts(userId: string): StageCount[] {
  const rows = db
    .select({ stage: applications.stage, total: count() })
    .from(applications)
    .where(and(owned(userId), eq(applications.archived, false)))
    .groupBy(applications.stage)
    .all();

  const byStage = new Map(rows.map((row) => [row.stage, row.total]));
  return BOARD_STAGES.concat(TERMINAL_STAGES).map((stage) => ({
    stage,
    count: byStage.get(stage) ?? 0,
  }));
}

/**
 * Funnel depth: how many applications reached *at least* each stage. Current
 * stage alone would under-count everything later rejected, so this reads the
 * stage-change history.
 */
export function funnelDepth(
  userId: string,
): { stage: ApplicationStage; count: number }[] {
  const live = db
    .select({ id: applications.id, stage: applications.stage })
    .from(applications)
    .where(and(owned(userId), eq(applications.archived, false)))
    .all();

  const reachedRows = db
    .select({
      applicationId: events.applicationId,
      stage: sql<string>`json_extract(${events.metadata}, '$.to')`,
    })
    .from(events)
    .where(and(eq(events.type, "stage_change"), eq(events.userId, userId)))
    .all();

  const reached = new Map<string, Set<string>>();
  for (const app of live) reached.set(app.id, new Set([app.stage]));
  for (const row of reachedRows) {
    if (!row.applicationId || !row.stage) continue;
    reached.get(row.applicationId)?.add(row.stage);
  }

  return FUNNEL_STAGES.map((stage, index) => {
    const atLeast = FUNNEL_STAGES.slice(index);
    let total = 0;
    for (const stages of reached.values()) {
      if (atLeast.some((candidate) => stages.has(candidate))) total++;
    }
    return { stage, count: total };
  });
}

export type DashboardStats = {
  active: number;
  totalApplied: number;
  interviewing: number;
  offers: number;
  rejections: number;
  responseRate: number | null;
  appliedLast7: number;
  appliedPrev7: number;
  openActionables: number;
  dueSoon: number;
  overdue: number;
  pendingMail: number;
  avgFitScore: number | null;
};

export function dashboardStats(userId: string): DashboardStats {
  const now = Date.now();
  const counts = new Map(stageCounts(userId).map((row) => [row.stage, row.count]));

  const interviewing =
    (counts.get("screening") ?? 0) +
    (counts.get("technical") ?? 0) +
    (counts.get("onsite") ?? 0);

  const active = BOARD_STAGES.reduce(
    (total, stage) => total + (counts.get(stage) ?? 0),
    0,
  );

  const appliedRows = db
    .select({ appliedAt: applications.appliedAt })
    .from(applications)
    .where(and(owned(userId), isNotNull(applications.appliedAt)))
    .all();

  const appliedLast7 = appliedRows.filter(
    (row) => row.appliedAt!.getTime() > now - 7 * DAY,
  ).length;
  const appliedPrev7 = appliedRows.filter((row) => {
    const at = row.appliedAt!.getTime();
    return at > now - 14 * DAY && at <= now - 7 * DAY;
  }).length;

  const totalApplied = appliedRows.length;
  const interviewsReached =
    funnelDepth(userId).find((row) => row.stage === "screening")?.count ?? 0;

  const openActionables =
    db
      .select({ total: count() })
      .from(actionables)
      .where(
        and(
          eq(actionables.userId, userId),
          inArray(actionables.status, ["todo", "in_progress"]),
        ),
      )
      .get()?.total ?? 0;

  const dueSoon =
    db
      .select({ total: count() })
      .from(actionables)
      .where(
        and(
          eq(actionables.userId, userId),
          inArray(actionables.status, ["todo", "in_progress"]),
          isNotNull(actionables.dueAt),
          lte(actionables.dueAt, new Date(now + 3 * DAY)),
        ),
      )
      .get()?.total ?? 0;

  const overdue =
    db
      .select({ total: count() })
      .from(applications)
      .where(
        and(
          owned(userId),
          eq(applications.archived, false),
          isNotNull(applications.nextActionAt),
          lte(applications.nextActionAt, new Date(now)),
          ne(applications.stage, "rejected"),
        ),
      )
      .get()?.total ?? 0;

  const pendingMail =
    db
      .select({ total: count() })
      .from(mailMessages)
      .where(
        and(eq(mailMessages.userId, userId), eq(mailMessages.status, "pending")),
      )
      .get()?.total ?? 0;

  const fit = db
    .select({ avg: sql<number | null>`avg(${analyses.fitScore})` })
    .from(analyses)
    .innerJoin(applications, eq(applications.id, analyses.applicationId))
    .where(owned(userId))
    .get();

  return {
    active,
    totalApplied,
    interviewing,
    offers: counts.get("offer") ?? 0,
    rejections: counts.get("rejected") ?? 0,
    responseRate:
      totalApplied > 0
        ? Math.round((interviewsReached / totalApplied) * 100)
        : null,
    appliedLast7,
    appliedPrev7,
    openActionables,
    dueSoon,
    overdue,
    pendingMail,
    avgFitScore: fit?.avg != null ? Math.round(fit.avg) : null,
  };
}

export function applicationActivity(
  userId: string,
  days = 30,
): { date: string; count: number }[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime() - (days - 1) * DAY;

  const rows = db
    .select({ appliedAt: applications.appliedAt })
    .from(applications)
    .where(and(owned(userId), isNotNull(applications.appliedAt)))
    .all();

  const buckets = new Map<string, number>();
  for (let index = 0; index < days; index++) {
    buckets.set(new Date(startMs + index * DAY).toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = row.appliedAt!.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + 1);
  }

  return [...buckets].map(([date, count]) => ({ date, count }));
}

export function upcomingWork(userId: string, limit = 8) {
  const rows = db
    .select({
      actionable: actionables,
      company: applications.company,
      title: applications.title,
    })
    .from(actionables)
    .leftJoin(applications, eq(actionables.applicationId, applications.id))
    .where(
      and(
        eq(actionables.userId, userId),
        inArray(actionables.status, ["todo", "in_progress"]),
      ),
    )
    .orderBy(desc(actionables.priority), actionables.dueAt, actionables.createdAt)
    .limit(limit)
    .all();

  return rows.map((row) => ({
    ...row.actionable,
    company: row.company,
    role: row.title,
  }));
}

export function needsAttention(userId: string, limit = 6) {
  return db
    .select()
    .from(applications)
    .where(
      and(
        owned(userId),
        eq(applications.archived, false),
        isNotNull(applications.nextActionAt),
        lte(applications.nextActionAt, new Date()),
        inArray(applications.stage, BOARD_STAGES),
      ),
    )
    .orderBy(applications.nextActionAt)
    .limit(limit)
    .all();
}

export function listMail(
  userId: string,
  status?: "pending" | "linked" | "ignored",
  limit = 100,
) {
  const filters = [eq(mailMessages.userId, userId)];
  if (status) filters.push(eq(mailMessages.status, status));

  return db
    .select()
    .from(mailMessages)
    .where(and(...filters))
    .orderBy(desc(mailMessages.receivedAt))
    .limit(limit)
    .all();
}

export function prepProgress(userId: string) {
  const rows = db
    .select({ kind: actionables.kind, status: actionables.status, total: count() })
    .from(actionables)
    .where(eq(actionables.userId, userId))
    .groupBy(actionables.kind, actionables.status)
    .all();

  const byKind = new Map<string, { done: number; total: number }>();
  for (const row of rows) {
    const entry = byKind.get(row.kind) ?? { done: 0, total: 0 };
    entry.total += row.total;
    if (row.status === "done") entry.done += row.total;
    byKind.set(row.kind, entry);
  }
  return byKind;
}

/**
 * Every prep item this user owns, with the role it belongs to.
 *
 * The /prep page used to run this join inline and without an owner filter,
 * which showed one account every other account's prep plan. Reading pipelines
 * through queries.ts — where the owner is a required argument — is what stops
 * that from being expressible.
 */
export function listPrepItems(userId: string) {
  const rows = db
    .select({
      actionable: actionables,
      company: applications.company,
      role: applications.title,
    })
    .from(actionables)
    .leftJoin(applications, eq(actionables.applicationId, applications.id))
    .where(eq(actionables.userId, userId))
    .orderBy(desc(actionables.priority), actionables.createdAt)
    .all();

  return rows.map((row) => ({
    ...row.actionable,
    company: row.company,
    role: row.role,
  }));
}

/* ------------------------------------------------------------------ *
 * Exercises
 * ------------------------------------------------------------------ */

export function getActionable(userId: string, id: string) {
  return (
    db
      .select()
      .from(actionables)
      .where(and(eq(actionables.id, id), eq(actionables.userId, userId)))
      .get() ?? null
  );
}

/**
 * The exercise attached to a prep item, if one has been generated. At most one
 * per item — the unique index on actionable_id is what makes "the exercise for
 * this task" a well-defined thing rather than a pile of attempts at a problem.
 */
export function getExerciseByActionable(userId: string, actionableId: string) {
  return (
    db
      .select()
      .from(exercises)
      .where(
        and(eq(exercises.actionableId, actionableId), eq(exercises.userId, userId)),
      )
      .get() ?? null
  );
}

export function getExercise(userId: string, id: string) {
  return (
    db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
      .get() ?? null
  );
}

/** Newest first. The attempt history is the evidence, so it is never pruned. */
export function listSubmissions(userId: string, exerciseId: string, limit = 25) {
  return db
    .select()
    .from(submissions)
    .where(
      and(eq(submissions.exerciseId, exerciseId), eq(submissions.userId, userId)),
    )
    .orderBy(desc(submissions.createdAt))
    .limit(limit)
    .all();
}
