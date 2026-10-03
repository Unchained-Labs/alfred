import { testProvider } from "@/lib/ai";
import type { ProviderConfig, ProviderKind } from "@/lib/ai/types";
import { badRequest, failed, ok, readJson } from "@/lib/api";
import { getSettings } from "@/lib/settings";

/**
 * Probes a provider. The browser never holds the stored secrets, so an omitted
 * credential means "use the one already saved" rather than "use none".
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{
      provider?: ProviderKind;
      config?: Record<string, string | number | boolean>;
    }>(request);

    const stored = getSettings().ai;
    const kind = body.provider ?? stored.provider;
    const overrides = body.config ?? {};

    let config: ProviderConfig;
    switch (kind) {
      case "anthropic":
        config = {
          kind: "anthropic",
          ...stored.anthropic,
          ...overrides,
          apiKey: (overrides.apiKey as string)?.trim() || stored.anthropic.apiKey,
        };
        break;
      case "claude-code":
        // No credential of its own — the CLI resolves its own sign-in.
        config = { kind: "claude-code", ...stored.claudeCode, ...overrides };
        break;
      case "openai-compat":
        config = {
          kind: "openai-compat",
          ...stored.openaiCompat,
          ...overrides,
          apiKey:
            (overrides.apiKey as string)?.trim() || stored.openaiCompat.apiKey,
        };
        break;
      case "agent":
        config = {
          kind: "agent",
          ...stored.agent,
          ...overrides,
          apiKey: (overrides.apiKey as string)?.trim() || stored.agent.apiKey,
        };
        break;
      default:
        return badRequest(`Unknown provider: ${String(kind)}`);
    }

    return ok(await testProvider(config));
  } catch (error) {
    return failed(error);
  }
}
