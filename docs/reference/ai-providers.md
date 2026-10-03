# AI providers

Alfred defines one interface and implements it four ways. Switching provider is
a dropdown; no other behaviour changes.

```ts title="src/lib/ai/types.ts"
interface AiProvider {
  generateText(req: GenerateRequest): Promise<TextResult>;
  generateObject<T extends z.ZodType>(
    req: ObjectRequest<T>,
  ): Promise<ObjectResult<z.output<T>>>;
  streamText(req: GenerateRequest): AsyncIterable<string>;
}
```

The zod schemas in `src/lib/ai/schemas.ts` are the single source of truth. They
are compiled to the Anthropic SDK's output format for Claude and to strict JSON
Schema for everything else, then validated on the way back **regardless of
provider** — a malformed analysis is rejected rather than written to the database.

## Comparison

|                          | Claude      | Local Claude Code               | LLM endpoint                   | Custom agent          |
| ------------------------ | ----------- | ------------------------------- | ------------------------------ | --------------------- |
| Auth                     | API key     | **your existing CLI sign-in**   | optional bearer                | optional bearer       |
| Billing                  | per token   | your subscription               | per token, or free locally     | your choice           |
| Structured output        | native      | prompt-constrained              | native, with a prompt fallback | your choice           |
| Streaming                | native      | native                          | SSE, with a fallback           | single chunk          |
| Data leaves your machine | yes         | yes                             | only if the endpoint is remote | your choice           |
| Setup                    | paste a key | nothing, if `claude` is on PATH | URL + model                    | implement an endpoint |

## Claude

The Anthropic API through the official SDK. Structured operations use the SDK's
schema-constrained output, so the result is guaranteed to parse.

| Setting          | Notes                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| API key          | From the console, or `ANTHROPIC_API_KEY` in the environment                 |
| Model            | Opus 5 by default; Sonnet and Haiku are cheaper                             |
| Reasoning effort | `low` … `max`. Higher means more thinking and better analysis, at more cost |

Errors are surfaced verbatim rather than flattened into a 500 — an invalid key
reads "Anthropic rejected the API key", a rate limit says so and is marked
retryable.

## Local Claude Code

Drives the [Claude Code](https://claude.com/claude-code) CLI already installed on
your machine, in non-interactive mode. **This is the only provider that needs no
API key** — the CLI resolves the credentials you signed in with, so calls bill
against that subscription instead of per token.

| Setting          | Notes                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Model            | An alias (`opus`, `sonnet`, `haiku`, `fable`) or a full model id |
| Reasoning effort | Passed through to the CLI's `--effort`                           |
| CLI path         | `claude` by default; give an absolute path if it isn't on `PATH` |

If **Test connection** reports that Claude Code is not logged in, run `claude` in
a terminal, sign in, and try again.

### How Alfred invokes it

```sh
claude -p --model opus --effort high \
  --no-session-persistence --disable-slash-commands \
  --disallowedTools Bash Read Write Edit … \
  --append-system-prompt '<the system prompt>' \
  --output-format json          # stream-json for chat
```

The prompt goes in on **stdin**, and the arguments are passed as an array rather
than through a shell — so a job description full of shell metacharacters is inert.

!!! warning "Every tool is denied, deliberately"
Job descriptions and emails are untrusted input that reach the model. Alfred
only ever wants text back, so it denies `Bash`, `Read`, `Write`, `Edit`,
`WebFetch` and the rest. Without that, a posting could in principle talk the
agent into touching your filesystem.

### Trade-offs

- **Structured output is prompt-constrained, not native.** The CLI has no
  schema-constrained output mode, so Alfred inlines the JSON Schema and validates
  the reply on the way back. A frontier model gets this right in practice, but it
  is a weaker guarantee than the API path.
- **Each call carries Claude Code's own system context** — on the order of 14k
  cached tokens before your prompt even starts. It is not free, it is billed to
  your subscription.
- **It is slower.** Process start-up plus the agent's own setup puts a floor of a
  few seconds on every call.
- **`--bare` is deliberately not used.** It would cut that context overhead, but
  it also stops the CLI reading OAuth credentials — which is precisely what this
  provider depends on.

## LLM endpoint

Any server exposing `POST /v1/chat/completions`: Ollama, LM Studio, vLLM,
llama.cpp, OpenRouter, Groq, Together, or your own gateway. Alfred uses plain
`fetch` rather than an SDK so partial implementations work.

```
Base URL   http://localhost:11434     # /v1 is appended if missing
Model      qwen2.5:14b
```

Two fallbacks make imperfect servers usable:

- **No `response_format` support?** Alfred retries once with the JSON Schema
  inlined into the system prompt, then extracts and validates the JSON from the
  reply — including out of a markdown fence.
- **Ignores `stream: true`?** If the response isn't an event stream, Alfred reads
  the whole completion and yields it as one chunk, so chat still works.

!!! tip "Model size matters here"
Structured output over a ten-field schema is demanding. Models below roughly
14B often produce JSON that doesn't validate. If analyses fail with "did not
match the expected shape", try a larger model before anything else.

## Custom agent

Alfred POSTs a task envelope to your endpoint and validates whatever comes back.
Use this to put your own orchestration, retrieval or model routing in front of
Alfred.

[Full agent API →](agent-api.md)

## Which to choose

- **Already have Claude Code** — the local CLI. Nothing to configure, no key, and
  no per-token bill.
- **Best output** — Claude with a frontier model. Interview prep is a reasoning
  task, and it shows.
- **Full privacy** — a local endpoint. Your résumé, the job descriptions and your
  mail stay on the machine.
- **Something else entirely** — a custom agent.
