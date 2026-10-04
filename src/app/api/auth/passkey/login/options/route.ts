import { failed, ok, readJson } from "@/lib/api";
import { beginLogin, relyingParty, type CeremonyMode } from "@/lib/passkeys";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ mode?: CeremonyMode }>(request);
    const mode: CeremonyMode = body.mode === "phone" ? "phone" : "device";
    const rp = relyingParty(request.url, request.headers);
    const { challengeId, options } = await beginLogin(rp, mode);
    return ok({ challengeId, options });
  } catch (error) {
    return failed(error);
  }
}
