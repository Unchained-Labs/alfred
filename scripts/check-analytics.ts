/*
 * The analytics arithmetic, asserted against a hand-built pipeline.
 *
 * Every number on the Analytics page is derived, and a derived number renders
 * exactly as confidently when it is wrong. "You lose most often at the
 * technical round" is a conclusion someone will act on — it changes what they
 * practise for a month — so the stage attribution, the censoring of in-flight
 * waits and the suppression of rates over tiny samples are all gated here.
 *
 * The fixture below is eight applications whose every expected figure was
 * worked out by hand; the assertions are those hand-computed answers, not a
 * snapshot of whatever the code currently returns.
 *
 *   npm run check:analytics
 */
import {
  answeredAt,
  type AppRow,
  breakdown,
  buildTimelines,
  fitVersusOutcome,
  headline,
  MIN_FOR_RATE,
  outcomeTrend,
  quantile,
  rejections,
  responseTimes,
  sentAt,
  type StageChangeRow,
  stageDurations,
  stageFates,
  weekStart,
} from "@/lib/analytics/compute";
import type { ApplicationStage } from "@/db/schema";

const checks: [string, boolean][] = [];
const ok = (label: string, pass: boolean) => checks.push([label, pass]);

const DAY = 86_400_000;
/** A Thursday, so the week-bucket maths has an offset to get wrong. */
const NOW = Date.UTC(2026, 2, 12);
const ago = (days: number) => NOW - days * DAY;

type Fixture = {
  app: AppRow;
  moves: [number, ApplicationStage, ApplicationStage][];
};

const app = (id: string, company: string, overrides: Partial<AppRow>): AppRow => ({
  id,
  company,
  title: "Engineer",
  stage: "applied",
  source: "manual",
  seniority: null,
  workMode: null,
  appliedAt: null,
  createdAt: ago(90),
  outcomeNote: null,
  fitScore: null,
  ...overrides,
});

/*
 * A1  applied 60d → screening 50d → technical 40d → rejected 30d, with feedback
 * A2  applied 40d → screening 20d → rejected 10d, no feedback
 * A3  applied 30d → rejected 25d, straight out of applied, with feedback
 * A4  applied 25d, never moved — ghosted
 * A5  applied 12d → screening 5d, still live
 * A6  applied 80d → screening → technical → onsite → offer → accepted
 * A7  wishlist only, never sent
 * A8  applied 18d → withdrawn 8d
 */
const FIXTURE: Fixture[] = [
  {
    app: app("a1", "Aurora", {
      stage: "rejected",
      seniority: "senior",
      workMode: "remote",
      appliedAt: ago(60),
      outcomeNote: "Went with someone who had run Kafka at this scale.",
      fitScore: 82,
    }),
    moves: [
      [50, "applied", "screening"],
      [40, "screening", "technical"],
      [30, "technical", "rejected"],
    ],
  },
  {
    app: app("a2", "Beacon", {
      stage: "rejected",
      source: "import",
      seniority: "mid",
      workMode: "onsite",
      appliedAt: ago(40),
      fitScore: 61,
    }),
    moves: [
      [20, "applied", "screening"],
      [10, "screening", "rejected"],
    ],
  },
  {
    app: app("a3", "Cinder", {
      stage: "rejected",
      seniority: "senior",
      workMode: "remote",
      appliedAt: ago(30),
      outcomeNote: "Filled the role internally.",
      fitScore: 45,
    }),
    moves: [[25, "applied", "rejected"]],
  },
  {
    app: app("a4", "Dune", {
      stage: "applied",
      seniority: "junior",
      workMode: "hybrid",
      appliedAt: ago(25),
      fitScore: 50,
    }),
    moves: [],
  },
  {
    app: app("a5", "Ember", {
      stage: "screening",
      source: "import",
      seniority: "senior",
      workMode: "remote",
      appliedAt: ago(12),
      fitScore: 78,
    }),
    moves: [[5, "applied", "screening"]],
  },
  {
    app: app("a6", "Flint", {
      stage: "accepted",
      seniority: "staff",
      workMode: "remote",
      appliedAt: ago(80),
      fitScore: 90,
    }),
    moves: [
      [70, "applied", "screening"],
      [60, "screening", "technical"],
      [50, "technical", "onsite"],
      [45, "onsite", "offer"],
      [40, "offer", "accepted"],
    ],
  },
  {
    app: app("a7", "Gale", {
      stage: "wishlist",
      source: "import",
      seniority: "mid",
      workMode: "remote",
      appliedAt: null,
      createdAt: ago(15),
    }),
    moves: [],
  },
  {
    app: app("a8", "Haze", {
      stage: "withdrawn",
      seniority: "mid",
      workMode: "remote",
      appliedAt: ago(18),
      fitScore: 55,
    }),
    moves: [[8, "applied", "withdrawn"]],
  },
];

