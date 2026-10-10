import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { type JobSearch, jobBoards, jobHits, jobSearches } from "@/db/schema";
import { matches, softKey } from "./match";
import { fetchBoard, fetchFeed } from "./sources";
import type { JobPosting, SearchCriteria, SourceResult } from "./types";

/*
 * One pass of job discovery for one account.
 *
 * Three things make a recurring scan different from a one-off search, and all
 * three are handled here rather than in the adapters:
 *
 *   1. The same posting must not land twice. A unique index on
 *      (user, source, sourceRef) does most of it; a softer company+title key
 *      catches one job arriving from two different sources.
 *   2. A source being down must not fail the run. Each adapter returns its
 *      error instead of throwing, and a board that stops answering records why
 *      so a dead slug explains itself rather than silently finding nothing.
 *   3. Sources are fetched once per run, not once per search. Two searches
 *      that both read your watched boards would otherwise hit every employer
 *      twice.
 */

/** A job seen more than this long ago is allowed to resurface. */
const SOFT_DEDUPE_DAYS = 45;

export type DiscoveryReport = {
  searches: {
    id: string;
    label: string;
    found: number;
    added: number;
    sources: { source: string; label: string; count: number; error?: string }[];
  }[];
  added: number;
  errors: string[];
};

const criteriaOf = (search: JobSearch): SearchCriteria => ({
  titleQuery: search.titleQuery,
  location: search.location,
  remoteOnly: search.remoteOnly,
  minSalary: search.minSalary,
});

export async function runDiscovery(
  userId: string,
  options?: { searchId?: string },
): Promise<DiscoveryReport> {
  const searches = db
    .select()
    .from(jobSearches)
    .where(
      options?.searchId
        ? and(eq(jobSearches.userId, userId), eq(jobSearches.id, options.searchId))
        : and(eq(jobSearches.userId, userId), eq(jobSearches.active, true)),
    )
    .all();

  const report: DiscoveryReport = { searches: [], added: 0, errors: [] };
  if (!searches.length) return report;

  const boards = db
    .select()
    .from(jobBoards)
    .where(and(eq(jobBoards.userId, userId), eq(jobBoards.active, true)))
    .all();

  /*
   * Fetched sources, shared across every search in this run.
   *
   * Keyword feeds depend on the search's own query, so they are cached per
   * (source, query); boards do not, so they are cached by source alone and
   * fetched exactly once however many searches read them.
   */
  const cache = new Map<string, Promise<SourceResult>>();
  const once = (key: string, load: () => Promise<SourceResult>) => {
    const existing = cache.get(key);
    if (existing) return existing;
    const promise = load();
    cache.set(key, promise);
    return promise;
  };

  // Soft keys already on file, so a job that arrived from another source — or
  // that you dismissed last week — does not come back as new.
  const since = new Date(Date.now() - SOFT_DEDUPE_DAYS * 86_400_000);
  const seen = new Set(
    db
      .select({ company: jobHits.company, title: jobHits.title })
      .from(jobHits)
      .where(and(eq(jobHits.userId, userId), gte(jobHits.firstSeenAt, since)))
      .all()
      .map((row) =>
        softKey({ company: row.company, title: row.title } as JobPosting),
      ),
  );

  const boardErrors = new Map<string, string | null>();

  for (const search of searches) {
    const criteria = criteriaOf(search);
    const kinds = search.sources ?? [];
    const results: SourceResult[] = [];

    if (kinds.includes("remotive")) {
      results.push(
        await once(`remotive:${criteria.titleQuery}`, () =>
          fetchFeed("remotive", criteria),
        ),
      );
    }
    if (kinds.includes("arbeitnow")) {
      results.push(await once("arbeitnow", () => fetchFeed("arbeitnow", criteria)));
    }
    if (kinds.includes("boards")) {
      for (const board of boards) {
        const result = await once(`${board.provider}:${board.slug}`, () =>
          fetchBoard({
            provider: board.provider,
            slug: board.slug,
            label: board.label,
          }),
        );
        results.push(result);
        boardErrors.set(board.id, result.error ?? null);
      }
    }

    const perSource: DiscoveryReport["searches"][number]["sources"] = [];
    let found = 0;
    let added = 0;

    for (const result of results) {
      if (result.error) report.errors.push(`${result.label}: ${result.error}`);

      const hits = result.postings.filter((posting) => matches(posting, criteria));
      found += hits.length;
      let inserted = 0;

      for (const posting of hits) {
        const key = softKey(posting);
        if (seen.has(key)) continue;

        const row = db
          .insert(jobHits)
          .values({
            userId,
            searchId: search.id,
            source: result.source,
            sourceRef: posting.sourceRef,
            company: posting.company,
            title: posting.title,
            location: posting.location,
            remote: posting.remote,
            url: posting.url,
            salaryText: posting.salaryText,
            postedAt: posting.postedAt,
            snippet: posting.snippet,
            tags: posting.tags,
          })
          // The unique index is the real guard against a daily re-run; this
          // turns the second sighting into a no-op rather than an error.
          .onConflictDoNothing()
          .returning()
          .get();

        if (row) {
          seen.add(key);
          inserted++;
        }
      }

      added += inserted;
      perSource.push({
        source: result.source,
        label: result.label,
        count: hits.length,
        ...(result.error ? { error: result.error } : {}),
      });
    }

    db.update(jobSearches)
      .set({ lastRunAt: new Date(), lastNewCount: added, updatedAt: new Date() })
      .where(eq(jobSearches.id, search.id))
      .run();

    report.searches.push({
      id: search.id,
      label: search.label,
      found,
      added,
      sources: perSource,
    });
    report.added += added;
  }

  // Recorded per board so a slug that has stopped answering says so in the UI
  // instead of just never contributing anything.
  for (const [boardId, error] of boardErrors) {
    db.update(jobBoards)
      .set({ lastRunAt: new Date(), lastError: error })
      .where(eq(jobBoards.id, boardId))
      .run();
  }

  return report;
}

/** Accounts with at least one active search, for the scheduled sweep. */
export function accountsWithActiveSearches(): string[] {
  const rows = db
    .selectDistinct({ userId: jobSearches.userId })
    .from(jobSearches)
    .where(eq(jobSearches.active, true))
    .all();
  return rows.map((row) => row.userId).filter((id): id is string => Boolean(id));
}
