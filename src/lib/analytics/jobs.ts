import { APPLICATION_STAGES, type ApplicationStage } from "@/db/schema";
import { comparablePay, convert, type FxRates } from "@/lib/fx/convert";

/*
 * The Jobs view of Analytics: every application ranked by what it pays, by how
 * well it fits, and by both at once.
 *
 * The Outcomes view asks where applications die. This one asks a question
 * that comes earlier — of everything on the board, which jobs are worth the
 * most effort — and it can be asked of a wishlist before anything is sent.
 *
 * Everything here is pure: rows in, rankings out. The page reads the database
 * and the exchange rates once and hands both over, so the arithmetic is
 * checked offline by scripts/check-job-analytics.ts.
 *
 * Missing data is never filled in. A job with no salary is unranked by pay,
 * not ranked as zero; a job with no analysis has no fit, not a fit of fifty.
 * Both sort last and the page counts them, because a ranking that silently
 * drops half the board reads as complete.
 */

export type JobRow = {
  id: string;
  company: string;
  title: string;
  stage: ApplicationStage;
  location: string | null;
  workMode: string | null;
  seniority: string | null;
  source: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  priority: number;
  tags: string[];
  archived: boolean;
  appliedAt: number | null;
  createdAt: number;
  /** Latest analysis' score, 0–100. */
  fitScore: number | null;
};

export type RankedJob = JobRow & {
  /** Comparable annual pay in the display currency (midpoint of the range). */
  pay: number | null;
  payLow: number | null;
  payHigh: number | null;
  /** 0–100: share of the other paid jobs in view this one out-earns. */
  payPercentile: number | null;
  /** 0–100 blend of pay percentile and fit, or null if either is missing. */
  combined: number | null;
  payRank: number | null;
  fitRank: number | null;
  combinedRank: number | null;
};

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

export const STAGE_GROUPS = {
  active: ["wishlist", "applied", "screening", "technical", "onsite", "offer"],
  applied: [
    "applied",
    "screening",
    "technical",
    "onsite",
    "offer",
    "accepted",
    "rejected",
    "withdrawn",
  ],
  interviewing: ["screening", "technical", "onsite", "offer"],
  closed: ["accepted", "rejected", "withdrawn"],
} as const satisfies Record<string, readonly ApplicationStage[]>;

export type StageGroup = keyof typeof STAGE_GROUPS;

export type SortKey =
  | "combined"
  | "pay"
  | "fit"
  | "company"
  | "title"
  | "stage"
  | "workMode"
  | "location"
  | "applied";

export type JobFilters = {
  /** A named group, or "all". Individual `stages` narrow it further. */
  group: StageGroup | "all";
  stages: ApplicationStage[];
  workModes: string[];
  seniorities: string[];
  sources: string[];
  currencies: string[];
  tags: string[];
  priorities: number[];
  includeArchived: boolean;
  /** Inclusive day bounds, YYYY-MM-DD, on applied date or else created date. */
  from: string | null;
  to: string | null;
  minFit: number | null;
  /** In the display currency. */
  minPay: number | null;
  /** Display currency. */
  currency: string;
  /** Weight of pay in the combined score, 0–100; fit gets the rest. */
  payWeight: number;
  sort: SortKey;
  dir: "asc" | "desc";
};

export const DEFAULT_FILTERS: JobFilters = {
  group: "all",
  stages: [],
  workModes: [],
  seniorities: [],
  sources: [],
  currencies: [],
  tags: [],
  priorities: [],
  includeArchived: false,
  from: null,
  to: null,
  minFit: null,
  minPay: null,
  currency: "USD",
  payWeight: 50,
  sort: "combined",
  dir: "desc",
};

const SORT_KEYS: SortKey[] = [
  "combined",
  "pay",
  "fit",
  "company",
  "title",
  "stage",
  "workMode",
  "location",
  "applied",
];

type Params = Record<string, string | string[] | undefined>;

