# AI providers

Alfred defines one interface and implements it three ways. Switching provider is
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

|                          | Claude      | LLM endpoint                   | Custom agent          |
| ------------------------ | ----------- | ------------------------------ | --------------------- |
| Auth                     | API key     | optional bearer                | optional bearer       |
| Structured output        | native      | native, with a prompt fallback | your choice           |
| Streaming                | native      | SSE, with a fallback           | single chunk          |
| Data leaves your machine | yes         | only if the endpoint is remote | your choice           |
| Setup                    | paste a key | URL + model                    | implement an endpoint |

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

- **Best output** — Claude with a frontier model. Interview prep is a reasoning
  task, and it shows.
- **Full privacy** — a local endpoint. Your résumé, the job descriptions and your
  mail stay on the machine.
- **Something else entirely** — a custom agent.
