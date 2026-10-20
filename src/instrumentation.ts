/**
 * Runs once per server instance, before any request is served.
 *
 * It must COMPLETE before the server is ready, so nothing slow belongs here —
 * the discovery schedule only starts a timer and returns. The Edge runtime
 * gets no scheduler: it has no SQLite handle and no long-lived process to run
 * one in.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startDiscoverySchedule } = await import("@/lib/discovery/schedule");
  startDiscoverySchedule();
}
