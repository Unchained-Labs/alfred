import type { Analysis, Application } from "@/db/schema";
import { getSettings, type UserProfile } from "@/lib/settings";
import {
  actionablesPrompt,
  analyzeJobPrompt,
  chatPrompt,
  codeExercisePrompt,
  handbookDrillsPrompt,
  handbookOutlinePrompt,
  handbookPartPrompt,
  gradeAnswerPrompt,
  mailTriagePrompt,
  parseJobPrompt,
  parseResumePrompt,
  questionnairePrompt,
  writtenExercisePrompt,
} from "./prompts";
import { AgentProvider } from "./providers/agent";
import { AnthropicProvider } from "./providers/anthropic";
import { ClaudeCodeProvider } from "./providers/claude-code";
import { OpenAiCompatProvider } from "./providers/openai-compat";
import {
  type ActionablePlan,
  actionablePlanSchema,
  type CodeExercise,
  codeExerciseSchema,
  type GradedAnswer,
  gradedAnswerSchema,
  type HandbookDrills,
  handbookDrillsSchema,
  type HandbookOutline,
  handbookOutlineSchema,
  type HandbookPartBody,
  handbookPartBodySchema,
  type JobAnalysis,
  jobAnalysisSchema,
  type MailTriage,
  mailTriageSchema,
  type ParsedJob,
  parsedJobSchema,
  type ParsedResume,
  parsedResumeSchema,
  type Questionnaire,
  questionnaireSchema,
  type WrittenExercise,
  writtenExerciseSchema,
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
export function resolveProvider(userId: string): AiProvider {
  const { ai } = getSettings(userId);
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

function profile(userId: string): UserProfile {
  return getSettings(userId).profile;
}

export type AiRun<T> = { result: T; provider: string; model: string };

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

export async function analyzeJob(
  userId: string,
  app: Application,
): Promise<AiRun<JobAnalysis>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = analyzeJobPrompt(app, profile(userId));
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
  userId: string,
  app: Application,
  analysis: Analysis | null,
): Promise<AiRun<ActionablePlan>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = actionablesPrompt(app, profile(userId), analysis);
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
  userId: string,
  app: Application,
  analysis: Analysis | null,
  count = 12,
): Promise<AiRun<Questionnaire>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = questionnairePrompt(
    app,
    profile(userId),
    analysis,
    count,
  );
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

/** The prep item an exercise is generated from. */
type ExerciseSource = Parameters<typeof codeExercisePrompt>[2];

export async function generateCodeExercise(
  userId: string,
  app: Application,
  item: ExerciseSource,
): Promise<AiRun<CodeExercise>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = codeExercisePrompt(app, profile(userId), item);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: codeExerciseSchema,
    schemaName: "code_exercise",
    task: "generate_code_exercise",
    // A problem statement, a skeleton, a dozen cases and a worked solution.
    maxTokens: 32000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function generateWrittenExercise(
  userId: string,
  app: Application,
  item: ExerciseSource,
): Promise<AiRun<WrittenExercise>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = writtenExercisePrompt(app, profile(userId), item);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: writtenExerciseSchema,
    schemaName: "written_exercise",
    task: "generate_written_exercise",
    maxTokens: 16000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function gradeWrittenAnswer(
  userId: string,
  app: Application,
  brief: string,
  rubric: { id: string; requirement: string; weight: number }[],
  answer: string,
): Promise<AiRun<GradedAnswer>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = gradeAnswerPrompt(app, brief, rubric, answer);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: gradedAnswerSchema,
    schemaName: "graded_answer",
    task: "grade_written_answer",
    maxTokens: 8000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function generateHandbookOutline(
  userId: string,
  app: Application,
  analysis: Analysis | null,
  actionables: Parameters<typeof handbookOutlinePrompt>[3],
): Promise<AiRun<HandbookOutline>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = handbookOutlinePrompt(
    app,
    profile(userId),
    analysis,
    actionables,
  );
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: handbookOutlineSchema,
    schemaName: "handbook_outline",
    task: "generate_handbook_outline",
    maxTokens: 8000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function generateHandbookPart(
  userId: string,
  app: Application,
  analysis: Analysis | null,
  part: Parameters<typeof handbookPartPrompt>[3],
  siblings: string[],
  covers: Parameters<typeof handbookPartPrompt>[5],
): Promise<AiRun<HandbookPartBody>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = handbookPartPrompt(
    app,
    profile(userId),
    analysis,
    part,
    siblings,
    covers,
  );
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: handbookPartBodySchema,
    schemaName: "handbook_part",
    task: "generate_handbook_part",
    // One part of prose. Bounded on purpose: see handbookOutlinePrompt.
    maxTokens: 12000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function generateHandbookDrills(
  userId: string,
  app: Application,
  analysis: Analysis | null,
  partTitles: string[],
): Promise<AiRun<HandbookDrills>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = handbookDrillsPrompt(
    app,
    profile(userId),
    analysis,
    partTitles,
  );
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: handbookDrillsSchema,
    schemaName: "handbook_drills",
    task: "generate_handbook_drills",
    maxTokens: 16000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function parseJobPosting(
  userId: string,
  raw: string,
): Promise<AiRun<ParsedJob>> {
  const provider = resolveProvider(userId);
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

export async function parseResume(
  userId: string,
  raw: string,
): Promise<AiRun<ParsedResume>> {
  const provider = resolveProvider(userId);
  const { system, prompt } = parseResumePrompt(raw);
  const { object, model } = await provider.generateObject({
    system,
    prompt,
    schema: parsedResumeSchema,
    schemaName: "parsed_resume",
    task: "parse_resume",
    maxTokens: 24000,
  });
  return {
    result: object,
    provider: provider.kind,
    model: model ?? provider.model,
  };
}

export async function triageEmail(
  userId: string,
  mail: Parameters<typeof mailTriagePrompt>[0],
  knownCompanies: string[],
): Promise<AiRun<MailTriage>> {
  const provider = resolveProvider(userId);
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
  userId: string,
  app: Application | null,
  analysis: Analysis | null,
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
): AsyncIterable<string> {
  const provider = resolveProvider(userId);
  const { system, prompt } = chatPrompt(
    app,
    profile(userId),
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
