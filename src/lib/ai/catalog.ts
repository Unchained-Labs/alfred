/**
 * Provider constants the Settings UI needs.
 *
 * These live apart from the provider implementations on purpose: the settings
 * page is a client component, and importing a provider module would pull its
 * server-only dependencies — the Anthropic SDK, `node:child_process` — into the
 * browser bundle. Turbopack fails the build outright for the latter.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
export const DEFAULT_CLAUDE_CODE_BINARY = "claude";

/** Anthropic API models the settings UI offers. Most capable first. */
export const ANTHROPIC_MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5", hint: "Best reasoning (default)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", hint: "Previous Opus" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Faster, cheaper" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fastest" },
] as const;

/** Aliases the Claude Code CLI accepts. A full model id also works. */
export const CLAUDE_CODE_MODELS = [
  { id: "opus", label: "Opus", hint: "Best reasoning (default)" },
  { id: "sonnet", label: "Sonnet", hint: "Faster, cheaper" },
  { id: "haiku", label: "Haiku", hint: "Fastest" },
  { id: "fable", label: "Fable", hint: "Most capable" },
] as const;
