import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
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
  type EventType,
  exercises,
  handbooks,
  type JobHitStatus,
  jobBoards,
  jobHits,
  jobSearches,
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

/**
 * Everything that happens on a date, in one list.
 *
 * Alfred already knew all of this — an interview sits in
 * `applications.next_action_at`, prep work in `actionables.due_at`, history in
 * `events.occurred_at` — but nothing ever put the three on the same axis, so
 * "what is coming up" was a question you answered by reading three pages.
 *
 * The window is inclusive of `from` and exclusive of `to`, which is what a
 * month grid wants: the caller passes the first cell and one past the last.
 */
export type CalendarKind = "interview" | "prep" | "history";

export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  /** Midnight-anchored day key, YYYY-MM-DD, in the server's zone. */
  day: string;
  at: Date;
  title: string;
  detail: string | null;
  company: string | null;
  applicationId: string | null;
  /** Prep only: done items still show, struck through, rather than vanishing. */
  done?: boolean;
  stage?: ApplicationStage | null;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function calendarItems(
  userId: string,
  from: Date,
  to: Date,
): CalendarItem[] {
  const out: CalendarItem[] = [];

  // Interviews and calls: the thing you actually plan around.
  const upcoming = db
    .select()
    .from(applications)
    .where(
      and(
        owned(userId),
        eq(applications.archived, false),
        isNotNull(applications.nextActionAt),
        gte(applications.nextActionAt, from),
        lte(applications.nextActionAt, to),
      ),
    )
    .all();
  for (const a of upcoming) {
    if (!a.nextActionAt) continue;
    out.push({
      id: `app-${a.id}`,
      kind: "interview",
      day: dayKey(a.nextActionAt),
      at: a.nextActionAt,
      title: a.nextActionLabel || "Next step",
      detail: a.title,
      company: a.company,
      applicationId: a.id,
      stage: a.stage,
    });
  }

  // Prep with a deadline. Completed work is kept rather than hidden: a week
  // you got through is worth seeing.
  const due = db
    .select({ a: actionables, company: applications.company })
    .from(actionables)
    .leftJoin(applications, eq(actionables.applicationId, applications.id))
    .where(
      and(
        eq(actionables.userId, userId),
        isNotNull(actionables.dueAt),
        gte(actionables.dueAt, from),
        lte(actionables.dueAt, to),
      ),
    )
    .all();
  for (const row of due) {
    const a = row.a;
    if (!a.dueAt) continue;
    out.push({
      id: `act-${a.id}`,
      kind: "prep",
      day: dayKey(a.dueAt),
      at: a.dueAt,
      title: a.title,
      detail: a.kind,
      company: row.company,
      applicationId: a.applicationId,
      done: a.status === "done",
    });
  }

  // What already happened, so the month reads as a record and not just a plan.
  const past = db
    .select({ e: events, company: applications.company })
    .from(events)
    .leftJoin(applications, eq(events.applicationId, applications.id))
    .where(
      and(
        eq(events.userId, userId),
        gte(events.occurredAt, from),
        lte(events.occurredAt, to),
      ),
    )
    .all();
  for (const row of past) {
    out.push({
      id: `ev-${row.e.id}`,
      kind: "history",
      day: dayKey(row.e.occurredAt),
      at: row.e.occurredAt,
      title: row.e.title || row.e.type,
      detail: null,
      company: row.company,
      applicationId: row.e.applicationId,
    });
  }

  return out.sort((x, y) => x.at.getTime() - y.at.getTime());
}