function list(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function num(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function day(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/**
 * The filters from a URL's search params. Anything malformed is dropped back
 * to its default rather than rejected — a hand-edited link should still open.
 */
export function parseFilters(params: Params, defaultCurrency = "USD"): JobFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const group = one("group");
  const sort = one("sort") as SortKey | undefined;
  const weight = num(params.w);
  const currency = one("cur")?.trim().toUpperCase();
  return {
    group: group && group in STAGE_GROUPS ? (group as StageGroup) : "all",
    stages: list(params.stage).filter((s): s is ApplicationStage =>
      (APPLICATION_STAGES as readonly string[]).includes(s),
    ),
    workModes: list(params.mode),
    seniorities: list(params.level),
    sources: list(params.source),
    currencies: list(params.ccy).map((c) => c.toUpperCase()),
    tags: list(params.tag),
    priorities: list(params.prio)
      .map(Number)
      .filter((n) => Number.isInteger(n)),
    includeArchived: one("archived") === "1",
    from: day(params.from),
    to: day(params.to),
    minFit: num(params.fit),
    minPay: num(params.pay),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : defaultCurrency,
    payWeight: weight == null ? 50 : Math.max(0, Math.min(100, Math.round(weight))),
    sort: sort && SORT_KEYS.includes(sort) ? sort : "combined",
    dir: one("dir") === "asc" ? "asc" : "desc",
  };
}

/** The inverse of parseFilters, omitting defaults so links stay short. */
export function filtersToParams(
  f: JobFilters,
  defaultCurrency = "USD",
): URLSearchParams {
  const p = new URLSearchParams();
  if (f.group !== "all") p.set("group", f.group);
  if (f.stages.length) p.set("stage", f.stages.join(","));
  if (f.workModes.length) p.set("mode", f.workModes.join(","));
  if (f.seniorities.length) p.set("level", f.seniorities.join(","));
  if (f.sources.length) p.set("source", f.sources.join(","));
  if (f.currencies.length) p.set("ccy", f.currencies.join(","));
  if (f.tags.length) p.set("tag", f.tags.join(","));
  if (f.priorities.length) p.set("prio", f.priorities.join(","));
  if (f.includeArchived) p.set("archived", "1");
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.minFit != null) p.set("fit", String(f.minFit));
  if (f.minPay != null) p.set("pay", String(f.minPay));
  if (f.currency !== defaultCurrency) p.set("cur", f.currency);
  if (f.payWeight !== 50) p.set("w", String(f.payWeight));
  if (f.sort !== "combined") p.set("sort", f.sort);
  if (f.dir !== "desc") p.set("dir", f.dir);
  return p;
}

const lower = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** The day a job is dated by: when it was sent, else when it was added. */
export function jobDay(job: Pick<JobRow, "appliedAt" | "createdAt">): string {
  return new Date(job.appliedAt ?? job.createdAt).toISOString().slice(0, 10);
}

/**
 * Attribute filters only — the ones that decide which jobs are in view.
 * Pay and fit floors are applied after ranking (see rankJobs), because they
 * need the converted figure.
 */
export function matchesFilters(job: JobRow, f: JobFilters): boolean {
  if (!f.includeArchived && job.archived) return false;
  if (
    f.group !== "all" &&
    !(STAGE_GROUPS[f.group] as readonly string[]).includes(job.stage)
  ) {
    return false;
  }
  if (f.stages.length && !f.stages.includes(job.stage)) return false;
  if (f.workModes.length && !f.workModes.map(lower).includes(lower(job.workMode))) {
    return false;
  }
  if (
    f.seniorities.length &&
    !f.seniorities.map(lower).includes(lower(job.seniority))
  ) {
    return false;
  }
  if (f.sources.length && !f.sources.map(lower).includes(lower(job.source)))
    return false;
  if (
    f.currencies.length &&
    !f.currencies.includes((job.currency ?? "").toUpperCase())
  ) {
    return false;
  }
  if (f.tags.length) {
    const tags = job.tags.map(lower);
    if (!f.tags.map(lower).some((t) => tags.includes(t))) return false;
  }
  if (f.priorities.length && !f.priorities.includes(job.priority)) return false;
  const d = jobDay(job);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Ranking
 * ------------------------------------------------------------------ */

/**
 * Percentile of each value among the others: 100 for the highest, 0 for the
 * lowest, ties share the average. A single value is 100 — it out-earns
 * everything it is compared with, which is nothing, so it should not be
 * punished in the combined score for being alone.
 */
export function percentiles(values: number[]): number[] {
  if (values.length === 1) return [100];
  return values.map((v) => {
    let below = 0;
    let equal = 0;
    for (const other of values) {
      if (other < v) below++;
      else if (other === v) equal++;
    }
    // `equal` counts v itself; ties sit halfway through their block.
    return Math.round(((below + (equal - 1) / 2) / (values.length - 1)) * 100);
  });
}

/** Dense rank, 1 = best, by a value where higher is better; null stays null. */
function rankBy<T>(items: T[], get: (item: T) => number | null): Map<T, number> {
  const sorted = items
    .filter((i) => get(i) != null)
    .sort((a, b) => get(b)! - get(a)!);
  const ranks = new Map<T, number>();
  let rank = 0;
  let last: number | null = null;
  for (const item of sorted) {
    const v = get(item)!;
    if (v !== last) {
      rank++;
      last = v;
    }
    ranks.set(item, rank);
  }
  return ranks;
}

export type JobRanking = {
  jobs: RankedJob[];
  /** In view before the pay/fit floors. */
  inView: number;
  /** Of `jobs`: how many lack a salary, a convertible currency, or a fit. */
  noPay: number;
  noFit: number;
};

/**
 * Filter, convert, score and sort.
 *
 * Percentiles are taken among the jobs in view, so narrowing to "interviewing"
 * re-ranks those against each other — the question is always "of these, which".
 * The combined score is `w·payPercentile + (1−w)·fit`: pay as a percentile so a
 * currency's magnitude cannot swamp the fit score, fit as-is because it is
 * already on 0–100.
 */
export function rankJobs(
  rows: JobRow[],
  f: JobFilters,
  rates: FxRates,
): JobRanking {
  const inView = rows.filter((r) => matchesFilters(r, f));

  const converted = inView.map((job) => {
    const from = job.currency ?? "USD";
    const toDisplay = (v: number | null) =>
      v == null ? null : convert(v, from, f.currency, rates);
    const mid = comparablePay(job.salaryMin, job.salaryMax);
    return {
      ...job,
      pay: mid == null ? null : toDisplay(mid),
      payLow: toDisplay(job.salaryMin ?? job.salaryMax),
      payHigh: toDisplay(job.salaryMax ?? job.salaryMin),
    };
  });

  const paid = converted.filter((j) => j.pay != null);
  const pct = percentiles(paid.map((j) => j.pay!));
  const pctById = new Map(paid.map((j, i) => [j.id, pct[i]]));
  const w = f.payWeight / 100;

  let ranked: RankedJob[] = converted.map((job) => {
    const payPercentile = pctById.get(job.id) ?? null;
    const combined =
      payPercentile != null && job.fitScore != null
        ? Math.round(w * payPercentile + (1 - w) * job.fitScore)
        : null;
    return {
      ...job,
      payPercentile,
      combined,
      payRank: null,
      fitRank: null,
      combinedRank: null,
    };
  });

  const byPay = rankBy(ranked, (j) => j.pay);
  const byFit = rankBy(ranked, (j) => j.fitScore);
  const byCombined = rankBy(ranked, (j) => j.combined);
  ranked = ranked.map((j) => ({
    ...j,
    payRank: byPay.get(j) ?? null,
    fitRank: byFit.get(j) ?? null,
    combinedRank: byCombined.get(j) ?? null,
  }));

  // Floors exclude jobs that are known to fall short. A job with no salary
  // is not known to pay too little, so a pay floor keeps it — same for fit.
  if (f.minPay != null)
    ranked = ranked.filter((j) => j.pay == null || j.pay >= f.minPay!);
  if (f.minFit != null) {
    ranked = ranked.filter((j) => j.fitScore == null || j.fitScore >= f.minFit!);
  }

  return {
    jobs: sortJobs(ranked, f.sort, f.dir),
    inView: inView.length,
    noPay: ranked.filter((j) => j.pay == null).length,
    noFit: ranked.filter((j) => j.fitScore == null).length,
  };
}

const STAGE_ORDER = new Map(APPLICATION_STAGES.map((s, i) => [s, i]));

/** Sort with missing values last in either direction; ties by company. */
export function sortJobs(
  jobs: RankedJob[],
  key: SortKey,
  dir: "asc" | "desc",
): RankedJob[] {
  const get = (j: RankedJob): number | string | null => {
    switch (key) {
      case "combined":
        return j.combined;
      case "pay":
        return j.pay;
      case "fit":
        return j.fitScore;
      case "company":
        return lower(j.company);
      case "title":
        return lower(j.title);
      case "stage":
        return STAGE_ORDER.get(j.stage) ?? null;
      case "workMode":
        return j.workMode ? lower(j.workMode) : null;
      case "location":
        return j.location ? lower(j.location) : null;
      case "applied":
        return j.appliedAt;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null)
      return lower(a.company).localeCompare(lower(b.company));
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
    return cmp !== 0
      ? cmp * sign
      : lower(a.company).localeCompare(lower(b.company));
  });
}

/* ------------------------------------------------------------------ *
 * Summaries
 * ------------------------------------------------------------------ */

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type JobSummary = {
  count: number;
  withPay: number;
  /** Percent of jobs with a comparable salary. */
  payCoverage: number | null;
  medianPay: number | null;
  topPay: number | null;
  medianFit: number | null;
  withFit: number;
  /** The best combined score, else best pay, else best fit. */
  topPick: RankedJob | null;
};

export function summarise(jobs: RankedJob[]): JobSummary {
  const pays = jobs.flatMap((j) => (j.pay != null ? [j.pay] : []));
  const fits = jobs.flatMap((j) => (j.fitScore != null ? [j.fitScore] : []));
  const best = (get: (j: RankedJob) => number | null) =>
    jobs.filter((j) => get(j) != null).sort((a, b) => get(b)! - get(a)!)[0] ?? null;
  return {
    count: jobs.length,
    withPay: pays.length,
    payCoverage: jobs.length ? Math.round((pays.length / jobs.length) * 100) : null,
    medianPay: median(pays),
    topPay: pays.length ? Math.max(...pays) : null,
    medianFit: median(fits),
    withFit: fits.length,
    topPick:
      best((j) => j.combined) ?? best((j) => j.pay) ?? best((j) => j.fitScore),
  };
}

export type JobBreakdownRow = {
  key: string;
  n: number;
  medianPay: number | null;
  medianFit: number | null;
};

/** Count, median pay and median fit per value of one attribute. */
export function jobBreakdown(
  jobs: RankedJob[],
  get: (j: RankedJob) => string | null,
): JobBreakdownRow[] {
  const groups = new Map<string, RankedJob[]>();
  for (const job of jobs) {
    const key = get(job)?.trim() || "Not stated";
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      n: list.length,
      medianPay: median(list.flatMap((j) => (j.pay != null ? [j.pay] : []))),
      medianFit: median(
        list.flatMap((j) => (j.fitScore != null ? [j.fitScore] : [])),
      ),
    }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/**
 * A location's country, for grouping: "Trondheim, Norway" and "Oslo, Norway" are one
 * market. The last comma-separated part, which is how postings write it.
 */
export function country(location: string | null): string | null {
  if (!location?.trim()) return null;
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

/** Distinct, sorted values of one attribute, for the filter menus. */
export function facetValues(rows: JobRow[]) {
  const uniq = (values: (string | null | undefined)[]) =>
    [
      ...new Set(
        values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)),
      ),
    ].sort((a, b) => a.localeCompare(b));
  return {
    workModes: uniq(rows.map((r) => r.workMode)),
    seniorities: uniq(rows.map((r) => r.seniority)),
    sources: uniq(rows.map((r) => r.source)),
    currencies: uniq(rows.map((r) => r.currency?.toUpperCase())),
    tags: uniq(rows.flatMap((r) => r.tags)),
    priorities: [...new Set(rows.map((r) => r.priority))].sort((a, b) => a - b),
  };
}
