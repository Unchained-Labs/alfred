import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { failed, ok, readJson } from "@/lib/api";
import { createSession, currentUser } from "@/lib/auth";
import { finishRegistration, relyingParty } from "@/lib/passkeys";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      challengeId?: string;
      response?: RegistrationResponseJSON;
      label?: string;
    }>(request);
    if (!body.response) throw new Error("Missing passkey response");

    const signedIn = await currentUser();
    const rp = relyingParty(request.url, request.headers);
    const { user, claimed } = await finishRegistration(
      rp,
      body.challengeId,
      body.response,
      {
        label: body.label,
        signedInUser: signedIn ?? undefined,
      },
    );

    // Adding a passkey while signed in must not mint a second session.
    if (!signedIn) await createSession(user.id, request.headers.get("user-agent"));

    return ok({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      claimed,
      signedIn: !signedIn,
    });
  } catch (error) {
    return failed(error);
  }
}
