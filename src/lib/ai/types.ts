import type { z } from "zod";

export const PROVIDER_KINDS = ["anthropic", "openai-compat", "agent"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export type AnthropicConfig = {
  kind: "anthropic";
  apiKey?: string;
  model: string;
  /** low | medium | high | xhigh | max — maps to output_config.effort */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

/**
 * Any OpenAI-compatible /chat/completions endpoint: Ollama, LM Studio, vLLM,
 * OpenRouter, Together, Groq, llama.cpp, or a self-hosted gateway.
 */
export type OpenAiCompatConfig = {
  kind: "openai-compat";
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Some servers reject response_format; fall back to prompt-coerced JSON. */
  supportsJsonSchema?: boolean;
  temperature?: number;
};

/**
 * A user's own agent reachable over HTTP. Alfred POSTs a task envelope and
 * expects either `{ text }` or `{ object }` back (see providers/agent.ts).
 */
export type AgentConfig = {
  kind: "agent";
  endpoint: string;
  apiKey?: string;
  /** Extra headers, e.g. for a custom auth scheme. */
  headers?: Record<string, string>;
  /** Sent through as `agent` so one endpoint can host several agents. */
  agentName?: string;
};

export type ProviderConfig = AnthropicConfig | OpenAiCompatConfig | AgentConfig;

export type GenerateRequest = {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Identifies the operation to the agent provider, e.g. "analyze_job". */
  task?: string;
};

export type ObjectRequest<T extends z.ZodType> = GenerateRequest & {
  schema: T;
  /** Schema name passed to providers that require one. */
  schemaName: string;
};

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
};

export type TextResult = { text: string; model?: string; usage?: Usage };

export type ObjectResult<T> = { object: T; model?: string; usage?: Usage };

export interface AiProvider {
  readonly kind: ProviderKind;
  readonly model: string;
  /** Free-form text generation. */
  generateText(req: GenerateRequest): Promise<TextResult>;
  /** Schema-constrained generation. Throws AiError if the result won't validate. */
  generateObject<T extends z.ZodType>(
    req: ObjectRequest<T>,
  ): Promise<ObjectResult<z.output<T>>>;
  /** Token-by-token text, for the chat surface. */
  streamText(req: GenerateRequest): AsyncIterable<string>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    /** True when retrying the same request might succeed. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export class AiNotConfiguredError extends AiError {
  constructor(detail: string) {
    super(detail);
    this.name = "AiNotConfiguredError";
  }
}
