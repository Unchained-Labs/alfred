import "server-only";
import {
  normaliseArbeitnow,
  normaliseAshby,
  normaliseGreenhouse,
  normaliseRemotive,
} from "./normalise";
import type { BoardRef, SearchCriteria, SourceResult } from "./types";

/*
 * Fetching, and nothing else.
 *
 * The field mapping lives in `normalise.ts` so it can be asserted offline
 * against recorded payloads — these APIs disagree with their own docs in small
 * silent ways, and a mapping bug here produces a source that answers happily
 * and yields nothing.
 *
 * Every adapter returns its error rather than throwing, so one source being
 * down degrades a daily scan instead of failing it.
 */

/** No source is allowed to hang a daily run. */
const TIMEOUT_MS = 20_000;
/** A board with thousands of postings should not become thousands of rows. */
const MAX_PER_SOURCE = 400;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      // Several of these boards answer differently, or not at all, without a
      // recognisable agent. Saying who we are is also just polite.
      "user-agent": "Alfred/1.0 (self-hosted job tracker)",
      accept: "application/json",
    },
    // These are public listings; a cached response would defeat a daily scan.
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  }
  return response.json();
}

/** One board, as its own source so a dead slug fails alone. */
export async function fetchBoard(board: BoardRef): Promise<SourceResult> {
  const source = `${board.provider}:${board.slug}`;
  const slug = encodeURIComponent(board.slug);
  try {
    if (board.provider === "greenhouse") {
      const payload = await getJson(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      );
      return {
        source,
        label: board.label,
        postings: normaliseGreenhouse(payload, board.label, MAX_PER_SOURCE),
      };
    }
    if (board.provider === "ashby") {
      const payload = await getJson(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
      );
      return {
        source,
        label: board.label,
        postings: normaliseAshby(payload, board.label, MAX_PER_SOURCE),
      };
    }
    return {
      source,
      label: board.label,
      postings: [],
      error: `No adapter for ${board.provider}`,
    };
  } catch (error) {
    return {
      source,
      label: board.label,
      postings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The two keyword feeds, each isolated so one being down is not fatal. */
export async function fetchFeed(
  kind: "remotive" | "arbeitnow",
  criteria: SearchCriteria,
): Promise<SourceResult> {
  const label = kind === "remotive" ? "Remotive" : "Arbeitnow";
  try {
    if (kind === "remotive") {
      const url = new URL("https://remotive.com/api/remote-jobs");
      // The only source that can filter server-side; the rest is done locally.
      if (criteria.titleQuery.trim()) {
        url.searchParams.set("search", criteria.titleQuery);
      }
      url.searchParams.set("limit", "100");
      return {
        source: kind,
        label,
        postings: normaliseRemotive(await getJson(url.toString())),
      };
    }

    const payload = await getJson("https://www.arbeitnow.com/api/job-board-api");
    return {
      source: kind,
      label,
      postings: normaliseArbeitnow(payload, MAX_PER_SOURCE),
    };
  } catch (error) {
    return {
      source: kind,
      label,
      postings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
