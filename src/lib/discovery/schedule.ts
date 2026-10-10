import "server-only";
import { accountsWithActiveSearches, runDiscovery } from "./run";

/*
 * The daily scan.
 *
 * A timer inside the server process rather than an external cron, because
 * Alfred is one self-hosted container: a cron would be a second thing to
 * install, configure and keep in sync with the app, and it would not exist on
 * someone else's machine. `POST /api/discovery/run` is still there for anyone
 * who would rather drive it from outside.
 *
 * What makes this safe to do in-process:
 *
 *   - `register()` must COMPLETE before the server accepts requests, so this
 *     only ever schedules. Running a scan there would delay every boot by the
 *     length of a scan.
 *   - The timer is unref'd, so it never holds the process open on shutdown.
 *   - One run at a time, guarded by a flag. Ticks are frequent and a scan is
 *     slow; overlapping runs would hit every board twice.
 *   - Due-ness is derived from `jobSearches.lastRunAt`, not from a stored
 *     schedule. There is no clock state to drift, get stale on restore, or
 *     disagree with what the searches themselves say.
 *
 * ON MORE THAN ONE PROCESS
 *
 * `register()` runs once per server instance, and `next dev` demonstrably runs
 * it twice. So two timers can exist and both can decide a sweep is due at the
 * same moment, because the due check is a read rather than a claim.
 *
 * That is left alone deliberately. The cost is fetching the same boards twice
 * in a day; the unique index on (user, source, sourceRef) means nothing
 * duplicates in storage. Turning the check into a claim — writing lastRunAt
 * before running — would close the race but strand a FAILED sweep for twenty
 * hours instead of retrying on the next tick, and a wasted fetch is cheaper
 * than a missed day.
 */

/** How often to ask whether anything is due. Cheap: one indexed query. */
const TICK_MS = 15 * 60 * 1000;
/**
 * Due after this long rather than a strict 24h, so a daily cadence does not
 * creep later every day by however long the previous run took.
 */
const DUE_AFTER_MS = 20 * 60 * 60 * 1000;
/** Let the app finish booting — and migrating — before the first tick. */
const FIRST_TICK_MS = 2 * 60 * 1000;

let started = false;
let running = false;

/**
 * Whether the schedule should run at all.
 *
 * Off in development by default: `next dev` restarts constantly, and each
 * restart would otherwise fetch every watched board again. Set
 * ALFRED_DISCOVERY_SCHEDULE=1 to try it locally, or =0 to turn it off in
 * production.
 */
function enabled(): boolean {
  const flag = process.env.ALFRED_DISCOVERY_SCHEDULE;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const { db } = await import("@/db");
    const { jobSearches } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");

    for (const userId of accountsWithActiveSearches()) {
      const searches = db
        .select({ lastRunAt: jobSearches.lastRunAt })
        .from(jobSearches)
        .where(and(eq(jobSearches.userId, userId), eq(jobSearches.active, true)))
        .all();

      // Due when anything active has not run inside the window — including a
      // search added since the last sweep, which has never run at all.
      const due = searches.some(
        (row) =>
          !row.lastRunAt || Date.now() - row.lastRunAt.getTime() >= DUE_AFTER_MS,
      );
      if (!due) continue;

      const report = await runDiscovery(userId);
      console.log(
        `[alfred] discovery: ${report.added} new posting(s) across ${report.searches.length} search(es)` +
          (report.errors.length
            ? ` · ${report.errors.length} source error(s)`
            : ""),
      );
    }
  } catch (error) {
    // A failed sweep must never take the server with it. The next tick retries.
    console.error("[alfred] discovery sweep failed:", error);
  } finally {
    running = false;
  }
}

export function startDiscoverySchedule() {
  if (started) return;
  started = true;

  if (!enabled()) {
    console.log(
      "[alfred] discovery schedule off (set ALFRED_DISCOVERY_SCHEDULE=1 to enable)",
    );
    return;
  }

  const first = setTimeout(() => void tick(), FIRST_TICK_MS);
  const timer = setInterval(() => void tick(), TICK_MS);
  // Neither timer should keep the process alive at shutdown.
  first.unref?.();
  timer.unref?.();

  console.log(
    `[alfred] discovery schedule on — checking every ${TICK_MS / 60000} minutes, scanning when a search is ${DUE_AFTER_MS / 3600000}h stale`,
  );
}
