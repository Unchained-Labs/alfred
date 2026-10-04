import { failed, ok, readJson } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { beginRegistration, relyingParty, type CeremonyMode } from "@/lib/passkeys";

/**
 * Start a sign-up, or add another passkey to the account already signed in.
 * Which one it is depends on the session, not on anything the client sends:
 * a request cannot ask to register against somebody else's account.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{
      name?: string;
      email?: string;
      mode?: CeremonyMode;
      inviteToken?: string;
    }>(request);
    const mode: CeremonyMode = body.mode === "phone" ? "phone" : "device";
    const user = await currentUser();
    const rp = relyingParty(request.url, request.headers);

    const { challengeId, options } = await beginRegistration(rp, {
      mode,
      name: body.name,
      email: body.email,
      inviteToken: body.inviteToken,
      user: user ?? undefined,
    });
    return ok({ challengeId, options });
  } catch (error) {
    return failed(error);
  }
}
