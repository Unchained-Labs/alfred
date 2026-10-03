import { spawn } from "node:child_process";
import type { z } from "zod";
import {
  AiError,
  AiNotConfiguredError,
  type AiProvider,
  type ClaudeCodeConfig,
  type GenerateRequest,
  type ObjectRequest,
  type ObjectResult,
  type TextResult,
} from "../types";
import { extractJsonObject, toStrictJsonSchema } from "./json-schema";

import { DEFAULT_CLAUDE_CODE_BINARY } from "../catalog";

export { CLAUDE_CODE_MODELS, DEFAULT_CLAUDE_CODE_BINARY } from "../catalog";

/**
 * Alfred only ever asks for text back, so every tool is denied. This keeps a
 * job description — which is untrusted input — from talking the agent into
 * touching the filesystem or the network.
 */
const DENIED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "TodoWrite",
];

type CliResult = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  stop_reason?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
};

/**
 * Drives a locally installed Claude Code CLI in non-interactive mode.
 *
 * This is the one provider that needs no API key: the CLI resolves the
 * credentials you already logged in with, so calls bill against that
 * subscription rather than per token.
 */
export class ClaudeCodeProvider implements AiProvider {
  readonly kind = "claude-code" as const;
  readonly model: string;
  private readonly binary: string;
  private readonly effort: NonNullable<ClaudeCodeConfig["effort"]>;
  private readonly timeoutMs: number;

  constructor(config: ClaudeCodeConfig) {
    this.binary = config.binary?.trim() || DEFAULT_CLAUDE_CODE_BINARY;
    this.model = config.model?.trim() || "opus";
    this.effort = config.effort ?? "high";
    // Claude Code thinks before it answers; a prep plan can legitimately run
    // for minutes, so the ceiling is generous rather than HTTP-shaped.
    this.timeoutMs = config.timeoutMs ?? 300_000;
  }

  private baseArgs(system: string): string[] {
    return [
      "-p",
      "--model",
      this.model,
      "--effort",
      this.effort,
      // Alfred manages its own history; CLI sessions would pile up on disk.
      "--no-session-persistence",
      "--disable-slash-commands",
      "--disallowedTools",
      ...DENIED_TOOLS,
      "--append-system-prompt",
      system,
    ];
  }

  /**
   * Runs the CLI with the prompt on stdin.
   *
   * Arguments are passed as an array and never through a shell, so a job
   * description containing shell metacharacters is inert.
   */
  private run(
    args: string[],
    prompt: string,
    onLine?: (line: string) => void,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(this.binary, args, {
          stdio: ["pipe", "pipe", "pipe"],
          // Inherit the environment so the CLI finds its own credentials.
          env: process.env,
        });
      } catch (error) {
        reject(this.spawnError(error));
        return;
      }

