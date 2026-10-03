# Custom agent API

The **Custom agent** provider lets you put your own service between Alfred and
whatever model or orchestration you like. Alfred POSTs a task envelope and
validates the response.

## Configuration

**Settings → AI layer → Custom agent**:

| Field        | Notes                                                                |
| ------------ | -------------------------------------------------------------------- |
| Endpoint     | The URL Alfred POSTs to                                              |
| Agent name   | Optional; passed through as `agent` so one endpoint can host several |
| Bearer token | Optional; sent as `Authorization: Bearer <token>`                    |

## Request

```jsonc
{
  "task": "analyze_job", // which operation is running
  "agent": "job-coach", // from Settings, when set
  "system": "You are Alfred…", // the system prompt
  "prompt": "<candidate>…</job>", // candidate and job context
  "responseType": "object", // or "text"
  "schema": {/* JSON Schema */}, // only when responseType is "object"
  "schemaName": "job_analysis",
  "maxTokens": 16000,
}
```

### Tasks

| `task`                   | When                                    |
| ------------------------ | --------------------------------------- |
| `analyze_job`            | Fit analysis                            |
| `generate_actionables`   | Prep plan                               |
| `generate_questionnaire` | Interview questions                     |
| `parse_job_posting`      | Extracting fields from a pasted posting |
| `triage_email`           | Each new email during a mailbox sync    |
| `chat`                   | Ask Alfred                              |
| `connectivity_check`     | The **Test connection** button          |

## Response

Any of these shapes works:

```jsonc
{ "object": { /* matching the schema */ } }   // structured tasks
{ "object": "{\"fitScore\": 72, …}" }         // a JSON string is parsed too
{ "text": "…" }                               // `output` and `content` also accepted
{ "error": "what went wrong" }                // surfaced to the user verbatim
```

A `model` field, if present, is recorded against the analysis so you can see
later what produced it. A non-JSON `content-type` is treated as plain text, so a
text-only agent needs no JSON at all for `responseType: "text"`.

If the response doesn't validate against the schema, Alfred reports the offending
field paths rather than writing a partial record.

## A minimal agent

```js title="agent.mjs"
import http from "node:http";

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { task, system, prompt, responseType, schema } = JSON.parse(body);

    const answer = await yourModel({
      system:
        responseType === "object"
          ? `${system}\n\nReply with JSON matching:\n${JSON.stringify(schema)}`
          : system,
      prompt,
    });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        responseType === "object"
          ? { object: answer, model: "my-agent-v2" }
          : { text: answer, model: "my-agent-v2" },
      ),
    );
  })
  .listen(4997);
```

Point Alfred at `http://localhost:4997` and press **Test connection** — it sends
a `connectivity_check` and expects the reply to contain `ALFRED OK`.

!!! tip "Driving a local CLI"
This is also the way to use a locally installed coding agent: have the
endpoint spawn it in non-interactive mode and return its output.