const apps = FIXTURE.map((row) => row.app);
const changes: StageChangeRow[] = FIXTURE.flatMap((row) =>
  row.moves.map(([days, from, to]) => ({
    applicationId: row.app.id,
    from,
    to,
    at: ago(days),
  })),
);

const timelines = buildTimelines(apps, changes);
const find = (id: string) => timelines.find((t) => t.app.id === id)!;

/* ---- timeline reconstruction ---- */

ok("every application yields a timeline", timelines.length === apps.length);
ok(
  "a1 has four segments: applied, screening, technical, rejected",
  find("a1")
    .segments.map((s) => s.stage)
    .join(",") === "applied,screening,technical,rejected",
);
ok(
  "a1 furthest funnel stage is technical (index 2)",
  find("a1").furthestIndex === 2,
);
ok("a1 outcome is rejected", find("a1").outcome === "rejected");
ok("a1 was rejected out of technical", find("a1").closedFrom === "technical");
ok("a1 closed 30 days ago", find("a1").closedAt === ago(30));
ok(
  "a3 was rejected straight out of applied",
  find("a3").closedFrom === "applied" && find("a3").furthestIndex === 0,
);
ok(
  "a4 never moved, so its one segment is still open",
  find("a4").segments.length === 1 && find("a4").segments[0].leftAt === null,
);
ok("a4 is not closed", find("a4").outcome === null);
ok(
  "a6 reached offer (index 4) and ended accepted out of offer",
  find("a6").furthestIndex === 4 &&
    find("a6").outcome === "accepted" &&
    find("a6").closedFrom === "offer",
);
ok(
  "a7 never applied, so it has no funnel stage at all",
  find("a7").furthestIndex === -1,
);
ok(
  "a7's single segment is the wishlist it still sits in",
  find("a7").segments.length === 1 && find("a7").segments[0].stage === "wishlist",
);
ok("a8 ended withdrawn, out of applied", find("a8").outcome === "withdrawn");

/* ---- headline ---- */

const head = headline(timelines);
ok("7 of the 8 were actually sent", head.sent === 7);
// a4 and a5. a7 is on the wishlist and was never sent, so it is not "open".
ok("2 sent applications are still open", head.open === 2);
ok(
  "a never-sent wishlist row is not counted as open",
  head.open + head.rejected + head.withdrawn + head.accepted === head.sent,
);
ok("3 rejections", head.rejected === 3);
ok("1 withdrawal", head.withdrawn === 1);
ok("1 reached offer", head.offers === 1);
ok("1 accepted", head.accepted === 1);
// 4 of 7 sent got past `applied`: a1, a2, a5, a6.
ok("response rate is 57% (4 of 7)", head.responseRate === 57);
ok("rejection rate is 43% (3 of 7)", head.rejectionRate === 43);
ok("7 sent is still flagged as a thin sample", head.thin === true);

/* ---- where applications end ---- */

