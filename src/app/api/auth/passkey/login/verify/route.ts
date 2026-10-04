import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { failed, ok, readJson } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { finishLogin, relyingParty } from "@/lib/passkeys";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      challengeId?: string;
      response?: AuthenticationResponseJSON;
    }>(request);
    if (!body.response) throw new Error("Missing passkey response");

    const rp = relyingParty(request.url, request.headers);
    const user = await finishLogin(rp, body.challengeId, body.response);
    await createSession(user.id, request.headers.get("user-agent"));
    return ok({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    return failed(error);
  }
}