      let stdout = "";
      let stderr = "";
      let pending = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        // SIGTERM first; if it ignores that, insist.
        setTimeout(() => child.kill("SIGKILL"), 5_000);
        reject(
          new AiError(
            `Claude Code did not finish within ${Math.round(this.timeoutMs / 1000)}s.`,
            undefined,
            true,
          ),
        );
      }, this.timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        if (!onLine) return;
        pending += text;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) onLine(line);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(this.spawnError(error));
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (onLine && pending.trim()) onLine(pending);
        if (code !== 0) {
          reject(
            new AiError(
              `Claude Code exited with code ${code}: ${
                stderr.trim().slice(0, 400) || "no output on stderr"
              }`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      });

      child.stdin?.on("error", () => {
        // The CLI can close stdin early; the close handler reports the outcome.
      });
      child.stdin?.end(prompt);
    });
  }

  private spawnError(error: unknown): AiError {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return new AiNotConfiguredError(
        `Could not find the Claude Code CLI at "${this.binary}". Install it, or set the full path in Settings.`,
      );
    }
    if (code === "EACCES") {
      return new AiNotConfiguredError(
        `"${this.binary}" is not executable. Check its permissions.`,
      );
    }
    return new AiError(
      error instanceof Error ? error.message : "Could not start Claude Code.",
      error,
    );
  }

  /** Reads the single JSON object `--output-format json` prints. */
  private parseResult(stdout: string): CliResult {
    let payload: CliResult;
    try {
      payload = JSON.parse(stdout.trim()) as CliResult;
    } catch (error) {
      throw new AiError(
        `Claude Code returned output that was not JSON: ${stdout.trim().slice(0, 200)}`,
        error,
      );
    }

    if (payload.is_error) {
      const detail = payload.result ?? "no detail";
      // The CLI reports a signed-out session in-band rather than as an exit code.
      if (/not logged in|\/login/i.test(detail)) {
        throw new AiNotConfiguredError(
          "Claude Code is not logged in. Run `claude` in a terminal and sign in, then try again.",
        );
      }
      throw new AiError(`Claude Code failed: ${detail.slice(0, 400)}`);
    }

    return payload;
  }

  private modelOf(payload: CliResult): string {
    return Object.keys(payload.modelUsage ?? {})[0] ?? this.model;
  }

  async generateText(req: GenerateRequest): Promise<TextResult> {
    const { stdout } = await this.run(
      [...this.baseArgs(req.system), "--output-format", "json"],
      req.prompt,
    );
    const payload = this.parseResult(stdout);

    return {
      text: payload.result ?? "",
      model: this.modelOf(payload),
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
        cacheReadTokens: payload.usage?.cache_read_input_tokens,
      },
    };
  }

  async generateObject<T extends z.ZodType>(
    req: ObjectRequest<T>,
  ): Promise<ObjectResult<z.output<T>>> {
    // The CLI has no schema-constrained output mode, so the contract goes in
    // the prompt and the reply is validated on the way back.
    const schema = toStrictJsonSchema(req.schema);
    const system = `${req.system}

Respond with a single JSON object and nothing else — no prose, no commentary, no markdown fence. It must validate against this JSON Schema:
${JSON.stringify(schema)}`;

    const { stdout } = await this.run(
      [...this.baseArgs(system), "--output-format", "json"],
      req.prompt,
    );
    const payload = this.parseResult(stdout);

    const raw = payload.result ?? "";
    if (!raw.trim()) throw new AiError("Claude Code returned an empty response.");

    let candidate: unknown;
    try {
      candidate = extractJsonObject(raw);
    } catch (error) {
      throw new AiError(
        `Claude Code did not return JSON: ${raw.slice(0, 200)}`,
        error,
      );
    }

    const parsed = req.schema.safeParse(candidate);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new AiError(
        `Claude Code output did not match the expected shape — ${issues}`,
      );
    }

    return {
      object: parsed.data as z.output<T>,
      model: this.modelOf(payload),
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
        cacheReadTokens: payload.usage?.cache_read_input_tokens,
      },
    };
  }

  async *streamText(req: GenerateRequest): AsyncIterable<string> {
    // `stream-json` emits NDJSON; text arrives as content_block_delta events.
    const queue: string[] = [];
    let done = false;
    let failure: unknown = null;
    let wake: (() => void) | null = null;

    const push = (chunk: string) => {
      queue.push(chunk);
      wake?.();
    };

    const finished = this.run(
      [
        ...this.baseArgs(req.system),
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
      ],
      req.prompt,
      (line) => {
        try {
          const event = JSON.parse(line) as {
            type?: string;
            event?: { type?: string; delta?: { type?: string; text?: string } };
          };
          if (
            event.type === "stream_event" &&
            event.event?.type === "content_block_delta" &&
            event.event.delta?.type === "text_delta" &&
            event.event.delta.text
          ) {
            push(event.event.delta.text);
          }
        } catch {
          // Non-JSON lines are progress noise; ignore them.
        }
      },
    )
      .catch((error) => {
        failure = error;
      })
      .finally(() => {
        done = true;
        wake?.();
      });

    while (!done || queue.length) {
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = () => {
          wake = null;
          resolve();
        };
      });
    }

    await finished;
    if (failure) throw failure;
  }
}
