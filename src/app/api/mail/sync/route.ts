import { syncMailbox } from "@/lib/mail/sync";
import { requireUser } from "@/lib/auth";
import { badRequest, failed, ok, readJson } from "@/lib/api";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { mail } = getSettings(user.id);
    if (!mail.enabled) {
      return badRequest("Mailbox sync is off. Turn it on in Settings first.");
    }

    const body = await readJson<{ triage?: boolean }>(request);
    return ok({ report: await syncMailbox(user.id, { triage: body.triage }) });
  } catch (error) {
    return failed(error);
  }
}