const fates = stageFates(timelines);
const fate = (stage: string) => fates.find((f) => f.stage === stage)!;

ok("fates cover the five funnel stages", fates.length === 5);
ok("all 7 sent applications reached `applied`", fate("applied").reached === 7);
ok(
  "applied: 4 moved on, 1 rejected, 1 withdrawn, 1 still there",
  fate("applied").movedOn === 4 &&
    fate("applied").rejected === 1 &&
    fate("applied").withdrawn === 1 &&
    fate("applied").live === 1,
);
ok(
  "every applied bar segment sums back to the arrivals",
  fate("applied").movedOn +
    fate("applied").rejected +
    fate("applied").withdrawn +
    fate("applied").accepted +
    fate("applied").live ===
    fate("applied").reached,
);
ok("4 reached screening", fate("screening").reached === 4);
ok(
  "screening: 2 moved on, 1 rejected, 1 live",
  fate("screening").movedOn === 2 &&
    fate("screening").rejected === 1 &&
    fate("screening").live === 1,
);
ok(
  "technical: 2 arrived, 1 rejected, 1 moved on",
  fate("technical").reached === 2 &&
    fate("technical").rejected === 1 &&
    fate("technical").movedOn === 1,
);
ok("offer: the one arrival was accepted", fate("offer").accepted === 1);
ok("nobody was rejected at the offer stage", fate("offer").rejected === 0);

/* ---- how long each stage takes ---- */

const durations = stageDurations(timelines, NOW);
const duration = (stage: string) => durations.find((d) => d.stage === stage)!;

// Completed `applied` waits: 10, 20, 5, 7, 10, 10 → sorted 5,7,10,10,10,20.
ok(
  "applied: 6 completed waits, a4's is still running",
  duration("applied").n === 6,
);
ok("applied: median wait is 10 days", duration("applied").medianDays === 10);
ok("applied: p25 of 7.75 days is reported as 7.8", duration("applied").p25 === 7.8);
ok("applied: p75 is 10 days", duration("applied").p75 === 10);
ok(
  "applied: longest completed wait is 20 days",
  duration("applied").longestDays === 20,
);
ok(
  "applied: a4 is the one still waiting, at 25 days",
  duration("applied").waitingNow === 1 &&
    duration("applied").waitingLongestDays === 25,
);
ok(
  "screening: 3 completed, median 10 days",
  duration("screening").n === 3 && duration("screening").medianDays === 10,
);
ok(
  "screening: a5 is waiting there now, 5 days in",
  duration("screening").waitingNow === 1 &&
    duration("screening").waitingLongestDays === 5,
);
ok(
  "onsite: one completed visit of 5 days",
  duration("onsite").n === 1 && duration("onsite").medianDays === 5,
);
ok(
  "a terminal stage is never counted as a wait",
  durations.every((d) => d.waitingNow >= 0) && duration("offer").waitingNow === 0,
);

/* ---- time to first reply ---- */

const response = responseTimes(timelines, NOW);
// a1 10, a2 20, a3 5, a5 7, a6 10. a8 withdrew, so no answer was ever owed.
ok("5 applications got a reply", response.n === 5);
ok("median reply takes 10 days", response.medianDays === 10);
ok(
  "buckets place 2 in 4-7d, 2 in 1-2w, 1 in 2-4w",
  response.buckets.find((b) => b.label === "4–7d")!.count === 2 &&
    response.buckets.find((b) => b.label === "1–2w")!.count === 2 &&
    response.buckets.find((b) => b.label === "2–4w")!.count === 1,
);
ok(
  "nothing landed in the 0-3d or 30d+ buckets",
  response.buckets.find((b) => b.label === "0–3d")!.count === 0 &&
    response.buckets.find((b) => b.label === "30d+")!.count === 0,
);
ok(
  "every reply is in exactly one bucket",
  response.buckets.reduce((sum, b) => sum + b.count, 0) === response.n,
);
ok("a4 counts as ghosted at 25 days of silence", response.ghosted === 1);
ok("a4 is the only one still waiting", response.stillWaiting === 1);
ok(
  "a withdrawal counts as neither answered nor waiting",
  response.n + response.stillWaiting === 6,
);
ok(
  "a3's rejection out of applied counts as an answer, at 5 days",
  answeredAt(find("a3")) === ago(25) && sentAt(find("a3")) === ago(30),
);
ok(
  "a8's withdrawal is not an answer",
  answeredAt(find("a8")) === null && sentAt(find("a8")) === ago(18),
);
ok("a7 was never sent", sentAt(find("a7")) === null);

