import { failed, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { runDiscovery } from "@/lib/discovery/run";

/**
 * Runs discovery now, for this account.
 *
 * The scheduled sweep calls the same function directly rather than this route,
 * so there is one code path for "scan for jobs" and this is only the manual
 * trigger. It can take a while — a dozen boards at a few hundred milliseconds
 * each — which is why it reports per-source counts rather than a bare total.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ searchId?: string }>(request);
    const report = await runDiscovery(user.id, { searchId: body.searchId });
    return ok({ report });
  } catch (error) {
    return failed(error);
  }
}
