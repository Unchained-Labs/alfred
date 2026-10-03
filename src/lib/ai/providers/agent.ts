import type { z } from "zod";
import {
  type AgentConfig,
  AiError,
  AiNotConfiguredError,
  type AiProvider,
  type GenerateRequest,
  type ObjectRequest,
  type ObjectResult,
  type TextResult,
} from "../types";
import { extractJsonObject, toStrictJsonSchema } from "./json-schema";

/**
 * The envelope Alfred POSTs to a custom agent. Documented in README so users
 * can implement an agent against it.
 */
type AgentRequestBody = {
  /** Operation name, e.g. "analyze_job" | "generate_actionables" | "chat". */
  task: string;
  agent?: string;
  system: string;
  prompt: string;
  /** "text" or "object" — tells the agent what shape to return. */
  responseType: "text" | "object";
  /** Present only when responseType is "object". */
  schema?: Record<string, unknown>;
  schemaName?: string;
  maxTokens?: number;
};

type AgentResponseBody = {
  /** For text tasks. `output` and `content` are accepted as aliases. */
  text?: string;
  output?: string;
  content?: string;
  /** For object tasks. A JSON string is also accepted. */
  object?: unknown;
  data?: unknown;
  result?: unknown;
  model?: string;
  error?: string;
};

function pickText(payload: AgentResponseBody): string | undefined {
  for (const value of [payload.text, payload.output, payload.content]) {
    if (typeof value === "string") return value;
  }
  return undefined;
}

function pickObject(payload: AgentResponseBody): unknown {
  for (const value of [payload.object, payload.data, payload.result]) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/**
 * Bring-your-own-agent provider. Alfred stays out of the agent's internals:
 * it sends a task envelope over HTTP and validates whatever comes back.
 */
export class AgentProvider implements AiProvider {
  readonly kind = "agent" as const;
  readonly model: string;
  private readonly endpoint: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly apiKey?: string;
  private readonly agentName?: string;

  constructor(config: AgentConfig) {
    if (!config.endpoint?.trim()) {
      throw new AiNotConfiguredError(
        "No agent endpoint configured. Add one in Settings.",
      );
    }
    this.endpoint = config.endpoint.trim();
    this.apiKey = config.apiKey?.trim() || process.env.ALFRED_AGENT_API_KEY;
    this.extraHeaders = config.headers ?? {};
    this.agentName = config.agentName?.trim() || undefined;
    this.model = this.agentName ?? "custom-agent";
  }

  private async call(body: AgentRequestBody): Promise<AgentResponseBody> {
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          ...this.extraHeaders,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new AiError(`Could not reach the agent at ${this.endpoint}.`, error, true);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiError(
        `Agent returned ${response.status}: ${detail.slice(0, 400) || response.statusText}`,
        undefined,
        response.status >= 500 || response.status === 429,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      // A plain-text agent is fine for text tasks.
      return { text: await response.text() };
    }

    const payload = (await response.json()) as AgentResponseBody;
    if (payload.error) throw new AiError(`Agent error: ${payload.error}`);
    return payload;
  }

  async generateText(req: GenerateRequest): Promise<TextResult> {
    const payload = await this.call({
      task: req.task ?? "generate_text",
      agent: this.agentName,
      system: req.system,
      prompt: req.prompt,
      responseType: "text",
      maxTokens: req.maxTokens,
    });

    const text = pickText(payload);
    if (text === undefined) {
      throw new AiError(
        "Agent response had no `text`, `output`, or `content` field.",
      );
    }
    return { text, model: payload.model ?? this.model };
  }

  async generateObject<T extends z.ZodType>(
    req: ObjectRequest<T>,
  ): Promise<ObjectResult<z.output<T>>> {
    const payload = await this.call({
      task: req.task ?? "generate_object",
      agent: this.agentName,
      system: req.system,
      prompt: req.prompt,
      responseType: "object",
      schema: toStrictJsonSchema(req.schema),
      schemaName: req.schemaName,
      maxTokens: req.maxTokens,
    });

    // Accept a structured field, or a text field holding JSON.
    let candidate = pickObject(payload);
    if (candidate === undefined) {
      const text = pickText(payload);
      if (text === undefined) {
        throw new AiError("Agent response had neither an object nor text field.");
      }
      candidate = extractJsonObject(text);
    } else if (typeof candidate === "string") {
      candidate = extractJsonObject(candidate);
    }

    const parsed = req.schema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new AiError(`Agent output did not match the expected shape — ${issues}`);
    }
    return { object: parsed.data as z.output<T>, model: payload.model ?? this.model };
  }

  /**
   * Custom agents are assumed non-streaming; Alfred emits the finished answer
   * as a single chunk so the chat UI needs no special case.
   */
  async *streamText(req: GenerateRequest): AsyncIterable<string> {
    const { text } = await this.generateText(req);
    yield text;
  }
}