/* ---- fit score against outcome ---- */

const fit = fitVersusOutcome(timelines);
ok("7 scored applications are plotted", fit.n === 7 && fit.points.length === 7);
ok(
  "a7 is excluded: it has no fit score and never entered the funnel",
  !fit.points.some((p) => p.id === "a7"),
);
// Advanced: 82, 61, 78, 90 → sorted 61,78,82,90 → median 80.
ok(
  "median fit of applications that got a reply is 80",
  fit.medianFitAdvanced === 80,
);
// Stalled: 45, 50, 55 → median 50.
ok("median fit of applications that stalled is 50", fit.medianFitStalled === 50);
ok(
  "each point carries the stage name matching its index",
  fit.points.find((p) => p.id === "a1")!.furthestStage === "technical",
);

/* ---- trend ---- */

const trend = outcomeTrend(timelines, 16, NOW);
ok("trend has one row per requested week", trend.length === 16);
ok(
  "trend weeks ascend in 7-day steps",
  trend.every(
    (row, index) =>
      index === 0 ||
      new Date(`${row.week}T00:00:00Z`).getTime() -
        new Date(`${trend[index - 1].week}T00:00:00Z`).getTime() ===
        7 * DAY,
  ),
);
ok(
  "every trend bucket starts on a Monday",
  trend.every((row) => new Date(`${row.week}T00:00:00Z`).getUTCDay() === 1),
);
ok(
  "all 7 sends fall inside the 16-week window",
  trend.reduce((sum, row) => sum + row.applied, 0) === 7,
);
ok(
  "all 3 rejections are in the window",
  trend.reduce((sum, row) => sum + row.rejected, 0) === 3,
);
ok(
  "4 first-replies are in the window",
  trend.reduce((sum, row) => sum + row.advanced, 0) === 4,
);

/* ---- breakdowns ---- */

const bySource = breakdown(timelines, "source");
ok(
  "two sources, manual first on volume",
  bySource.map((r) => r.key).join(",") === "manual,import",
);
ok("manual: 5 applications", bySource[0].n === 5);
ok(
  "manual: 2 got a reply → 40%",
  bySource[0].responded === 2 && bySource[0].responseRate === 40,
);
// a7 is an import-sourced wishlist row that was never sent. Counting it here
// would read as "3 sent" and drag the rate from 100% down to 67%.
ok(
  "a never-sent row is excluded from its slice",
  bySource[1].n === 2 && bySource[1].responded === 2,
);
ok(
  "and two is still too few to publish a rate for",
  bySource[1].responseRate === null,
);
ok(
  "every slice sums back to the number actually sent",
  bySource.reduce((sum, row) => sum + row.n, 0) === head.sent,
);

const bySeniority = breakdown(timelines, "seniority");
ok(
  "seniority ties are broken alphabetically",
  bySeniority.map((r) => r.key).join(",") === "senior,mid,junior,staff",
);
ok(
  "senior: 3 applications, 2 replies → 67%",
  bySeniority[0].n === 3 && bySeniority[0].responseRate === 67,
);
ok(
  "a single application gets no response rate at all",
  bySeniority[2].n === 1 && bySeniority[2].responseRate === null,
);
ok("MIN_FOR_RATE is the documented 3", MIN_FOR_RATE === 3);

