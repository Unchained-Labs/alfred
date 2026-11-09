/*
 * The AI job queue, asserted against a scratch database.
 *
 * The queue decides what runs, when, and whether a failure is tried again —
 * and every one of those decisions is invisible when it is wrong: a job that
 * is never claimed looks exactly like a job that is merely queued, and a retry
 * loop on a signed-out provider looks like a slow one. So the claim order,
 * dependency gating, backoff, dedupe, crash recovery and cancellation are all
 * pinned here, with a fake handler in place of any provider. Nothing in this
 * file calls an AI.
 *
 *   npm run check:queue
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The database module opens its file on import, so the scratch path has to be
// in the environment before anything imports it — hence the dynamic imports.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alfred-queue-"));
process.env.ALFRED_DB_PATH = path.join(dir, "check.db");
process.env.ALFRED_AI_CONCURRENCY = "1";
process.env.ANTHROPIC_API_KEY = "check-queue-placeholder";

const checks: [string, boolean][] = [];
const ok = (label: string, pass: boolean) => checks.push([label, pass]);

async function main() {
  const { runMigrations } = await import("@/db/migrate");
  runMigrations();
  const { db } = await import("@/db");
  const { aiJobs, users } = await import("@/db/schema");
  const q = await import("@/lib/jobs/queue");
  const w = await import("@/lib/jobs/worker");
  const { AiError, AiNotConfiguredError } = await import("@/lib/ai/types");
  const { createApplication } = await import("@/lib/mutations");
  const { queueApplicationPipeline, MIN_POSTING_CHARS } =
    await import("@/lib/jobs/pipeline");
  const { eq } = await import("drizzle-orm");

  const user = db
    .insert(users)
    .values({ email: "queue-check@example.test", name: "Check" })
    .returning()
    .get();
  const uid = user.id;
  const T0 = new Date("2030-01-01T00:00:00Z");
  const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
  const reset = () => db.delete(aiJobs).run();
  const job = (input: Partial<Parameters<typeof q.enqueue>[0]> = {}) =>
    q.enqueue({ userId: uid, kind: "analysis", runAfter: T0, ...input });

  /* ---------- dedupe ---------- */
  reset();
  const a1 = job({ dedupeKey: "analysis:x" });
  const a2 = job({ dedupeKey: "analysis:x" });
  ok("same key while pending → the same job", a1.id === a2.id);
  q.claim("background", at(1));
  const a3 = job({ dedupeKey: "analysis:x" });
  ok("still deduped while running", a3.id === a1.id);
  q.succeed(a1.id, { fitScore: 1 }, at(2));
  const a4 = job({ dedupeKey: "analysis:x" });
  ok("a finished job does not block a new one", a4.id !== a1.id);

  /* ---------- claim order and lanes ---------- */
  reset();
  const low = job({ priority: 9, label: "low" });
  const high = job({ priority: 1, label: "high" });
  const inter = job({ lane: "interactive", priority: 0, label: "inter" });
  ok(
    "lower priority number runs first",
    q.claim("background", at(1))?.id === high.id,
  );
  ok("then the next", q.claim("background", at(1))?.id === low.id);
  ok(
    "background never takes an interactive job",
    q.claim("background", at(1)) === null,
  );
  ok("the interactive lane does", q.claim("interactive", at(1))?.id === inter.id);
  const future = job({ runAfter: at(60) });
  ok("not before runAfter", q.claim("background", at(30)) === null);
  ok("due at runAfter", q.claim("background", at(60))?.id === future.id);

  /* ---------- dependencies ---------- */
  reset();
  const first = job({ label: "first" });
  const second = job({ dependsOn: [first.id], priority: 0, label: "second" });
  ok(
    "a dependent is skipped even at higher priority",
    q.claim("background", at(1))?.id === first.id,
  );
  ok(
    "and not claimable while its dependency runs",
    q.claim("background", at(1)) === null,
  );
  q.fail(first.id, "boom", { permanent: true }, at(2));
  ok(
    "a failed dependency leaves the dependent waiting",
    q.claim("background", at(3)) === null,
  );
  ok(
    "…queued, not cancelled",
    db.select().from(aiJobs).where(eq(aiJobs.id, second.id)).get()?.status ===
      "queued",
  );
  q.retry(uid, first.id, at(4));
  q.claim("background", at(5));
  q.succeed(first.id, null, at(6));
  ok(
    "retrying the dependency unblocks it",
    q.claim("background", at(7))?.id === second.id,
  );

  /* ---------- retries and backoff ---------- */
  reset();
  const flaky = job({ maxAttempts: 3 });
  q.claim("background", at(0));
  let after = q.fail(flaky.id, "CLI exited 1", { permanent: false }, at(10));
  ok("a transient failure goes back to the queue", after?.status === "queued");
  ok("after 30s", after?.runAfter.getTime() === at(40).getTime());
  ok("and keeps the error for the view", after?.error === "CLI exited 1");
  ok("not claimable during the backoff", q.claim("background", at(39)) === null);
  ok("claimable after it", q.claim("background", at(40))?.attempts === 2);
  after = q.fail(flaky.id, "again", { permanent: false }, at(50));
  ok("the backoff doubles", after?.runAfter.getTime() === at(110).getTime());
  q.claim("background", at(110));
  after = q.fail(flaky.id, "third", { permanent: false }, at(120));
  ok("out of attempts → failed", after?.status === "failed" && !after.permanent);
  ok(
    "backoff is capped at 15 minutes",
    q.backoffMs("background", 20) === 15 * 60_000,
  );
  ok("interactive retries quickly", q.backoffMs("interactive", 1) === 2_000);

  reset();
  const signedOut = job();
  q.claim("background", at(0));
  after = q.fail(signedOut.id, "signed out", { permanent: true }, at(1));
  ok(
    "a permanent failure is final at once",
    after?.status === "failed" && after.permanent,
  );

  /* ---------- classification ---------- */
  const c = w.classify;
  ok(
    "an expired Claude Code login is permanent",
    c(
      new AiError(
        "Failed to authenticate: OAuth session expired and could not be refreshed",
      ),
    ).permanent,
  );
  ok(
    "…and says how to fix it",
    /sign in again/i.test(c(new AiError("Not logged in")).message),
  );
  ok(
    "a not-configured provider is permanent",
    c(new AiNotConfiguredError("no key")).permanent,
  );
  ok(
    "a missing posting is permanent",
    c(new w.PermanentJobError("no posting")).permanent,
  );
  ok(
    "a CLI crash is transient",
    !c(new AiError("Claude Code exited with code 1: boom")).permanent,
  );
  ok(
    "malformed JSON is transient",
    !c(new AiError("did not return JSON")).permanent,
  );
  ok("an unknown error is transient", !c(new Error("ECONNRESET")).permanent);

  /* ---------- crash recovery ---------- */
  reset();
  const bg = job();
  const fg = job({ lane: "interactive" });
  q.claim("background", at(0));
  q.claim("interactive", at(0));
  ok(
    "two jobs requeued or failed after a restart",
    q.requeueInterrupted(at(5)) === 2,
  );
  const bgAfter = db.select().from(aiJobs).where(eq(aiJobs.id, bg.id)).get();
  const fgAfter = db.select().from(aiJobs).where(eq(aiJobs.id, fg.id)).get();
  ok("a background job goes back to the queue", bgAfter?.status === "queued");
  ok("its interrupted run counted as an attempt", bgAfter?.attempts === 1);
  ok("an interactive job fails — its caller is gone", fgAfter?.status === "failed");
  const doomed = job({ maxAttempts: 1 });
  q.claim("background", at(6));
  q.requeueInterrupted(at(7));
  ok(
    "a job that keeps killing the process stops",
    db.select().from(aiJobs).where(eq(aiJobs.id, doomed.id)).get()?.status ===
      "failed",
  );

  /* ---------- cancellation ---------- */
  reset();
  const root = job({ label: "root" });
  const child = job({ dependsOn: [root.id], label: "child" });
  const grandchild = job({ dependsOn: [child.id], label: "grandchild" });
  q.claim("background", at(0));
  q.cancel(uid, root.id, at(1));
  const statusOf = (id: string) =>
    db.select().from(aiJobs).where(eq(aiJobs.id, id)).get()?.status;
  ok("cancel takes the running job", statusOf(root.id) === "cancelled");
  ok(
    "and everything waiting on it",
    statusOf(child.id) === "cancelled" && statusOf(grandchild.id) === "cancelled",
  );
  ok(
    "a late result does not resurrect it",
    q.succeed(root.id, {}, at(2)) === undefined &&
      statusOf(root.id) === "cancelled",
  );
  q.retry(uid, root.id, at(3));
  ok(
    "retrying the root brings its dependents back",
    statusOf(child.id) === "queued" && statusOf(grandchild.id) === "queued",
  );
  ok(
    "someone else's job cannot be cancelled",
    q.cancel("someone-else", root.id) === undefined,
  );

  /* ---------- the worker loop, with a fake handler ---------- */
  reset();
  let concurrent = 0;
  let peak = 0;
  const order: string[] = [];
  let flakyCalls = 0;
  const handlers = {
    analysis: async (j: { label: string | null; id: string }) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      order.push(j.label ?? j.id);
      concurrent--;
      return { ok: true };
    },
    actionables: async (_j: unknown, ctx: { enqueue: typeof q.enqueue }) => {
      ctx.enqueue({ userId: uid, kind: "analysis", label: "follow-up" });
      return null;
    },
    questionnaire: async () => {
      flakyCalls++;
      throw new AiError("Claude Code exited with code 1: transient");
    },
  } as unknown as Parameters<typeof w.pump>[0];

  const now = new Date();
  for (const label of ["one", "two", "three"]) {
    q.enqueue({ userId: uid, kind: "analysis", label, runAfter: now });
  }
  q.enqueue({ userId: uid, kind: "actionables", runAfter: now, priority: 9 });
  const fq = q.enqueue({
    userId: uid,
    kind: "questionnaire",
    runAfter: now,
    priority: 9,
  });
  for (let i = 0; i < 6; i++) await w.pump(handlers);
  ok("the background lane runs one at a time", peak === 1);
  ok(
    "in priority, then arrival, order",
    order.slice(0, 3).join(",") === "one,two,three",
  );
  ok("a handler can queue follow-up work", order.includes("follow-up"));
  const fqAfter = db.select().from(aiJobs).where(eq(aiJobs.id, fq.id)).get();
  ok(
    "a throwing handler is retried later, not at once",
    flakyCalls === 1 && fqAfter?.status === "queued",
  );
  ok("with the error recorded", /transient/.test(fqAfter?.error ?? ""));
  ok(
    "results are stored",
    db.select().from(aiJobs).where(eq(aiJobs.label, "one")).get()?.result !== null,
  );

  /* ---------- the automatic pipeline ---------- */
  reset();
  const posting = "We are hiring an engineer to build distributed systems. ".repeat(
    Math.ceil(MIN_POSTING_CHARS / 50),
  );
  const app = createApplication(uid, {
    company: "Acme",
    title: "Engineer",
    description: posting,
  });
  const plan = queueApplicationPipeline(uid, app, "created");
  const kinds = plan.queued.map((j) => j.kind);
  ok(
    "a new application queues analysis, prep plan, questions and handbook",
    ["analysis", "actionables", "questionnaire", "handbook_outline"].every((k) =>
      kinds.includes(k as never),
    ),
  );
  const byKind = Object.fromEntries(plan.queued.map((j) => [j.kind, j]));
  ok(
    "the prep plan waits for the analysis",
    byKind.actionables.dependsOn.includes(byKind.analysis.id),
  );
  ok(
    "the questions wait for the analysis",
    byKind.questionnaire.dependsOn.includes(byKind.analysis.id),
  );
  ok(
    "the handbook waits for the prep plan",
    byKind.handbook_outline.dependsOn.includes(byKind.actionables.id),
  );
  ok(
    "the prep plan carries the exercise cap",
    (byKind.actionables.payload as { exercises?: number }).exercises === 6,
  );
  const again = queueApplicationPipeline(uid, app, "created");
  ok(
    "queueing it twice does not double the work",
    again.queued.every((j) => plan.queued.some((p) => p.id === j.id)),
  );

  const snippet = createApplication(uid, {
    company: "Globex",
    title: "Engineer",
    description: "Short snippet.",
  });
  const waiting = queueApplicationPipeline(uid, snippet, "created");
  ok("a two-line snippet queues nothing", waiting.queued.length === 0);
  ok("and says why", /job description/i.test(waiting.skipped[0]?.reason ?? ""));

  let failed = 0;
  for (const [label, pass] of checks) {
    if (!pass) failed++;
    console.log(`  ${pass ? "ok  " : "FAIL"} ${label}`);
  }
  console.log(
    failed
      ? `\n${failed} of ${checks.length} queue check(s) failed`
      : `\nall ${checks.length} queue checks pass`,
  );
  fs.rmSync(dir, { recursive: true, force: true });
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
