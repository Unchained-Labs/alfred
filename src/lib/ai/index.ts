import type { Analysis, Application } from "@/db/schema";
import { getSettings, type UserProfile } from "@/lib/settings";
import {
  actionablesPrompt,
  analyzeJobPrompt,
  chatPrompt,
  mailTriagePrompt,
  parseJobPrompt,
  questionnairePrompt,
} from "./prompts";
import { AgentProvider } from "./providers/agent";
import { AnthropicProvider } from "./providers/anthropic";
import { ClaudeCodeProvider } from "./providers/claude-code";
import { OpenAiCompatProvider } from "./providers/openai-compat";
import {
  type ActionablePlan,
  actionablePlanSchema,
  type JobAnalysis,
  jobAnalysisSchema,
  type MailTriage,
  mailTriageSchema,
  type ParsedJob,
  parsedJobSchema,
  type Questionnaire,
  questionnaireSchema,
} from "./schemas";
import { AiError, type AiProvider, type ProviderConfig } from "./types";

export * from "./schemas";
export { AiError, AiNotConfiguredError } from "./types";
export type { ProviderKind } from "./types";

/** Builds a provider from an explicit config — used by the settings test route. */
export function createProvider(config: ProviderConfig): AiProvider {
  switch (config.kind) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "claude-code":
      return new ClaudeCodeProvider(config);
    case "openai-compat":
      return new OpenAiCompatProvider(config);
    case "agent":
      return new AgentProvider(config);
  }
}

/** Builds the provider the user has selected in Settings. */
export function resolveProvider(): AiProvider {
  const { ai } = getSettings();
  switch (ai.provider) {
    case "anthropic":
      return createProvider({ kind: "anthropic", ...ai.anthropic });
    case "claude-code":
      return createProvider({ kind: "claude-code", ...ai.claudeCode });
    case "openai-compat":
      return createProvider({ kind: "openai-compat", ...ai.openaiCompat });
    case "agent":
      return createProvider({ kind: "agent", ...ai.agent });
    default:
      throw new AiError(`Unknown AI provider: ${String(ai.provider)}`);
  }
}

function profile(): UserProfile {
  return getSettings().profile;
}

export type AiRun<T> = { result: T; provider: string; model: string };

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

export async function analyzeJob(app: Application): Promise<AiRun<JobAnalysis>> {
  const provider = resolveProvider();
  const { system, prompt } = analyzeJobPrompt(app, profile());
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: jobAnalysisSchema,
    schemaName: "job_analysis",
    task: "analyze_job",
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function generateActionables(
  app: Application,
  analysis: Analysis | null,
): Promise<AiRun<ActionablePlan>> {
  const provider = resolveProvider();
  const { system, prompt } = actionablesPrompt(app, profile(), analysis);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: actionablePlanSchema,
    schemaName: "actionable_plan",
    task: "generate_actionables",
    maxTokens: 24000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function generateQuestionnaire(
  app: Application,
  analysis: Analysis | null,
  count = 12,
): Promise<AiRun<Questionnaire>> {
  const provider = resolveProvider();
  const { system, prompt } = questionnairePrompt(app, profile(), analysis, count);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: questionnaireSchema,
    schemaName: "questionnaire",
    task: "generate_questionnaire",
    maxTokens: 32000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function parseJobPosting(raw: string): Promise<AiRun<ParsedJob>> {
  const provider = resolveProvider();
  const { system, prompt } = parseJobPrompt(raw);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: parsedJobSchema,
    schemaName: "parsed_job",
    task: "parse_job_posting",
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function triageEmail(
  mail: Parameters<typeof mailTriagePrompt>[0],
  knownCompanies: string[],
): Promise<AiRun<MailTriage>> {
  const provider = resolveProvider();
  const { system, prompt } = mailTriagePrompt(mail, knownCompanies);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: mailTriageSchema,
    schemaName: "mail_triage",
    task: "triage_email",
    maxTokens: 4000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export function chatStream(
  app: Application | null,
  analysis: Analysis | null,
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
): AsyncIterable<string> {
  const provider = resolveProvider();
  const { system, prompt } = chatPrompt(
    app,
    profile(),
    analysis,
    history,
    question,
  );
  return provider.streamText({ system, prompt, task: "chat", maxTokens: 4000 });
}

/** Round-trips a trivial request so Settings can verify credentials. */
export async function testProvider(config: ProviderConfig) {
  const provider = createProvider(config);
  const started = Date.now();
  const { text, model } = await provider.generateText({
    system: "You are a connectivity probe. Reply with exactly: ALFRED OK",
    prompt: "Reply with exactly: ALFRED OK",
    maxTokens: 64,
    task: "connectivity_check",
  });
  return {
    ok: text.toUpperCase().includes("ALFRED OK"),
    reply: text.trim().slice(0, 200),
    model: model ?? provider.model,
    latencyMs: Date.now() - started,
  };
}
