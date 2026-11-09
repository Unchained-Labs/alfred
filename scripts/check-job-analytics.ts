/*
 * The Jobs ranking, asserted against a hand-built board.
 *
 * Ranking jobs by pay is only right if every salary is converted first, and a
 * conversion bug does not crash — it quietly crowns the posting with the most
 * zeros. So the conversion, the handling of missing salaries and fits, the
 * percentiles, the combined score and the filters are all gated here against
 * figures worked out by hand from the fixed rates below.
 *
 *   npm run check:job-analytics
 */
import {
  DEFAULT_FILTERS,
  filtersToParams,
  type JobFilters,
  type JobRow,
  jobBreakdown,
  matchesFilters,
  parseFilters,
  percentiles,
  rankJobs,
  summarise,
  country,
} from "@/lib/analytics/jobs";
import { comparablePay, convert, type FxRates } from "@/lib/fx/convert";

const checks: [string, boolean][] = [];
const ok = (label: string, pass: boolean) => checks.push([label, pass]);
const near = (a: number | null, b: number, eps = 0.5) =>
  a != null && Math.abs(a - b) <= eps;

// Round numbers so every expected figure can be done in your head.
const RATES: FxRates = {
  perUsd: { USD: 1, EUR: 0.9, NOK: 10, AED: 5 },
  date: "2026-11-09",
  source: "live",
};

/* ---------- conversion ---------- */

ok("same currency is untouched", convert(100, "USD", "USD", RATES) === 100);
ok("NOK to USD divides", convert(1000, "NOK", "USD", RATES) === 100);
ok("USD to EUR multiplies", convert(100, "USD", "EUR", RATES) === 90);
ok("NOK to EUR goes through USD", convert(1000, "NOK", "EUR", RATES) === 90);
ok(
  "currency codes are case-insensitive",
  convert(1000, "nok", "usd", RATES) === 100,
);
ok(
  "an unknown currency is null, not dollars",
  convert(100, "XYZ", "USD", RATES) === null,
);
ok(
  "a currency missing from the feed falls back to the built-in table",
  near(convert(100, "GBP", "USD", RATES), 100 / 0.78, 0.01),
);
ok("midpoint of a range", comparablePay(100, 200) === 150);
ok("floor only", comparablePay(100, null) === 100);
ok("ceiling only", comparablePay(null, 200) === 200);
ok("no salary is null", comparablePay(null, null) === null);

/* ---------- percentiles ---------- */

ok("highest is 100, lowest 0", percentiles([1, 2, 3]).join() === "0,50,100");
ok("ties share the middle", percentiles([1, 5, 5, 9]).join() === "0,50,50,100");
ok("a single value is 100", percentiles([42]).join() === "100");

/* ---------- the board ---------- */

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1); // 2026-10-01

function job(p: Partial<JobRow> & Pick<JobRow, "id">): JobRow {
  return {
    company: p.id,
    title: "Engineer",
    stage: "wishlist",
    location: null,
    workMode: null,
    seniority: null,
    source: "manual",
    salaryMin: null,
    salaryMax: null,
    currency: "USD",
    priority: 2,
    tags: [],
    archived: false,
    appliedAt: null,
    createdAt: T0,
    fitScore: null,
    ...p,
  };
}

/*
 * In USD: oslo 100k (1,000,000 NOK), dubai 150k (750,000 AED), berlin 100k
 * (90,000 EUR — ties with oslo), sf 200k. remote has no salary, lyon an
 * unconvertible one, old is archived.
 */
const board: JobRow[] = [
  job({
    id: "oslo",
    salaryMin: 900_000,
    salaryMax: 1_100_000,
    currency: "NOK",
    fitScore: 90,
    stage: "technical",
    workMode: "onsite",
    location: "Oslo, Norway",
    tags: ["robotics"],
    appliedAt: T0 + 5 * DAY,
  }),
  job({
    id: "dubai",
    salaryMin: 750_000,
    salaryMax: 750_000,
    currency: "AED",
    fitScore: 60,
    stage: "applied",
    workMode: "onsite",
    location: "Dubai, UAE",
    appliedAt: T0 + 10 * DAY,
  }),
  job({
    id: "berlin",
    salaryMin: 90_000,
    salaryMax: null,
    currency: "EUR",
    fitScore: 70,
    stage: "wishlist",
    workMode: "remote",
    location: "Berlin, Germany",
    tags: ["Robotics", "ml"],
  }),
  job({
    id: "sf",
    salaryMin: 200_000,
    salaryMax: 200_000,
    fitScore: null,
    stage: "rejected",
    workMode: "hybrid",
    priority: 3,
    appliedAt: T0 + 20 * DAY,
  }),
  job({
    id: "remote",
    fitScore: 80,
    stage: "screening",
    workMode: "remote",
    appliedAt: T0 + 30 * DAY,
  }),
  job({ id: "lyon", salaryMin: 50_000, currency: "XYZ", fitScore: 50 }),
  job({ id: "old", salaryMin: 999_000, fitScore: 99, archived: true }),
];

