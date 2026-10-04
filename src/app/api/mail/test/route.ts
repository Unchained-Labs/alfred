import { testMailbox } from "@/lib/mail/imap";
import { requireUser } from "@/lib/auth";
import { failed, ok, readJson } from "@/lib/api";
import { getSettings, type MailSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const overrides = await readJson<Partial<MailSettings>>(request);
    const stored = getSettings(user.id).mail;

    // A blank password from the browser means "keep the stored one".
    const config: MailSettings = {
      ...stored,
      ...overrides,
      password: overrides.password?.trim() || stored.password,
    };

    return ok(await testMailbox(config));
  } catch (error) {
    return failed(error);
  }
}
