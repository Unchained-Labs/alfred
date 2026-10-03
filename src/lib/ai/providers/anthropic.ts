import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  AiError,
  AiNotConfiguredError,
  type AiProvider,
  type AnthropicConfig,
  type GenerateRequest,
  type ObjectRequest,
  type ObjectResult,
  type TextResult,
  type Usage,
} from "../types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/** Models the settings UI offers. Newest/most capable first. */
export const ANTHROPIC_MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5", hint: "Best reasoning (default)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", hint: "Previous Opus" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Faster, cheaper" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fastest" },
] as const;

function usageOf(u: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
}): Usage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? undefined,
  };
}

function wrap(error: unknown): AiError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError("Anthropic rejected the API key.", error);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError("Anthropic rate limit hit — try again shortly.", error, true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError(`Anthropic rejected the request: ${error.message}`, error);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("Could not reach the Anthropic API.", error, true);
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`Anthropic error ${error.status}: ${error.message}`, error, (error.status ?? 0) >= 500);
  }
  return new AiError(
    error instanceof Error ? error.message : "Unknown Anthropic failure",
    error,
  );
}

export class AnthropicProvider implements AiProvider {
  readonly kind = "anthropic" as const;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort: NonNullable<AnthropicConfig["effort"]>;

  constructor(config: AnthropicConfig) {
    // An unset env var is not proof of no credentials — the SDK also resolves
    // ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles, so only bail when
    // we have neither a stored key nor anything in the environment.
    const apiKey = config.apiKey?.trim() || process.env.ANTHROPIC_API_KEY;
    if (!apiKey && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new AiNotConfiguredError(
        "No Anthropic API key. Add one in Settings, or set ANTHROPIC_API_KEY.",
      );
    }
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
    this.model = config.model || DEFAULT_ANTHROPIC_MODEL;
    this.effort = config.effort ?? "high";
  }

  async generateText(req: GenerateRequest): Promise<TextResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        output_config: { effort: this.effort },
        messages: [{ role: "user", content: req.prompt }],
      });

      if (response.stop_reason === "refusal") {
        throw new AiError(
          `Claude declined this request (${response.stop_details?.category ?? "unspecified"}).`,
        );
      }

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      return { text, model: response.model, usage: usageOf(response.usage) };
    } catch (error) {
      throw error instanceof AiError ? error : wrap(error);
    }
  }

  async generateObject<T extends z.ZodType>(
    req: ObjectRequest<T>,
  ): Promise<ObjectResult<z.output<T>>> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        output_config: {
          effort: this.effort,
          format: zodOutputFormat(req.schema as never),
        },
        messages: [{ role: "user", content: req.prompt }],
      });

      if (response.stop_reason === "refusal") {
        throw new AiError(
          `Claude declined this request (${response.stop_details?.category ?? "unspecified"}).`,
        );
      }
      if (response.parsed_output == null) {
        throw new AiError("Claude returned no parsable structured output.");
      }

      return {
        object: response.parsed_output as z.output<T>,
        model: response.model,
        usage: usageOf(response.usage),
      };
    } catch (error) {
      throw error instanceof AiError ? error : wrap(error);
    }
  }

  async *streamText(req: GenerateRequest): AsyncIterable<string> {
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        output_config: { effort: this.effort },
        messages: [{ role: "user", content: req.prompt }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      throw wrap(error);
    }
  }
}