const f = (patch: Partial<JobFilters>): JobFilters => ({
  ...DEFAULT_FILTERS,
  ...patch,
});
const all = rankJobs(board, f({}), RATES);
const byId = new Map(all.jobs.map((j) => [j.id, j]));

ok("archived jobs are out by default", !byId.has("old") && all.inView === 6);
ok(
  "archived jobs come back on request",
  rankJobs(board, f({ includeArchived: true }), RATES).jobs.length === 7,
);
ok("NOK range converted at its midpoint", byId.get("oslo")!.pay === 100_000);
ok("AED converted", byId.get("dubai")!.pay === 150_000);
ok("EUR floor-only converted", byId.get("berlin")!.pay === 100_000);
ok(
  "range ends converted too",
  byId.get("oslo")!.payLow === 90_000 && byId.get("oslo")!.payHigh === 110_000,
);
ok("no salary means no pay, not zero", byId.get("remote")!.pay === null);
ok("unconvertible currency means no pay", byId.get("lyon")!.pay === null);
ok("unranked are counted", all.noPay === 2 && all.noFit === 1);

// Paid in view: 100k, 150k, 100k, 200k → percentiles 17, 67, 17, 100.
ok(
  "pay percentile with a tie",
  byId.get("oslo")!.payPercentile === 17 &&
    byId.get("berlin")!.payPercentile === 17,
);
ok("pay percentile of the top", byId.get("sf")!.payPercentile === 100);
ok(
  "pay rank is dense",
  byId.get("sf")!.payRank === 1 &&
    byId.get("dubai")!.payRank === 2 &&
    byId.get("oslo")!.payRank === 3 &&
    byId.get("berlin")!.payRank === 3,
);
ok(
  "fit rank",
  byId.get("oslo")!.fitRank === 1 && byId.get("remote")!.fitRank === 2,
);

// 50/50: oslo 0.5·17+0.5·90 = 53.5 → 54; dubai 0.5·67+30 = 63.5 → 64; berlin 0.5·17+35 = 43.5 → 44.
ok(
  "combined blends pay percentile and fit",
  byId.get("oslo")!.combined === 54 &&
    byId.get("dubai")!.combined === 64 &&
    byId.get("berlin")!.combined === 44,
);
ok(
  "combined needs both",
  byId.get("sf")!.combined === null && byId.get("remote")!.combined === null,
);
ok(
  "default sort is combined, nulls last",
  all.jobs
    .map((j) => j.id)
    .slice(0, 3)
    .join() === "dubai,oslo,berlin" && all.jobs.at(-1)!.combined === null,
);

const fitOnly = rankJobs(board, f({ payWeight: 0 }), RATES);
ok(
  "weight 0 ranks by fit alone",
  fitOnly.jobs[0].id === "oslo" && fitOnly.jobs[0].combined === 90,
);

const byPay = rankJobs(board, f({ sort: "pay" }), RATES).jobs.map((j) => j.id);
ok(
  "sort by pay, missing last",
  byPay[0] === "sf" &&
    byPay[1] === "dubai" &&
    byPay.slice(-2).sort().join() === "lyon,remote",
);
const asc = rankJobs(board, f({ sort: "pay", dir: "asc" }), RATES).jobs.map(
  (j) => j.id,
);
ok(
  "ascending still puts missing last",
  asc[0] === "berlin" && asc.slice(-2).sort().join() === "lyon,remote",
);

