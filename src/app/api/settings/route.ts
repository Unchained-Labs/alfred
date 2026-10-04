import { requireUser } from "@/lib/auth";
import { failed, ok, readJson } from "@/lib/api";
import { getSettings, redactSettings, saveSettings } from "@/lib/settings";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ settings: redactSettings(getSettings(user.id)) });
  } catch (error) {
    return failed(error);
  }
}

/**
 * Merges a patch over the stored settings. The client sends an empty string for
 * a secret it isn't changing, which would otherwise wipe the stored value — so
 * blank credentials are dropped before the merge.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const patch = await readJson<Record<string, unknown>>(request);

    const ai = patch.ai as Record<string, Record<string, unknown>> | undefined;
    for (const section of ["anthropic", "openaiCompat", "agent"] as const) {
      const config = ai?.[section];
      if (config && typeof config.apiKey === "string" && !config.apiKey.trim()) {
        delete config.apiKey;
      }
    }
    const mail = patch.mail as Record<string, unknown> | undefined;
    if (mail && typeof mail.password === "string" && !mail.password.trim()) {
      delete mail.password;
    }

    return ok({ settings: redactSettings(saveSettings(user.id, patch)) });
  } catch (error) {
    return failed(error);
  }
}
