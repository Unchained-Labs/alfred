import type { z } from "zod";
import {
  AiError,
  AiNotConfiguredError,
  type AiProvider,
  type GenerateRequest,
  type ObjectRequest,
  type ObjectResult,
  type OpenAiCompatConfig,
  type TextResult,
} from "../types";
import { extractJsonObject, toStrictJsonSchema } from "./json-schema";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatCompletion = {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
};

/**
 * Talks to any OpenAI-compatible `/chat/completions` endpoint. Deliberately
 * uses plain fetch rather than an SDK so that partial implementations
 * (Ollama, llama.cpp, vLLM) work without extra shims.
 */
export class OpenAiCompatProvider implements AiProvider {
  readonly kind = "openai-compat" as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly supportsJsonSchema: boolean;
  private readonly temperature: number;

  constructor(config: OpenAiCompatConfig) {
    if (!config.baseUrl?.trim()) {
      throw new AiNotConfiguredError(
        "No LLM endpoint configured. Add a base URL in Settings.",
      );
    }
    if (!config.model?.trim()) {
      throw new AiNotConfiguredError(
        "No model name configured for the LLM endpoint.",
      );
    }
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    this.apiKey = config.apiKey?.trim() || process.env.ALFRED_LLM_API_KEY;
    this.model = config.model.trim();
    this.supportsJsonSchema = config.supportsJsonSchema ?? true;
    this.temperature = config.temperature ?? 0.3;
  }

  private get url() {
    // Accept both a bare host and a full .../v1 base.
    return /\/(v\d+|chat\/completions)$/.test(this.baseUrl)
      ? `${this.baseUrl.replace(/\/chat\/completions$/, "")}/chat/completions`
      : `${this.baseUrl}/v1/chat/completions`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new AiError(
        `Could not reach the LLM endpoint at ${this.url}.`,
        error,
        true,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiError(
        `LLM endpoint returned ${response.status}: ${detail.slice(0, 400) || response.statusText}`,
        undefined,
        response.status >= 500 || response.status === 429,
      );
    }
    return response;
  }

  private messages(req: GenerateRequest): ChatMessage[] {
    return [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt },
    ];
  }

  async generateText(req: GenerateRequest): Promise<TextResult> {
    const response = await this.post({
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      temperature: this.temperature,
      messages: this.messages(req),
    });

    const payload = (await response.json()) as ChatCompletion;
    if (payload.error?.message) throw new AiError(payload.error.message);

    const text = payload.choices?.[0]?.message?.content ?? "";
    return {
      text,
      model: payload.model ?? this.model,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      },
    };
  }

  async generateObject<T extends z.ZodType>(
    req: ObjectRequest<T>,
  ): Promise<ObjectResult<z.output<T>>> {
    const jsonSchema = toStrictJsonSchema(req.schema);
    const messages = this.messages(req);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      temperature: this.temperature,
      messages,
    };

    if (this.supportsJsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: req.schemaName, strict: true, schema: jsonSchema },
      };
    } else {
      // No native schema support: inline the contract and ask for bare JSON.
      messages[0] = {
        role: "system",
        content: `${req.system}\n\nRespond with a single JSON object and nothing else — no prose, no markdown fence. It must validate against this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
      };
      body.response_format = { type: "json_object" };
    }

    let payload: ChatCompletion;
    try {
      const response = await this.post(body);
      payload = (await response.json()) as ChatCompletion;
    } catch (error) {
      // A 400 here usually means the server doesn't accept response_format.
      // Retry once in prompt-coercion mode rather than failing the operation.
      if (this.supportsJsonSchema && error instanceof AiError) {
        return new OpenAiCompatProvider({
          kind: "openai-compat",
          baseUrl: this.baseUrl,
          apiKey: this.apiKey,
          model: this.model,
          supportsJsonSchema: false,
          temperature: this.temperature,
        }).generateObject(req);
      }
      throw error;
    }

    if (payload.error?.message) throw new AiError(payload.error.message);

    const raw = payload.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new AiError("LLM endpoint returned an empty response.");

    let candidate: unknown;
    try {
      candidate = extractJsonObject(raw);
    } catch (error) {
      throw new AiError(
        `LLM endpoint did not return JSON: ${raw.slice(0, 200)}`,
        error,
      );
    }

    const parsed = req.schema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new AiError(`LLM output did not match the expected shape — ${issues}`);
    }
    return {
      object: parsed.data as z.output<T>,
      model: payload.model ?? this.model,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      },
    };
  }

  async *streamText(req: GenerateRequest): AsyncIterable<string> {
    const response = await this.post({
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      temperature: this.temperature,
      messages: this.messages(req),
      stream: true,
    });

    const body = response.body;
    if (!body) throw new AiError("LLM endpoint returned no response body.");

    // Some servers ignore `stream: true` and answer with a whole completion.
    // Without this the caller would silently receive nothing.
    if (!(response.headers.get("content-type") ?? "").includes("event-stream")) {
      const payload = (await response.json()) as ChatCompletion;
      if (payload.error?.message) throw new AiError(payload.error.message);
      const text = payload.choices?.[0]?.message?.content;
      if (text) yield text;
      return;
    }

    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE frames are newline-delimited; keep the trailing partial line.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Ignore keep-alive and non-JSON frames.
        }
      }
    }
  }
}