/* ---- rejections ---- */

const rejected = rejections(timelines);
ok("3 rejections", rejected.total === 3);
ok("2 of them say why", rejected.withFeedback === 2);
ok("all 3 could be attributed to a stage", rejected.unattributed === 0);
ok(
  "rejections are newest first",
  rejected.items.map((r) => r.id).join(",") === "a2,a3,a1",
);
ok(
  "the feedback text survives intact",
  rejected.items.find((r) => r.id === "a1")!.note ===
    "Went with someone who had run Kafka at this scale.",
);
ok(
  "a rejection with no feedback reports null, not empty string",
  rejected.items.find((r) => r.id === "a2")!.note === null,
);

/* ---- edge cases, on their own fixtures ---- */

// A stage name that is not a stage. Event metadata is JSON written by several
// code paths; one bad row must not bend a whole axis.
const bogus = buildTimelines(
  [app("x1", "Nonesuch", { stage: "applied", appliedAt: ago(10) })],
  [
    {
      applicationId: "x1",
      from: "applied",
      to: "banana" as ApplicationStage,
      at: ago(5),
    },
  ],
);
ok(
  "an unrecognised stage in metadata is ignored, not plotted",
  bogus[0].segments.length === 1 && bogus[0].segments[0].stage === "applied",
);

// appliedAt edited to a date after the first recorded move.
const backdated = buildTimelines(
  [app("x2", "Backdate", { stage: "screening", appliedAt: ago(5) })],
  [{ applicationId: "x2", from: "applied", to: "screening", at: ago(20) }],
);
ok(
  "an appliedAt later than the first move cannot produce a negative wait",
  backdated[0].segments[0].enteredAt === ago(20) &&
    backdated[0].segments[0].leftAt === ago(20),
);
ok(
  "and no duration comes out below zero",
  stageDurations(backdated, NOW).every((d) => (d.medianDays ?? 0) >= 0),
);

// A move to the stage it is already in.
const redundant = buildTimelines(
  [app("x3", "Repeat", { stage: "screening", appliedAt: ago(30) })],
  [
    { applicationId: "x3", from: "applied", to: "screening", at: ago(20) },
    { applicationId: "x3", from: "screening", to: "screening", at: ago(10) },
  ],
);
ok(
  "a move to the current stage adds no zero-length segment",
  redundant[0].segments.length === 2,
);

// Rejected with no history at all: nothing to attribute it to.
const orphan = buildTimelines(
  [app("x4", "Orphan", { stage: "rejected", appliedAt: ago(40) })],
  [],
);
ok(
  "a rejection with no recorded moves is counted but left unattributed",
  rejections(orphan).total === 1 && rejections(orphan).unattributed === 1,
);
ok(
  "an unattributed rejection is not charged to a stage it may never have reached",
  stageFates(orphan).every((f) => f.rejected === 0),
);

// Revisiting a stage must not double-count the application.
const revisit = buildTimelines(
  [app("x5", "Loop", { stage: "rejected", appliedAt: ago(60) })],
  [
    { applicationId: "x5", from: "applied", to: "screening", at: ago(50) },
    { applicationId: "x5", from: "screening", to: "technical", at: ago(40) },
    { applicationId: "x5", from: "technical", to: "screening", at: ago(30) },
    { applicationId: "x5", from: "screening", to: "rejected", at: ago(20) },
  ],
);
const revisitFates = stageFates(revisit);
ok(
  "a stage visited twice counts the application once",
  revisitFates.find((f) => f.stage === "screening")!.reached === 1,
);
ok(
  "and is judged by its last visit, which ended in rejection",
  revisitFates.find((f) => f.stage === "screening")!.rejected === 1 &&
    revisitFates.find((f) => f.stage === "screening")!.movedOn === 0,
);
ok(
  "both of its screening waits still feed the duration median",
  stageDurations(revisit, NOW).find((d) => d.stage === "screening")!.n === 2,
);

