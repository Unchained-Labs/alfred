import {
  APPLICATION_STAGES,
  type ApplicationStage,
  TERMINAL_STAGES,
} from "@/db/schema";
import { FUNNEL_STAGES } from "@/lib/stages";

/*
 * Every aggregation on the Analytics page, as pure functions over plain rows.
 *
 * No database import, by design. These functions answer questions like "where
 * do applications die" and "how long does a screening sit before anyone
 * replies", and the answers are easy to get subtly wrong — an off-by-one in
 * stage attribution reports that you keep losing at the technical round when
 * really you never reach it. That class of bug is invisible in the UI, because
 * a wrong number renders exactly as confidently as a right one. Keeping the
 * arithmetic here means `npm run check:analytics` can assert it against
 * hand-built fixtures with known answers.
 *
 * Two rules run through all of it:
 *
 *   1. Never invent precision. A median over two observations is reported with
 *      its n so the reader can discount it, and a rate over fewer than
 *      MIN_FOR_RATE applications is returned as null rather than as a
 *      confident-looking percentage.
 *   2. Never attribute what is not recorded. An application closed without a
 *      stage history is counted as "stage unknown", not quietly folded into
 *      whichever stage it happened to be in.
 */

const DAY = 86_400_000;

/** Below this, a percentage says more about the sample than about the hunt. */
export const MIN_FOR_RATE = 3;

const VALID_STAGES = new Set<string>(APPLICATION_STAGES);
const TERMINAL = new Set<string>(TERMINAL_STAGES);

/** An application, flattened to the fields these aggregations read. */
export type AppRow = {
  id: string;
  company: string;
  title: string;
  stage: ApplicationStage;
  source: string;
  seniority: string | null;
  workMode: string | null;
  /** Epoch ms. Null for anything never actually sent. */
  appliedAt: number | null;
  createdAt: number;
  outcomeNote: string | null;
  /** From the most recent analysis, when one has been run. */
  fitScore: number | null;
};

/** One recorded stage move, from the timeline events. */
export type StageChangeRow = {
  applicationId: string;
  from: ApplicationStage | null;
  to: ApplicationStage | null;
  at: number;
};

/** A contiguous period an application spent in a single stage. */
export type Segment = {
  stage: ApplicationStage;
  enteredAt: number;
  /** Null while the application is still sitting here. */
  leftAt: number | null;
  /** Where it went next; null when it has not moved since. */
  nextStage: ApplicationStage | null;
};

export type Timeline = {
  app: AppRow;
  segments: Segment[];
  /** Index into FUNNEL_STAGES of the furthest funnel stage reached, or -1. */
  furthestIndex: number;
  /** The terminal stage it ended in, or null while it is still open. */
  outcome: ApplicationStage | null;
  /** The stage it sat in immediately before closing. Null when unrecorded. */
  closedFrom: ApplicationStage | null;
  /** When it closed, epoch ms. Null while open. */
  closedAt: number | null;
};

const stageOf = (value: ApplicationStage | null): ApplicationStage | null =>
  value && VALID_STAGES.has(value) ? value : null;

const funnelIndex = (stage: ApplicationStage) => FUNNEL_STAGES.indexOf(stage);

const days = (ms: number) => ms / DAY;

/**
 * Reconstructs each application's stage history from its recorded moves.
 *
 * Everything else on the page is derived from this, so it is deliberately
 * conservative about what it infers. In particular the opening stage comes
 * from the first move's `from` rather than being assumed, because an
 * application created straight into `applied` never emits a move out of
 * `wishlist` and assuming one would invent a stage it was never in.
 */
