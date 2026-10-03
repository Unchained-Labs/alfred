<div align="center">

# Alfred

**Your job-hunt butler.**

Track every application you have in flight, and turn each one into concrete work:<br>
a calibrated fit score, a prep plan of real problems and concepts, and the interview
questions that role is actually going to ask.

[![CI](https://github.com/Unchained-Labs/alfred/actions/workflows/ci.yml/badge.svg)](https://github.com/Unchained-Labs/alfred/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-unchained--labs.github.io-e3b23c)](https://unchained-labs.github.io/alfred/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Documentation](https://unchained-labs.github.io/alfred/)** · [Quick start](#quick-start) · [AI providers](#the-ai-layer) · [Changelog](CHANGELOG.md)

</div>

It runs locally against SQLite. Nothing leaves your machine except the calls you
configure to an AI provider and, optionally, a read-only IMAP connection.

---

## What it does

**Track** — A drag-and-drop pipeline across nine stages, with a timeline that
records every move, note, and email. Add applications by hand, or paste a job
posting and let Alfred extract the fields.

**Analyze** — A fit score calibrated like a hiring manager rather than a
cheerleader, with skill-by-skill coverage, the gaps worth closing, and a
positioning angle for your résumé.

**Prepare** — A prep plan built for _that_ role: coding problems chosen for the
patterns the company's stack implies, concepts targeting your gaps, system
design prompts framed around their product, and the behavioral stories to
rehearse. Plus a questionnaire with draft answers grounded in your real
background.

**Ingest** — Connect an IMAP mailbox and Alfred pulls in recruiter mail,
classifies it, and matches it to your pipeline. High-confidence matches link
themselves; stage changes always stay manual.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The database is created and migrated on first
render — there is no setup step.

Then, in **Settings**:

1. **You** — paste your résumé. This is the single biggest driver of output
   quality; everything Alfred says about a role is measured against it.
2. **AI layer** — pick a provider and test the connection.
3. **Mailbox** — optional. IMAP host, user, and an app password.

Want to see it populated before wiring anything up?

```bash
npm run seed    # six applications, a prep plan, a questionnaire, and some mail
```

> `npm run seed` **deletes all existing applications** before inserting the
> demo data. Don't run it against a database you care about.

---

## The AI layer

Alfred talks to all four provider types through one interface
(`src/lib/ai/types.ts`), so switching is a dropdown and nothing else changes.
Structured operations are schema-constrained in every case — the schemas in
`src/lib/ai/schemas.ts` are the single source of truth, compiled to the
Anthropic SDK's format for Claude and to strict JSON Schema for the others.

### Claude

An API key from the Anthropic Console, or `ANTHROPIC_API_KEY` in the
environment. Model and reasoning effort are configurable; the default is
`claude-opus-5` at `high` effort with adaptive thinking.

### Local Claude Code

The `claude` CLI already installed on your machine, driven non-interactively.
**No API key** — it uses the credentials you signed in with, so calls bill
against that subscription rather than per token. Pick it and press _Test
connection_; if `claude` is on your `PATH` there is nothing else to configure.

Alfred passes arguments as an array rather than through a shell, sends the prompt
on stdin, and denies every tool — a job description is untrusted input, and
Alfred only ever wants text back. Structured output is prompt-constrained rather
than native here, and each call carries the CLI's own system context, so it is
slower than the API path and not free.

### Any OpenAI-compatible endpoint

Anything exposing `/v1/chat/completions`: Ollama, LM Studio, vLLM,
llama.cpp, OpenRouter, Groq, Together, or your own gateway. Give it a base URL
and a model name. If the server rejects `response_format`, Alfred retries once
with the schema inlined into the prompt and repairs the JSON on the way back,
so partial implementations still work.

### Your own agent

Alfred `POST`s a task envelope and accepts whatever you send back:

```jsonc
// Request
{
  "task": "analyze_job", // which operation is running
  "agent": "job-coach", // optional, from Settings
  "system": "...", // the system prompt
  "prompt": "...", // candidate + job context
  "responseType": "object", // or "text"
  "schema": {/* JSON Schema */}, // only when responseType is "object"
  "schemaName": "job_analysis",
  "maxTokens": 16000,
}
```

```jsonc
// Response — any one of these shapes
{ "object": { /* matching the schema */ } }
{ "text": "..." }                   // `output` and `content` also accepted
{ "error": "what went wrong" }      // surfaced to the user verbatim
```

A JSON string in `object`, or JSON inside `text`, is parsed and validated
either way. Validation failures are reported with the offending field paths
rather than swallowed.

### Operations

| Operation                | Trigger                                           |
| ------------------------ | ------------------------------------------------- |
| `parse_job_posting`      | Pasting a posting into the add-application dialog |
| `analyze_job`            | **Analyze this role** on an application           |
| `generate_actionables`   | **Build my prep plan**                            |
| `generate_questionnaire` | **Draft the questions**                           |
| `triage_email`           | Each new email during a mailbox sync              |
| `chat`                   | Ask Alfred, streamed                              |

---

## Mailbox

Plain IMAP, read-only — Alfred never marks, moves, or deletes anything. For
Gmail or Outlook, use an app password, not your account password.

Each sync fetches mail newer than your lookback window, dedupes on `Message-ID`,
and (if triage is on) classifies each new message. An email is auto-linked only
when the model's confidence is at least 0.75 _and_ the company resolves to one
already in your pipeline. Everything else waits in the inbox for you.

---

## Architecture

```
src/
├── app/                  # Next.js App Router — pages and API routes
├── components/
│   ├── ui/               # Primitives (Radix-backed)
│   ├── charts/           # Stat tiles, funnel, activity, meters, skill bars
│   ├── shell/            # Sidebar, topbar, command palette
│   ├── applications/     # Board, cards, form, detail panels
│   ├── dashboard/ prep/ inbox/ settings/
├── db/                   # Drizzle schema and client
└── lib/
    ├── ai/               # Provider interface, three providers, prompts, schemas
    ├── mail/             # IMAP client and sync/triage
    ├── queries.ts        # Reads
    ├── mutations.ts      # Writes, with timeline events
    └── settings.ts       # Settings store, redaction
```

**Stack** — Next.js 16, React 19, TypeScript, Tailwind v4, Drizzle + SQLite
(`better-sqlite3`), Radix primitives, Recharts, dnd-kit.

**Data viz** — The palette is validated, not eyeballed. Pipeline stages are
_ordinal_, so they take a single-hue blue ramp; actionable kinds are
_categorical_ and take fixed palette slots in order; fit scores and skill
coverage are _status_, so they use the reserved status colors and always ship
an icon or text label alongside. Both themes were validated against Alfred's
own surfaces.

### Scripts

| Command                   | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Dev server                                                |
| `npm run build` / `start` | Production build and serve                                |
| `npm run typecheck`       | `tsc --noEmit`                                            |
| `npm run seed`            | **Destructive.** Replaces all data with the demo pipeline |
| `npm run db:generate`     | New migration from a schema change                        |
| `npm run db:studio`       | Drizzle Studio                                            |

---

## Documentation

Full documentation is at **<https://unchained-labs.github.io/alfred/>** — guides for
[tracking](https://unchained-labs.github.io/alfred/guide/tracking/),
[analysis](https://unchained-labs.github.io/alfred/guide/analysis/),
[prep](https://unchained-labs.github.io/alfred/guide/prep/) and the
[mailbox](https://unchained-labs.github.io/alfred/guide/mailbox/), plus the
[provider comparison](https://unchained-labs.github.io/alfred/reference/ai-providers/)
and the [custom agent API](https://unchained-labs.github.io/alfred/reference/agent-api/).

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## A note on secrets

API keys and your mailbox password are stored **in plaintext** in the local
SQLite database at `data/alfred.db`, which is gitignored. That is a deliberate
trade for a single-user local tool, but it does mean the file is as sensitive as
the credentials in it. If you would rather not store them at all, set
`ANTHROPIC_API_KEY`, `ALFRED_LLM_API_KEY`, or `ALFRED_AGENT_API_KEY` in the
environment instead and leave the Settings fields blank — Alfred prefers the
environment. The browser never receives a stored credential; the settings API
sends back only whether one is present.