const eur = rankJobs(board, f({ currency: "EUR" }), RATES);
ok(
  "display currency changes the figures",
  eur.jobs.find((j) => j.id === "sf")!.pay === 180_000,
);
ok(
  "…but not the order",
  eur.jobs.map((j) => j.id).join() === all.jobs.map((j) => j.id).join(),
);

/* ---------- filters ---------- */

const ids = (p: Partial<JobFilters>) =>
  rankJobs(board, f(p), RATES)
    .jobs.map((j) => j.id)
    .sort()
    .join();
ok("group: interviewing", ids({ group: "interviewing" }) === "oslo,remote");
ok("group: closed", ids({ group: "closed" }) === "sf");
ok(
  "group: applied includes closed",
  ids({ group: "applied" }) === "dubai,oslo,remote,sf",
);
ok("individual stages", ids({ stages: ["wishlist"] }) === "berlin,lyon");
ok(
  "work mode, case-insensitive",
  ids({ workModes: ["REMOTE"] }) === "berlin,remote",
);
ok(
  "tags match any, case-insensitive",
  ids({ tags: ["robotics"] }) === "berlin,oslo",
);
ok("priority", ids({ priorities: [3] }) === "sf");
ok("original currency", ids({ currencies: ["NOK", "AED"] }) === "dubai,oslo");
ok(
  "date range uses applied date, else created",
  ids({ from: "2026-10-09", to: "2026-10-25" }) === "dubai,sf",
);
ok(
  "pay floor keeps the unknowns",
  ids({ minPay: 120_000 }) === "dubai,lyon,remote,sf",
);
ok("fit floor keeps the unknowns", ids({ minFit: 75 }) === "oslo,remote,sf");
ok(
  "percentiles re-rank within the view",
  rankJobs(board, f({ group: "interviewing" }), RATES).jobs.find(
    (j) => j.id === "oslo",
  )!.payPercentile === 100,
);
ok(
  "matchesFilters is the same test",
  matchesFilters(board[0], f({ group: "active" })) &&
    !matchesFilters(board[3], f({ group: "active" })),
);

/* ---------- URL round trip ---------- */

const custom = f({
  group: "active",
  stages: ["applied", "technical"],
  tags: ["ml"],
  minFit: 60,
  minPay: 90_000,
  currency: "EUR",
  payWeight: 30,
  sort: "pay",
  dir: "asc",
  includeArchived: true,
  from: "2026-10-01",
});
const round = parseFilters(Object.fromEntries(filtersToParams(custom)));
ok("filters survive the URL", JSON.stringify(round) === JSON.stringify(custom));
ok(
  "defaults make an empty URL",
  filtersToParams(DEFAULT_FILTERS).toString() === "",
);
const junk = parseFilters({
  group: "nope",
  stage: "bogus,applied",
  w: "250",
  fit: "abc",
  from: "yesterday",
  cur: "dollars",
  sort: "x",
});
ok(
  "junk params fall back to defaults",
  junk.group === "all" &&
    junk.stages.join() === "applied" &&
    junk.payWeight === 100 &&
    junk.minFit === null &&
    junk.from === null &&
    junk.currency === "USD" &&
    junk.sort === "combined",
);

/* ---------- summaries ---------- */

const s = summarise(all.jobs);
ok("summary counts", s.count === 6 && s.withPay === 4 && s.payCoverage === 67);
ok("median pay of 100,100,150,200", s.medianPay === 125_000);
ok("median fit of 50,60,70,80,90", s.medianFit === 70);
ok("top pick is best combined", s.topPick?.id === "dubai");
ok(
  "empty summary is nulls",
  summarise([]).medianPay === null && summarise([]).topPick === null,
);
const modes = jobBreakdown(all.jobs, (j) => j.workMode);
ok(
  "breakdown groups and counts",
  modes[0].key === "onsite" && modes[0].n === 2 && modes[0].medianPay === 125_000,
);
ok(
  "missing attribute is its own row",
  modes.some((m) => m.key === "Not stated" && m.n === 1),
);
ok(
  "country is the last part",
  country("Trondheim, Norway") === "Norway" && country(null) === null,
);

let failed = 0;
for (const [label, pass] of checks) {
  if (!pass) failed++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}`);
}
console.log(
  failed
    ? `\n${failed} of ${checks.length} job analytics check(s) failed`
    : `\nall ${checks.length} job analytics checks pass`,
);
if (failed) process.exit(1);
