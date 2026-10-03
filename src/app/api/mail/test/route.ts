import { testMailbox } from "@/lib/mail/imap";
import { failed, ok, readJson } from "@/lib/api";
import { getSettings, type MailSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const overrides = await readJson<Partial<MailSettings>>(request);
    const stored = getSettings().mail;

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