export function buildTimelines(
  apps: AppRow[],
  changes: StageChangeRow[],
): Timeline[] {
  const byApp = new Map<string, StageChangeRow[]>();
  for (const change of changes) {
    // Stage names reach us through event metadata, which is JSON written by
    // several code paths. An unrecognised value is dropped rather than trusted
    // into a stage axis it would silently distort.
    if (!stageOf(change.to)) continue;
    const list = byApp.get(change.applicationId);
    if (list) list.push(change);
    else byApp.set(change.applicationId, [change]);
  }
  for (const list of byApp.values()) list.sort((a, b) => a.at - b.at);

  return apps.map((app) => {
    const history = byApp.get(app.id) ?? [];
    const first = history[0];
    const openingStage = stageOf(first?.from ?? null) ?? app.stage;

    /*
     * The clock starts when the application was sent, falling back to when the
     * row was created for anything still unsent. The earliest of the two wins:
     * an `appliedAt` later edited to a date after the first recorded move would
     * otherwise yield a negative duration, which would then poison a median.
     */
    const opened = app.appliedAt ?? app.createdAt;
    const openedAt = first ? Math.min(opened, first.at) : opened;

    const segments: Segment[] = [];
    let stage = openingStage;
    let enteredAt = openedAt;
    for (const change of history) {
      const next = stageOf(change.to)!;
      // A move recorded as going where it already is carries no information
      // and would otherwise create a zero-length segment.
      if (next === stage) continue;
      segments.push({ stage, enteredAt, leftAt: change.at, nextStage: next });
      stage = next;
      enteredAt = change.at;
    }
    segments.push({ stage, enteredAt, leftAt: null, nextStage: null });

    let furthestIndex = -1;
    for (const segment of segments) {
      const index = funnelIndex(segment.stage);
      if (index > furthestIndex) furthestIndex = index;
    }

    const last = segments[segments.length - 1];
    const closed = TERMINAL.has(last.stage);
    const previous = segments.length > 1 ? segments[segments.length - 2] : null;

    return {
      app,
      segments,
      furthestIndex,
      outcome: closed ? last.stage : null,
      // With no move on record there is nothing to attribute the close to, and
      // guessing would be worse than admitting it.
      closedFrom: closed ? (previous?.stage ?? null) : null,
      closedAt: closed ? last.enteredAt : null,
    };
  });
}

/*
 * Arriving here means the company came back to you. Withdrawing does not: you
 * closed it, so no answer was ever owed, and counting it as one would both
 * invent a reply and remove the application from the silence it belongs in.
 */
const ANSWERED_TERMINALS = new Set<string>(["rejected", "accepted"]);

/**
 * When the application was sent, or null if it never was.
 *
 * `appliedAt` first, because it is the only field a person sets deliberately.
 * The fallback matters more than it looks: Alfred allows stage jumps, so a
 * referral can go straight from wishlist to onsite and never pass through
 * `applied` at all. Keying "was this sent" off an `applied` segment would file
 * those under never-sent and quietly drop them out of every rate on the page.
 */
export function sentAt(timeline: Timeline): number | null {
  if (timeline.app.appliedAt != null) return timeline.app.appliedAt;
  const entered = timeline.segments.find(
    (segment) => funnelIndex(segment.stage) >= 0,
  );
  return entered?.enteredAt ?? null;
}

/**
 * True when the application's own record opens past `applied`.
 *
 * Happens whenever a job is added to Alfred mid-process — you were already in
 * a screening when you started tracking it. The reply then predates the record
 * entirely, so its lag is unknown rather than zero, and treating the opening
 * segment as the moment of reply would report a 0-day response for an
 * application nobody ever watched waiting.
 */
export function replyPredatesRecord(timeline: Timeline): boolean {
  const first = timeline.segments[0];
  if (!first) return false;
  return funnelIndex(first.stage) > FUNNEL_STAGES.indexOf("applied");
}

/**
 * When the company first answered, or null when that is not knowable.
 *
 * A rejection counts. The useful distinction is answered versus ignored, not
 * good news versus bad — and a pipeline where every reply is a rejection still
 * tells you your CV is landing, which is a different problem from silence.
 *
 * Null covers two different situations, and the caller has to tell them apart:
 * still waiting, and answered before the record began. See
 * `replyPredatesRecord`.
 */
