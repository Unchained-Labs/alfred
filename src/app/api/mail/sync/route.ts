import { syncMailbox } from "@/lib/mail/sync";
import { badRequest, failed, ok, readJson } from "@/lib/api";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const { mail } = getSettings();
    if (!mail.enabled) {
      return badRequest("Mailbox sync is off. Turn it on in Settings first.");
    }

    const body = await readJson<{ triage?: boolean }>(request);
    return ok({ report: await syncMailbox({ triage: body.triage }) });
  } catch (error) {
    return failed(error);
  }
}
