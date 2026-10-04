# FAQ

### Does my data leave my machine?

Only where you point it. Alfred stores everything in local SQLite and has no
backend of its own. Job descriptions, your résumé and (with triage on) email
bodies are sent to whichever AI provider you configure. Choose a local
OpenAI-compatible endpoint and nothing leaves at all.

### Where are my API keys stored?

In plaintext in `data/alfred.db`, which is gitignored. That's a deliberate trade
for a single-user local tool, and it means the file is as sensitive as the keys
in it. To avoid storing them, set `ANTHROPIC_API_KEY`, `ALFRED_LLM_API_KEY` or
`ALFRED_AGENT_API_KEY` in the environment and leave the Settings fields blank —
the environment takes precedence. The browser never receives a stored
credential.

### Can Alfred read my CV?

Yes — **Settings → You** takes a PDF (or `.txt` / `.md`). It extracts the text,
has your configured provider structure it, and shows you the result before
filling anything in. The text of your CV goes to whichever provider you have
configured, so a local endpoint or the local Claude Code CLI keeps it on your
machine.

Only the text layer is read, so a scanned or photographed CV will not work —
Alfred tells you that rather than returning a blank profile. There is no OCR.

### Can I use my Claude subscription instead of an API key?

Yes — pick **Local Claude Code** in Settings. It drives the `claude` CLI already
installed on your machine, using the credentials you signed in with, so calls go
against your subscription rather than per-token API billing. Structured output is
prompt-constrained rather than native there, and every call carries the CLI's own
system context, so it is slower and not free — but it needs no key at all.

### Can I use Alfred without an AI provider?

Yes, as a tracker. The board, timeline, follow-ups, notes and dashboard all work
without one. Analysis, prep plans, questionnaires, posting extraction, chat and
mail triage need a provider.

### Which model should I use?

Interview prep is a reasoning task, so a frontier model is noticeably better at
it — it reasons about skill adjacency rather than matching keywords. For local
models, structured output over a ten-field schema is demanding; below roughly 14B
you'll see validation failures.

### Why does the fit score feel harsh?

Deliberately. The prompt gives explicit calibration bands and tells the model to
score like a hiring manager, because an inflated score costs you interviews — you
spend effort on roles you won't get and skip preparation you needed. If a score
looks wrong, check that the job description and your résumé are both complete.

### Are the coding problems included in Alfred?

No. Alfred stores the reference — the problem's name, its DS&A pattern, why it
matters for that role — and links to the canonical version. The problem text
belongs to whoever published it.

### Will Alfred move an application when an email arrives?

No. Triage can _suggest_ a stage, and it links an email to an application when it
is confident and the company is already tracked, but applying a stage change is
always your action. Acting on a misclassification would silently corrupt your
funnel.

### Can it read my Gmail?

Over IMAP with an app password, read-only. There is no OAuth flow and no Gmail
API integration — Alfred never marks, moves, deletes or sends anything.

### Does the seed script destroy my data?

Yes. `npm run seed` deletes all applications before inserting the demo pipeline.
It exists to show Alfred populated before you've wired up a provider.

### Can I run this on a server for my team?

Not as it stands. Alfred has no authentication and assumes a single user; exposing
it would hand anyone who reaches it your résumé, your mail and your provider keys.

### How do I back it up?

Copy `data/alfred.db`. That file is the entire application state.

### Something broke after I pulled

```sh
npm install && npm run migrate && npm run build
```

Migrations also run automatically on first render.