export function answeredAt(timeline: Timeline): number | null {
  if (replyPredatesRecord(timeline)) return null;
  const pastApplied = FUNNEL_STAGES.indexOf("applied") + 1;
  // Segments are chronological, so the first match is the earliest.
  for (const segment of timeline.segments) {
    if (funnelIndex(segment.stage) >= pastApplied) return segment.enteredAt;
    if (ANSWERED_TERMINALS.has(segment.stage)) return segment.enteredAt;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Where applications end
 * ------------------------------------------------------------------ */

export type StageFate = {
  stage: ApplicationStage;
  /** Applications that were in this stage at some point. */
  reached: number;
  movedOn: number;
  rejected: number;
  withdrawn: number;
  accepted: number;
  /** Sitting here right now. */
  live: number;
};

/**
 * For each funnel stage, what became of the applications that reached it.
 *
 * This is the question the conversion funnel cannot answer. A funnel shows
 * survivors, so a stage with few arrivals looks the same whether you are
 * being rejected there or simply never getting that far. Splitting each
 * stage's arrivals into moved on / rejected / withdrawn / still open names the
 * step that is actually costing you.
 *
 * An application that visited a stage more than once is counted once, by the
 * fate of its last visit: the reader is counting applications, and a bar whose
 * segments sum to more than the number of applications is a bar that lies.
 */
export function stageFates(timelines: Timeline[]): StageFate[] {
  return FUNNEL_STAGES.map((stage) => {
    const fate: StageFate = {
      stage,
      reached: 0,
      movedOn: 0,
      rejected: 0,
      withdrawn: 0,
      accepted: 0,
      live: 0,
    };

    for (const timeline of timelines) {
      let last: Segment | null = null;
      for (const segment of timeline.segments) {
        if (segment.stage === stage) last = segment;
      }
      if (!last) continue;

      fate.reached++;
      const next = last.nextStage;
      if (!next) fate.live++;
      else if (next === "rejected") fate.rejected++;
      else if (next === "withdrawn") fate.withdrawn++;
      else if (next === "accepted") fate.accepted++;
      // Includes the rare backward move, which is why the series is named
      // "moved on" rather than "advanced".
      else fate.movedOn++;
    }

    return fate;
  });
}

/* ------------------------------------------------------------------ *
 * How long each stage takes
 * ------------------------------------------------------------------ */

export type StageDuration = {
  stage: ApplicationStage;
  /** Completed visits only — the basis of every figure on this row. */
  n: number;
  medianDays: number | null;
  p25: number | null;
  p75: number | null;
  longestDays: number | null;
  /** Applications sitting in this stage right now. */
  waitingNow: number;
  /** How long the longest of those has been waiting. */
  waitingLongestDays: number | null;
};

/** Linear-interpolated quantile over an ascending array. */
export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

const round1 = (value: number | null) =>
  value == null ? null : Math.round(value * 10) / 10;

/**
 * Time spent in each stage.
 *
 * Only *completed* visits feed the median. The stage an application is sitting
 * in right now is right-censored — you know it has waited eight days, not how
 * long it will wait — and folding those into the same average would drag every
 * number toward whatever happens to be in flight today. They are reported
 * separately, as a wait, which is also the more actionable framing: it is the
 * thing you can still do something about.
 */
export function stageDurations(
  timelines: Timeline[],
  now: number,
): StageDuration[] {
  const completed = new Map<ApplicationStage, number[]>();
  const waiting = new Map<ApplicationStage, number[]>();

  for (const timeline of timelines) {
    for (const segment of timeline.segments) {
      if (segment.leftAt == null) {
        // A closed application's terminal stage is not a wait.
        if (TERMINAL.has(segment.stage)) continue;
        const list = waiting.get(segment.stage) ?? [];
        list.push(Math.max(0, days(now - segment.enteredAt)));
        waiting.set(segment.stage, list);
        continue;
      }
      const list = completed.get(segment.stage) ?? [];
      list.push(Math.max(0, days(segment.leftAt - segment.enteredAt)));
      completed.set(segment.stage, list);
    }
  }

  return FUNNEL_STAGES.map((stage) => {
    const done = (completed.get(stage) ?? []).slice().sort((a, b) => a - b);
    const open = waiting.get(stage) ?? [];
    return {
      stage,
      n: done.length,
      medianDays: round1(quantile(done, 0.5)),
      p25: round1(quantile(done, 0.25)),
      p75: round1(quantile(done, 0.75)),
      longestDays: done.length ? round1(done[done.length - 1]) : null,
      waitingNow: open.length,
      waitingLongestDays: open.length ? round1(Math.max(...open)) : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Time to first reply
 * ------------------------------------------------------------------ */

export type ResponseBucket = { label: string; count: number };

export type ResponseTimes = {
  buckets: ResponseBucket[];
  medianDays: number | null;
  /** Applications that got any reply at all. */
  n: number;
  /** Sent, never moved, and past the silence threshold. */
  ghosted: number;
  ghostedAfterDays: number;
  /** Sent and still waiting, including the ones that are merely recent. */
  stillWaiting: number;
  /**
   * Added to Alfred mid-process, so the reply happened before the record did.
   * Counted here rather than folded into either of the above: as a reply it
   * would be a 0-day one, and as a wait it would be a wait that already ended.
   */
  unobservable: number;
};

const RESPONSE_BUCKETS: { label: string; upTo: number }[] = [
  { label: "0–3d", upTo: 3 },
  { label: "4–7d", upTo: 7 },
  { label: "1–2w", upTo: 14 },
  { label: "2–4w", upTo: 30 },
  { label: "30d+", upTo: Infinity },
];

/**
 * How long a reply takes once an application is sent.
 *
 * A rejection counts as a reply, because it is one. The useful distinction is
 * not good news versus bad, it is answered versus ignored — and the companies
 * that never answer are counted separately rather than being left out, since
 * dropping them would make the median look far better than the experience.
 */
export function responseTimes(
  timelines: Timeline[],
  now: number,
  ghostedAfterDays = 21,
): ResponseTimes {
  const observed: number[] = [];
  let ghosted = 0;
  let stillWaiting = 0;
  let unobservable = 0;

  for (const timeline of timelines) {
    const sent = sentAt(timeline);
    if (sent == null) continue;

    if (replyPredatesRecord(timeline)) {
      unobservable++;
      continue;
    }

    const answered = answeredAt(timeline);
    if (answered == null) {
      // Withdrawn is neither answered nor waiting — it is off the table.
      if (timeline.outcome === "withdrawn") continue;
      stillWaiting++;
      if (days(now - sent) >= ghostedAfterDays) ghosted++;
      continue;
    }
    observed.push(Math.max(0, days(answered - sent)));
  }

  const sorted = observed.slice().sort((a, b) => a - b);
  const buckets: ResponseBucket[] = RESPONSE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
  }));
  for (const value of observed) {
    const index = RESPONSE_BUCKETS.findIndex((bucket) => value <= bucket.upTo);
    buckets[index === -1 ? buckets.length - 1 : index].count++;
  }

  return {
    buckets,
    medianDays: round1(quantile(sorted, 0.5)),
    n: observed.length,
    ghosted,
    ghostedAfterDays,
    stillWaiting,
    unobservable,
  };
}

/* ------------------------------------------------------------------ *
 * Does the fit score predict anything?
 * ------------------------------------------------------------------ */

export type FitPoint = {
  id: string;
  company: string;
  title: string;
  fitScore: number;
  /** Index into FUNNEL_STAGES, so the y axis reads as progress. */
  furthestIndex: number;
  furthestStage: ApplicationStage;
  outcome: ApplicationStage | null;
};

export type FitVersusOutcome = {
  points: FitPoint[];
  /** Median fit of applications that got past the first reply. */
  medianFitAdvanced: number | null;
  /** Median fit of applications that never got past `applied`. */
  medianFitStalled: number | null;
  n: number;
};

/**
 * Fit score against how far the application actually went.
 *
 * This is the one panel that grades Alfred rather than the job hunt. The fit
 * score is generated before anyone has replied, so if the two medians never
 * separate, the score is decoration and should be treated as such.
 */
export function fitVersusOutcome(timelines: Timeline[]): FitVersusOutcome {
  const screening = FUNNEL_STAGES.indexOf("screening");
  const points: FitPoint[] = [];
  const advanced: number[] = [];
  const stalled: number[] = [];

  for (const timeline of timelines) {
    const { fitScore } = timeline.app;
    if (fitScore == null) continue;
    if (timeline.furthestIndex < 0) continue;

    points.push({
      id: timeline.app.id,
      company: timeline.app.company,
      title: timeline.app.title,
      fitScore,
      furthestIndex: timeline.furthestIndex,
      furthestStage: FUNNEL_STAGES[timeline.furthestIndex],
      outcome: timeline.outcome,
    });

    if (timeline.furthestIndex >= screening) advanced.push(fitScore);
    else stalled.push(fitScore);
  }

  return {
    points,
    medianFitAdvanced: round1(
      quantile(
        advanced.slice().sort((a, b) => a - b),
        0.5,
      ),
    ),
    medianFitStalled: round1(
      quantile(
        stalled.slice().sort((a, b) => a - b),
        0.5,
      ),
    ),
    n: points.length,
  };
}

/* ------------------------------------------------------------------ *
 * Volume and outcomes over time
 * ------------------------------------------------------------------ */

export type TrendWeek = {
  /** ISO date of the Monday starting this week. */
  week: string;
  applied: number;
  advanced: number;
  rejected: number;
};

/** The Monday of the week containing `at`, as an epoch-ms timestamp (UTC). */
export function weekStart(at: number): number {
  const date = new Date(at);
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  // getUTCDay is 0 for Sunday, which belongs to the week that began six days
  // earlier rather than starting a new one.
  const weekday = new Date(utc).getUTCDay();
  const offset = (weekday + 6) % 7;
  return utc - offset * DAY;
}

/**
 * Applications sent, replies won and rejections taken, by week.
 *
 * Three counts on one time axis, because the interesting pattern is the lag
 * between them: a burst of applications followed three weeks later by a burst
 * of rejections is a story that neither series tells alone.
 */
export function outcomeTrend(
  timelines: Timeline[],
  weeks: number,
  now: number,
): TrendWeek[] {
  const screening = FUNNEL_STAGES.indexOf("screening");
  const latest = weekStart(now);
  const earliest = latest - (weeks - 1) * 7 * DAY;

  const byWeek = new Map<number, TrendWeek>();
  for (let index = 0; index < weeks; index++) {
    const start = earliest + index * 7 * DAY;
    byWeek.set(start, {
      week: new Date(start).toISOString().slice(0, 10),
      applied: 0,
      advanced: 0,
      rejected: 0,
    });
  }

  const bump = (at: number | null, key: keyof Omit<TrendWeek, "week">) => {
    if (at == null) return;
    const start = weekStart(at);
    if (start < earliest || start > latest) return;
    const row = byWeek.get(start);
    if (row) row[key]++;
  };

  for (const timeline of timelines) {
    bump(sentAt(timeline), "applied");

    const firstAdvance = timeline.segments.find(
      (segment) => funnelIndex(segment.stage) >= screening,
    );
    bump(firstAdvance?.enteredAt ?? null, "advanced");

    if (timeline.outcome === "rejected") bump(timeline.closedAt, "rejected");
  }

  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

/* ------------------------------------------------------------------ *
 * Breakdowns
 * ------------------------------------------------------------------ */

export type BreakdownRow = {
  key: string;
  n: number;
  /** Got past `applied`. */
  responded: number;
  rejected: number;
  offers: number;
  /** Null below MIN_FOR_RATE, where a percentage would be noise. */
  responseRate: number | null;
};

export type BreakdownDimension = "source" | "seniority" | "workMode";

/**
 * Response rate sliced by one attribute of the application.
 *
 * The rate is withheld below MIN_FOR_RATE rather than shown with a caveat.
 * "100% response rate" over one application is not a weak finding, it is a
 * sentence with no content, and rendering it next to a real rate invites the
 * exact comparison it cannot support.
 *
 * Only sent applications are counted. A wishlist row cannot have been replied
 * to, so including it would inflate the denominator and quietly push the rate
 * down — and the row is labelled "n sent", which would then be false.
 */
export function breakdown(
  timelines: Timeline[],
  dimension: BreakdownDimension,
): BreakdownRow[] {
  const screening = FUNNEL_STAGES.indexOf("screening");
  const rows = new Map<string, BreakdownRow>();

  for (const timeline of timelines) {
    if (sentAt(timeline) == null) continue;
    const raw = timeline.app[dimension];
    const key = (typeof raw === "string" ? raw.trim() : "") || "Unspecified";
    const row = rows.get(key) ?? {
      key,
      n: 0,
      responded: 0,
      rejected: 0,
      offers: 0,
      responseRate: null,
    };
    row.n++;
    if (timeline.furthestIndex >= screening) row.responded++;
    if (timeline.outcome === "rejected") row.rejected++;
    if (timeline.furthestIndex >= FUNNEL_STAGES.indexOf("offer")) row.offers++;
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      responseRate:
        row.n >= MIN_FOR_RATE ? Math.round((row.responded / row.n) * 100) : null,
    }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/* ------------------------------------------------------------------ *
 * What they said
 * ------------------------------------------------------------------ */

export type RejectionRow = {
  id: string;
  company: string;
  title: string;
  /** The stage it was rejected from, null when no history was recorded. */
  closedFrom: ApplicationStage | null;
  at: number | null;
  note: string | null;
};

export type RejectionSummary = {
  total: number;
  withFeedback: number;
  /** Rejections whose stage could not be attributed from the history. */
  unattributed: number;
  items: RejectionRow[];
};

/**
 * Every rejection, newest first, with whatever the company said.
 *
 * Feedback is the only outside signal in the whole record — everything else on
 * this page is Alfred measuring itself — so the coverage figure matters as much
 * as the text: it says how often you are actually asking.
 */
export function rejections(timelines: Timeline[]): RejectionSummary {
  const items: RejectionRow[] = [];
  let unattributed = 0;

  for (const timeline of timelines) {
    if (timeline.outcome !== "rejected") continue;
    if (!timeline.closedFrom) unattributed++;
    items.push({
      id: timeline.app.id,
      company: timeline.app.company,
      title: timeline.app.title,
      closedFrom: timeline.closedFrom,
      at: timeline.closedAt,
      note: timeline.app.outcomeNote?.trim() || null,
    });
  }

  items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  return {
    total: items.length,
    withFeedback: items.filter((item) => item.note).length,
    unattributed,
    items,
  };
}

/* ------------------------------------------------------------------ *
 * Headline
 * ------------------------------------------------------------------ */

export type AnalyticsHeadline = {
  /** Applications actually sent — the denominator for every rate here. */
  sent: number;
  /** Sent and not yet closed. Never-sent wishlist rows are not "open". */
  open: number;
  rejected: number;
  withdrawn: number;
  offers: number;
  accepted: number;
  /** Share of sent applications that got any reply. */
  responseRate: number | null;
  /** Share of sent applications that ended in a rejection. */
  rejectionRate: number | null;
  /** True when the sample is too small for the page to mean much. */
  thin: boolean;
};

export function headline(timelines: Timeline[]): AnalyticsHeadline {
  const screening = FUNNEL_STAGES.indexOf("screening");
  const sentTimelines = timelines.filter((timeline) => sentAt(timeline) !== null);
  const sent = sentTimelines.length;
  const responded = sentTimelines.filter(
    (timeline) => timeline.furthestIndex >= screening,
  ).length;
  const rejected = timelines.filter(
    (timeline) => timeline.outcome === "rejected",
  ).length;

  return {
    sent,
    open: sentTimelines.filter((timeline) => timeline.outcome === null).length,
    rejected,
    withdrawn: timelines.filter((timeline) => timeline.outcome === "withdrawn")
      .length,
    offers: timelines.filter(
      (timeline) => timeline.furthestIndex >= FUNNEL_STAGES.indexOf("offer"),
    ).length,
    accepted: timelines.filter((timeline) => timeline.outcome === "accepted")
      .length,
    responseRate:
      sent >= MIN_FOR_RATE ? Math.round((responded / sent) * 100) : null,
    rejectionRate:
      sent >= MIN_FOR_RATE ? Math.round((rejected / sent) * 100) : null,
    thin: sent < 8,
  };
}
