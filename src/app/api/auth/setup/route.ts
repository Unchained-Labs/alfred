import {
  createSession,
  createUser,
  claimOrphanedData,
  needsSetup,
} from "@/lib/auth";
import { badRequest, failed, ok, readJson } from "@/lib/api";

/** Creates the first account. Reachable only while there are none. */
export async function POST(request: Request) {
  try {
    if (!needsSetup()) {
      return badRequest("Alfred has already been set up. Sign in instead.");
    }

    const body = await readJson<{
      email?: string;
      name?: string;
      password?: string;
    }>(request);

    const user = await createUser({
      email: body.email ?? "",
      name: body.name ?? "",
      password: body.password ?? "",
      role: "owner",
    });

    // Anything written before accounts existed belongs to whoever sets Alfred
    // up — otherwise the first sign-in would show an empty pipeline.
    const claimed = claimOrphanedData(user.id);

    await createSession(user.id, request.headers.get("user-agent"));
    return ok({ user: { id: user.id, email: user.email }, claimed }, 201);
  } catch (error) {
    return failed(error);
  }
}
