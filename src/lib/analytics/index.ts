import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyses, type ApplicationStage, applications, events } from "@/db/schema";
import {
  type AnalyticsHeadline,
  type AppRow,
  breakdown,
  type BreakdownRow,
  buildTimelines,
  type FitVersusOutcome,
  fitVersusOutcome,
  headline,
  outcomeTrend,
  type RejectionSummary,
  rejections,
  type ResponseTimes,
  responseTimes,
  type StageChangeRow,
  type StageDuration,
  stageDurations,
  type StageFate,
  stageFates,
  type TrendWeek,
} from "@/lib/analytics/compute";

/*
 * The database side of the Analytics page: read the rows, hand them to the
 * pure aggregations in ./compute, return the result.
 *
 * Deliberately one query per table rather than a join per panel. A personal
 * pipeline is hundreds of rows at the very most, so the whole history fits in
 * memory comfortably, and every panel is then computed from the same snapshot
 * — which matters more than it sounds: panels built from separate queries can
 * disagree with each other, and a page whose own numbers do not add up is
 * worse than no page.
 */

/** How many weeks the trend chart covers. */
const TREND_WEEKS = 16;

export type AnalyticsReport = {
  headline: AnalyticsHeadline;
  fates: StageFate[];
  durations: StageDuration[];
  response: ResponseTimes;
  fit: FitVersusOutcome;
  trend: TrendWeek[];
  bySource: BreakdownRow[];
  bySeniority: BreakdownRow[];
  byWorkMode: BreakdownRow[];
  rejections: RejectionSummary;
  trendWeeks: number;
};

export function analyticsReport(userId: string): AnalyticsReport {
  const now = Date.now();

  const appRows = db
    .select({
      id: applications.id,
      company: applications.company,
      title: applications.title,
      stage: applications.stage,
      source: applications.source,
      seniority: applications.seniority,
      workMode: applications.workMode,
      appliedAt: applications.appliedAt,
      createdAt: applications.createdAt,
      outcomeNote: applications.outcomeNote,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .all();

  /*
   * Latest analysis per application. Ordered ascending and written into a map,
   * so the last write wins — re-running an analysis should move the point on
   * the fit chart, not add a second one for the same job.
   */
  const fitRows = db
    .select({
      applicationId: analyses.applicationId,
      fitScore: analyses.fitScore,
    })
    .from(analyses)
    .innerJoin(applications, eq(applications.id, analyses.applicationId))
    .where(eq(applications.userId, userId))
    .orderBy(asc(analyses.createdAt))
    .all();

  const fitByApp = new Map<string, number>();
  for (const row of fitRows) fitByApp.set(row.applicationId, row.fitScore);

  const apps: AppRow[] = appRows.map((row) => ({
    id: row.id,
    company: row.company,
    title: row.title,
    stage: row.stage,
    source: row.source,
    seniority: row.seniority,
    workMode: row.workMode,
    appliedAt: row.appliedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    outcomeNote: row.outcomeNote,
    fitScore: fitByApp.get(row.id) ?? null,
  }));

  const changeRows = db
    .select({
      applicationId: events.applicationId,
      from: sql<string | null>`json_extract(${events.metadata}, '$.from')`,
      to: sql<string | null>`json_extract(${events.metadata}, '$.to')`,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.type, "stage_change")))
    .orderBy(asc(events.occurredAt))
    .all();

  const changes: StageChangeRow[] = changeRows
    .filter((row) => row.applicationId != null)
    .map((row) => ({
      applicationId: row.applicationId!,
      from: (row.from as ApplicationStage | null) ?? null,
      to: (row.to as ApplicationStage | null) ?? null,
      at: row.occurredAt.getTime(),
    }));

  const timelines = buildTimelines(apps, changes);

  return {
    headline: headline(timelines),
    fates: stageFates(timelines),
    durations: stageDurations(timelines, now),
    response: responseTimes(timelines, now),
    fit: fitVersusOutcome(timelines),
    trend: outcomeTrend(timelines, TREND_WEEKS, now),
    bySource: breakdown(timelines, "source"),
    bySeniority: breakdown(timelines, "seniority"),
    byWorkMode: breakdown(timelines, "workMode"),
    rejections: rejections(timelines),
    trendWeeks: TREND_WEEKS,
  };
}

/**
 * Rejections and withdrawals, counted against the stage they happened in.
 *
 * Exported separately for the dashboard funnel, which is otherwise blind to
 * them: a funnel plots survivors, so a stage that is quietly killing half your
 * applications looks exactly like a stage you rarely reach. This reuses the
 * same timeline reconstruction as the full report rather than growing a second
 * implementation that could drift from it — the cost is one more pass over a
 * few hundred rows, which is nothing next to two numbers that disagree.
 */
export function stageExits(
  userId: string,
): Partial<Record<ApplicationStage, number>> {
  const { fates } = analyticsReport(userId);
  const exits: Partial<Record<ApplicationStage, number>> = {};
  for (const fate of fates) {
    const lost = fate.rejected + fate.withdrawn;
    if (lost > 0) exits[fate.stage] = lost;
  }
  return exits;
}
