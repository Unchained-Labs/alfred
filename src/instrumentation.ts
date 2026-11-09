/**
 * Runs once per server instance, before any request is served.
 *
 * It must COMPLETE before the server is ready, so nothing slow belongs here —
 * the discovery schedule and the AI job worker only start timers and return. The Edge runtime
 * gets no scheduler: it has no SQLite handle and no long-lived process to run
 * one in.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startDiscoverySchedule } = await import("@/lib/discovery/schedule");
  startDiscoverySchedule();

  // AI generations run from a durable queue, a bounded number at a time. Jobs
  // a restart interrupted are picked up here. Migrations otherwise run on the
  // first page render (app/layout.tsx), which is after this — and the worker's
  // first act is to read ai_jobs. Running them twice is a no-op.
  try {
    const [{ runMigrations }, { startWorker }, { handlers }] = await Promise.all([
      import("@/db/migrate"),
      import("@/lib/jobs/worker"),
      import("@/lib/jobs/handlers"),
    ]);
    runMigrations();
    startWorker(handlers);
  } catch (error) {
    // A worker that cannot start must not take the app down with it: pages
    // still render, and generation requests still queue for the next start.
    console.error("[alfred] AI job worker did not start:", error);
  }
}
