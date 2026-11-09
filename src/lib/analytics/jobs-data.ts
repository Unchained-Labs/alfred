import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { analyses, applications } from "@/db/schema";
import type { JobRow } from "@/lib/analytics/jobs";

/*
 * The database side of the Jobs view: one read of the applications, one of
 * the analyses, joined in memory. Same reasoning as ./index — a personal board
 * is small, and every panel on the page should be cut from one snapshot.
 */
export function jobRows(userId: string): JobRow[] {
  const rows = db
    .select({
      id: applications.id,
      company: applications.company,
      title: applications.title,
      stage: applications.stage,
      location: applications.location,
      workMode: applications.workMode,
      seniority: applications.seniority,
      source: applications.source,
      salaryMin: applications.salaryMin,
      salaryMax: applications.salaryMax,
      currency: applications.currency,
      priority: applications.priority,
      tags: applications.tags,
      archived: applications.archived,
      appliedAt: applications.appliedAt,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .all();

  // Ascending into a map, so the latest analysis wins.
  const fits = db
    .select({ applicationId: analyses.applicationId, fitScore: analyses.fitScore })
    .from(analyses)
    .innerJoin(applications, eq(applications.id, analyses.applicationId))
    .where(eq(applications.userId, userId))
    .orderBy(asc(analyses.createdAt))
    .all();
  const fitByApp = new Map<string, number>();
  for (const f of fits) fitByApp.set(f.applicationId, f.fitScore);

  return rows.map((r) => ({
    ...r,
    tags: Array.isArray(r.tags) ? r.tags : [],
    appliedAt: r.appliedAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
    fitScore: fitByApp.get(r.id) ?? null,
  }));
}
