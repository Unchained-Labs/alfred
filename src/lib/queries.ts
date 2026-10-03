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
  mailMessages,
  questions,
  TERMINAL_STAGES,
} from "@/db/schema";
import { BOARD_STAGES, FUNNEL_STAGES } from "@/lib/stages";

const DAY = 86_400_000;

/* ------------------------------------------------------------------ *
 * Applications
 * ------------------------------------------------------------------ */

export function listApplications(options?: {
  includeArchived?: boolean;
  stages?: ApplicationStage[];
}) {
  const filters = [];
  if (!options?.includeArchived) filters.push(eq(applications.archived, false));
  if (options?.stages?.length)
    filters.push(inArray(applications.stage, options.stages));

  return db
    .select()
    .from(applications)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      desc(applications.priority),
      applications.boardOrder,
      desc(applications.updatedAt),
    )
    .all();
}

export function getApplication(id: string): Application | undefined {
  return db.select().from(applications).where(eq(applications.id, id)).get();
}

export function getLatestAnalysis(applicationId: string) {
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

export function listActionables(applicationId?: string) {
  return db
    .select()
    .from(actionables)
    .where(applicationId ? eq(actionables.applicationId, applicationId) : undefined)
    .orderBy(
      // todo first, then by priority, then by the order the AI emitted them
      sql`case ${actionables.status} when 'in_progress' then 0 when 'todo' then 1 when 'done' then 2 else 3 end`,
      desc(actionables.priority),
      actionables.createdAt,
    )
    .all();
}

export function listQuestions(applicationId: string) {
  return db
    .select()
    .from(questions)
    .where(eq(questions.applicationId, applicationId))
    .orderBy(questions.sortOrder, questions.createdAt)
    .all();
}

export function listEvents(applicationId: string, limit = 50) {
  return db
    .select()
    .from(events)
    .where(eq(events.applicationId, applicationId))
    .orderBy(desc(events.occurredAt))
    .limit(limit)
    .all();
}

/** Drives the AI-triage "already in the pipeline" hint. */
export function listKnownCompanies(): string[] {
  return db
    .selectDistinct({ company: applications.company })
    .from(applications)
    .all()
    .map((row) => row.company);
}

/* ------------------------------------------------------------------ *
 * Dashboard aggregates
 * ------------------------------------------------------------------ */

export type StageCount = { stage: ApplicationStage; count: number };

export function stageCounts(): StageCount[] {
  const rows = db
    .select({ stage: applications.stage, total: count() })
    .from(applications)
    .where(eq(applications.archived, false))
    .groupBy(applications.stage)
    .all();

  const byStage = new Map(rows.map((row) => [row.stage, row.total]));
  return BOARD_STAGES.concat(TERMINAL_STAGES).map((stage) => ({
    stage,
    count: byStage.get(stage) ?? 0,
  }));
}

/**
 * Funnel depth: how many applications reached *at least* each stage. An
 * application currently at "onsite" counts toward applied/screening/technical
 * too, and a rejection still counts toward every stage it cleared.
 *
 * We only know an application's furthest stage from its own stage-change
 * history, so that is what we read — the current stage alone would under-count
 * everything that was later rejected.
 */
export function funnelDepth(): { stage: ApplicationStage; count: number }[] {
  const live = db
    .select({ id: applications.id, stage: applications.stage })
    .from(applications)
    .where(eq(applications.archived, false))
    .all();

  const reachedRows = db
    .select({
      applicationId: events.applicationId,
      stage: sql<string>`json_extract(${events.metadata}, '$.to')`,
    })
    .from(events)
    .where(eq(events.type, "stage_change"))
    .all();

  const reached = new Map<string, Set<string>>();
  for (const app of live) {
    reached.set(app.id, new Set([app.stage]));
  }
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
  /** Interviews reached / applications sent, as a percentage. */
  responseRate: number | null;
  appliedLast7: number;
  appliedPrev7: number;
  openActionables: number;
  dueSoon: number;
  overdue: number;
  pendingMail: number;
  avgFitScore: number | null;
};

export function dashboardStats(): DashboardStats {
  const now = Date.now();
  const counts = new Map(stageCounts().map((row) => [row.stage, row.count]));

  const interviewing =
    (counts.get("screening") ?? 0) +
    (counts.get("technical") ?? 0) +
    (counts.get("onsite") ?? 0);

  const active = BOARD_STAGES.reduce(
    (total, stage) => total + (counts.get(stage) ?? 0),
    0,
  );

  // "Applied" means the application actually went out, whatever happened after.
  const appliedRows = db
    .select({ appliedAt: applications.appliedAt })
    .from(applications)
    .where(isNotNull(applications.appliedAt))
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
    funnelDepth().find((row) => row.stage === "screening")?.count ?? 0;

  const openActionables =
    db
      .select({ total: count() })
      .from(actionables)
      .where(inArray(actionables.status, ["todo", "in_progress"]))
      .get()?.total ?? 0;

  const dueSoon =
    db
      .select({ total: count() })
      .from(actionables)
      .where(
        and(
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
      .where(eq(mailMessages.status, "pending"))
      .get()?.total ?? 0;

  const fit = db
    .select({ avg: sql<number | null>`avg(${analyses.fitScore})` })
    .from(analyses)
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

/** Applications sent per day for the last `days` days, oldest first. */
export function applicationActivity(days = 30): { date: string; count: number }[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime() - (days - 1) * DAY;

  const rows = db
    .select({ appliedAt: applications.appliedAt })
    .from(applications)
    .where(isNotNull(applications.appliedAt))
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

/** Everything the user should act on next, newest deadline first. */
export function upcomingWork(limit = 8) {
  const rows = db
    .select({
      actionable: actionables,
      company: applications.company,
      title: applications.title,
    })
    .from(actionables)
    .leftJoin(applications, eq(actionables.applicationId, applications.id))
    .where(inArray(actionables.status, ["todo", "in_progress"]))
    .orderBy(desc(actionables.priority), actionables.dueAt, actionables.createdAt)
    .limit(limit)
    .all();

  return rows.map((row) => ({
    ...row.actionable,
    company: row.company,
    role: row.title,
  }));
}

export function needsAttention(limit = 6) {
  const now = new Date();
  return db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.archived, false),
        isNotNull(applications.nextActionAt),
        lte(applications.nextActionAt, now),
        inArray(applications.stage, BOARD_STAGES),
      ),
    )
    .orderBy(applications.nextActionAt)
    .limit(limit)
    .all();
}

export function listMail(status?: "pending" | "linked" | "ignored", limit = 100) {
  return db
    .select()
    .from(mailMessages)
    .where(status ? eq(mailMessages.status, status) : undefined)
    .orderBy(desc(mailMessages.receivedAt))
    .limit(limit)
    .all();
}

/** Open prep items grouped by kind, for the prep hub's progress read. */
export function prepProgress() {
  const rows = db
    .select({
      kind: actionables.kind,
      status: actionables.status,
      total: count(),
    })
    .from(actionables)
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