/* ---- stage jumps: wishlist straight to a later round ---- */

/*
 * Alfred allows a stage to be skipped, and the seed script does exactly this:
 * it creates everything in `wishlist` and moves it in one hop. An application
 * referred straight into a technical round therefore has an `appliedAt` but no
 * `applied` segment at all, and an earlier version of this file keyed "was it
 * sent" off that segment — which filed every such application under never-sent
 * and dropped it out of every rate on the page.
 */
const jumped = buildTimelines(
  [
    app("j1", "Leapfrog", {
      stage: "technical",
      appliedAt: ago(21),
      fitScore: 88,
    }),
  ],
  [{ applicationId: "j1", from: "wishlist", to: "technical", at: ago(14) }],
);
ok(
  "an application that skipped `applied` still counts as sent",
  sentAt(jumped[0]) === ago(21) && headline(jumped).sent === 1,
);
ok(
  "its reply is dated from the stage it jumped to",
  answeredAt(jumped[0]) === ago(14),
);
ok(
  "so its response lag is 7 days, not zero and not missing",
  responseTimes(jumped, NOW).n === 1 && responseTimes(jumped, NOW).medianDays === 7,
);
ok(
  "it is credited to the technical stage it actually reached",
  stageFates(jumped).find((f) => f.stage === "technical")!.reached === 1,
);
ok(
  "and not credited to the `applied` stage it never entered",
  stageFates(jumped).find((f) => f.stage === "applied")!.reached === 0,
);
ok(
  "its send still lands in the weekly trend",
  outcomeTrend(jumped, 16, NOW).reduce((sum, row) => sum + row.applied, 0) === 1,
);

/* ---- helpers ---- */

ok("quantile of an empty set is null", quantile([], 0.5) === null);
ok("quantile of one value is that value", quantile([7], 0.5) === 7);
ok("median of an even set interpolates", quantile([1, 2, 3, 4], 0.5) === 2.5);
ok("p25 interpolates linearly", quantile([0, 10, 20, 30], 0.25) === 7.5);

ok(
  "weekStart on a Monday is that same Monday",
  weekStart(Date.UTC(2026, 2, 9)) === Date.UTC(2026, 2, 9),
);
ok(
  "weekStart on the following Sunday is still that Monday",
  weekStart(Date.UTC(2026, 2, 15)) === Date.UTC(2026, 2, 9),
);
ok(
  "weekStart on the next Monday rolls over",
  weekStart(Date.UTC(2026, 2, 16)) === Date.UTC(2026, 2, 16),
);
ok(
  "weekStart ignores the time of day",
  weekStart(Date.UTC(2026, 2, 12, 23, 59)) === Date.UTC(2026, 2, 9),
);

/* ---- an empty account must not throw or invent ---- */

const none = buildTimelines([], []);
const emptyHead = headline(none);
ok("an empty account has no sends", emptyHead.sent === 0);
ok("and no response rate rather than 0%", emptyHead.responseRate === null);
ok("fates still return a row per stage", stageFates(none).length === 5);
ok(
  "durations report null medians, not zero",
  stageDurations(none, NOW).every((d) => d.medianDays === null),
);
ok("response median is null", responseTimes(none, NOW).medianDays === null);
ok("nothing is reported as ghosted", responseTimes(none, NOW).ghosted === 0);
ok(
  "trend still returns its full window",
  outcomeTrend(none, 16, NOW).length === 16,
);
ok(
  "breakdowns are empty rather than a phantom row",
  breakdown(none, "source").length === 0,
);
ok("no rejections", rejections(none).total === 0);

let failed = 0;
for (const [label, pass] of checks) {
  if (!pass) failed++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}`);
}
console.log(
  failed
    ? `\n${failed} of ${checks.length} analytics check(s) failed`
    : `\nall ${checks.length} analytics checks pass`,
);
if (failed) process.exit(1);