/** The next N dated things, for the dashboard and the calendar's side rail. */
export function agenda(userId: string, days = 30, limit = 12): CalendarItem[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return calendarItems(userId, start, end)
    .filter((i) => i.kind !== "history" && !i.done)
    .slice(0, limit);
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

/* ------------------------------------------------------------------ *
 * Learning handbooks
 * ------------------------------------------------------------------ */

/** At most one per application — the unique index makes that a fact. */
export function getHandbook(userId: string, applicationId: string) {
  return (
    db
      .select()
      .from(handbooks)
      .where(
        and(
          eq(handbooks.applicationId, applicationId),
          eq(handbooks.userId, userId),
        ),
      )
      .get() ?? null
  );
}

/* ------------------------------------------------------------------ *
 * Jobs table
 * ------------------------------------------------------------------ */

/**
 * Every job this user owns, with its latest fit score and prep counts.
 *
 * Three queries rather than one per row: the Jobs page shows all of them at
 * once, including the archived ones, so an N+1 here would be N+1 over the
 * whole pipeline.
 */
export function listJobsWithContext(userId: string) {
  const rows = listApplications(userId, { includeArchived: true });

  const ids = rows.map((row) => row.id);

  // `analyses` carries no owner of its own — it is scoped through its
  // application — so it is restricted to this user's ids rather than read
  // whole and filtered afterwards.
  const scores = new Map<string, number>();
  if (ids.length) {
    for (const row of db
      .select({
        applicationId: analyses.applicationId,
        fitScore: analyses.fitScore,
      })
      .from(analyses)
      .where(inArray(analyses.applicationId, ids))
      .orderBy(desc(analyses.createdAt))
      .all()) {
      // Newest first, so the first one seen per application is the latest.
      if (!scores.has(row.applicationId)) {
        scores.set(row.applicationId, row.fitScore);
      }
    }
  }

  const prep = new Map<string, { total: number; done: number }>();
  for (const row of db
    .select({
      applicationId: actionables.applicationId,
      status: actionables.status,
      total: count(),
    })
    .from(actionables)
    .where(eq(actionables.userId, userId))
    .groupBy(actionables.applicationId, actionables.status)
    .all()) {
    if (!row.applicationId) continue;
    const entry = prep.get(row.applicationId) ?? { total: 0, done: 0 };
    entry.total += row.total;
    if (row.status === "done") entry.done += row.total;
    prep.set(row.applicationId, entry);
  }

  return rows.map((app) => ({
    ...app,
    fitScore: scores.get(app.id) ?? null,
    prepTotal: prep.get(app.id)?.total ?? 0,
    prepDone: prep.get(app.id)?.done ?? 0,
  }));
}

/* ------------------------------------------------------------------ *
 * Dashboard: the jobs themselves
 * ------------------------------------------------------------------ */

/** Furthest-along first, because that is the order you care about them in. */
const STAGE_DEPTH = new Map(BOARD_STAGES.map((stage, index) => [stage, index]));

/**
 * The applications actually in play, with the context that decides what to do
 * about one: how well it fits, how much of its prep is done, and whether a
 * follow-up is set.
 */
export function jobsInPlay(userId: string, limit = 6) {
  const rows = db
    .select()
    .from(applications)
    .where(
      and(
        owned(userId),
        eq(applications.archived, false),
        inArray(applications.stage, BOARD_STAGES),
      ),
    )
    .all();

  const ids = rows.map((row) => row.id);

  // `analyses` has no owner column — it is scoped through its application — so
  // it is restricted to these ids rather than read whole.
  const scores = new Map<string, number>();
  if (ids.length) {
    for (const row of db
      .select({
        applicationId: analyses.applicationId,
        fitScore: analyses.fitScore,
      })
      .from(analyses)
      .where(inArray(analyses.applicationId, ids))
      .orderBy(desc(analyses.createdAt))
      .all()) {
      if (!scores.has(row.applicationId)) {
        scores.set(row.applicationId, row.fitScore);
      }
    }
  }

  const prep = new Map<string, { total: number; done: number }>();
  for (const row of db
    .select({
      applicationId: actionables.applicationId,
      status: actionables.status,
      total: count(),
    })
    .from(actionables)
    .where(eq(actionables.userId, userId))
    .groupBy(actionables.applicationId, actionables.status)
    .all()) {
    if (!row.applicationId) continue;
    const entry = prep.get(row.applicationId) ?? { total: 0, done: 0 };
    entry.total += row.total;
    if (row.status === "done") entry.done += row.total;
    prep.set(row.applicationId, entry);
  }

  return rows
    .map((app) => ({
      ...app,
      fitScore: scores.get(app.id) ?? null,
      prepTotal: prep.get(app.id)?.total ?? 0,
      prepDone: prep.get(app.id)?.done ?? 0,
    }))
    .sort(
      (a, b) =>
        (STAGE_DEPTH.get(b.stage) ?? -1) - (STAGE_DEPTH.get(a.stage) ?? -1) ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    )
    .slice(0, limit);
}

/**
 * Applications that have gone quiet: nothing scheduled, and nothing has
 * actually happened on them for a while.
 *
 * This is the gap `needsAttention` leaves. That one only fires once a date has
 * been set and has passed, so an application nobody scheduled anything for is
 * invisible — which is exactly how a job hunt loses track of one.
 *
 * "Nothing has happened" is measured from the TIMELINE, not from
 * `updatedAt`. Two reasons. `updatedAt` moves when you edit the row at all, so
 * jotting a note about how worried you are about the silence would reset the
 * silence clock, which is perverse. And only some events are movement: a stage
 * change, an email, an interview. A note you wrote, a prep item you ticked or
 * an analysis you ran are your activity, not theirs, and the employer being
 * quiet is the thing being measured.
 *
 * Deliberately not limited to the pre-reply stages: silence after an onsite is
 * the case that costs the most and the one people are most reluctant to chase.
 * Wishlist is excluded — nothing has been sent, so there is nobody to chase.
 */
const MOVEMENT_EVENTS: EventType[] = ["stage_change", "email", "interview"];

export function goingQuiet(userId: string, afterDays = 10, limit = 5) {
  const cutoff = Date.now() - afterDays * DAY;

  const rows = db
    .select()
    .from(applications)
    .where(
      and(
        owned(userId),
        eq(applications.archived, false),
        inArray(applications.stage, [
          "applied",
          "screening",
          "technical",
          "onsite",
        ]),
        isNull(applications.nextActionAt),
      ),
    )
    .all();

  const ids = rows.map((row) => row.id);
  if (!ids.length) return [];

  const lastMove = new Map<string, number>();
  for (const row of db
    .select({
      applicationId: events.applicationId,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        inArray(events.applicationId, ids),
        inArray(events.type, MOVEMENT_EVENTS),
      ),
    )
    .orderBy(desc(events.occurredAt))
    .all()) {
    if (!row.applicationId) continue;
    // Newest first, so the first one seen per application is its last move.
    if (!lastMove.has(row.applicationId)) {
      lastMove.set(row.applicationId, row.occurredAt.getTime());
    }
  }

  return rows
    .map((app) => ({
      ...app,
      // No movement on record falls back to when it was sent, and failing
      // that to when the row was created — something must anchor the clock.
      lastMovedAt: new Date(
        lastMove.get(app.id) ?? app.appliedAt?.getTime() ?? app.createdAt.getTime(),
      ),
    }))
    .filter((app) => app.lastMovedAt.getTime() <= cutoff)
    .sort((a, b) => a.lastMovedAt.getTime() - b.lastMovedAt.getTime())
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Job discovery
 * ------------------------------------------------------------------ */

export function listJobSearches(userId: string) {
  return db
    .select()
    .from(jobSearches)
    .where(eq(jobSearches.userId, userId))
    .orderBy(desc(jobSearches.active), jobSearches.createdAt)
    .all();
}

export function listJobBoards(userId: string) {
  return db
    .select()
    .from(jobBoards)
    .where(eq(jobBoards.userId, userId))
    .orderBy(jobBoards.label)
    .all();
}

/** New hits first; newest posting first within that. */
export function listJobHits(
  userId: string,
  options?: { status?: JobHitStatus; searchId?: string; limit?: number },
) {
  const filters = [eq(jobHits.userId, userId)];
  if (options?.status) filters.push(eq(jobHits.status, options.status));
  if (options?.searchId) filters.push(eq(jobHits.searchId, options.searchId));

  return db
    .select()
    .from(jobHits)
    .where(and(...filters))
    .orderBy(desc(jobHits.postedAt), desc(jobHits.firstSeenAt))
    .limit(options?.limit ?? 200)
    .all();
}

export function countNewJobHits(userId: string): number {
  return (
    db
      .select({ total: count() })
      .from(jobHits)
      .where(and(eq(jobHits.userId, userId), eq(jobHits.status, "new")))
      .get()?.total ?? 0
  );
}

export function getJobHit(userId: string, id: string) {
  return (
    db
      .select()
      .from(jobHits)
      .where(and(eq(jobHits.id, id), eq(jobHits.userId, userId)))
      .get() ?? null
  );
}
