# Contributing to Alfred

Thanks for taking an interest. Alfred is a local-first job-hunt tracker, so most
changes are small and self-contained — a new provider, a prep-plan tweak, a
better chart.

## Before you start

- For anything beyond a bug fix, open an issue first so we can agree on the
  shape before you write it.
- Check [SECURITY.md](https://github.com/Unchained-Labs/alfred/blob/main/SECURITY.md) if you've found a vulnerability — please
  don't open a public issue for that.

## Development setup

```sh
make install
make dev          # http://localhost:3000
make seed         # optional demo pipeline — destructive, wipes existing data
```

The SQLite schema is applied on first render, so there is no setup step. The
database lives at `data/alfred.db` and is gitignored.

Before pushing:

```sh
make check        # typecheck, lint, format, build
```

## Project layout

```
src/
├── app/                  # App Router — pages and API routes
├── components/
│   ├── ui/               # Primitives (Radix-backed)
│   ├── charts/           # Stat tiles, funnel, activity, meters, skill bars
│   ├── shell/            # Sidebar, topbar, command palette
│   └── …                 # Feature areas
├── db/                   # Drizzle schema and client
└── lib/
    ├── ai/               # Provider interface, providers, prompts, schemas
    ├── mail/             # IMAP client and sync/triage
    ├── queries.ts        # Reads
    ├── mutations.ts      # Writes, with timeline events
    └── settings.ts       # Settings store and redaction
```

## Adding an AI provider

Implement `AiProvider` from `src/lib/ai/types.ts` — three methods:
`generateText`, `generateObject`, `streamText`. Then:

1. Add the config shape to `ProviderConfig` in the same file.
2. Register it in `createProvider` and `resolveProvider` in `src/lib/ai/index.ts`.
3. Add its defaults to `DEFAULT_SETTINGS` in `src/lib/settings.ts`, and redact
   its credential in `redactSettings` — the browser must never receive a stored
   secret.
4. Add a card and a config panel to the AI tab in
   `src/components/settings/settings-view.tsx`.

`generateObject` must validate against the supplied zod schema and throw an
`AiError` naming the offending fields if it doesn't match. Don't return partial
objects — a caller that gets a malformed analysis writes it straight to the
database.

## Changing the database schema

Edit `src/db/schema.ts`, then:

```sh
npm run db:generate       # writes a migration to drizzle/
```

Commit the generated SQL. Migrations run automatically on first render, so never
edit an already-released migration — add a new one.

## Working on charts

Chart colour is not a matter of taste here. Series, ordinal ramps and status
colours come from a validated palette, and the rules are in `src/app/globals.css`
next to the tokens:

- **Pipeline stages are ordinal** — one hue, stepped. Not categorical slots.
- **Actionable kinds are categorical** — fixed palette slots assigned in order,
  never cycled.
- **Fit score and skill coverage are status** — the reserved status colours, and
  always with an icon or text label so colour never carries the meaning alone.

If you add a colour, validate it against both surfaces rather than eyeballing it.

## Pull requests

- One logical change per PR; keep diffs reviewable.
- `make check` must pass.
- Update `CHANGELOG.md` under `## [Unreleased]` if users will notice the change.
- Update the docs under `docs/` if you changed behaviour.
- Never commit real résumés, API keys, mailbox credentials, or `data/*.db`.

Commit messages: a short imperative subject, then why rather than what.

## Code of Conduct

This project follows the [Contributor Covenant](https://github.com/Unchained-Labs/alfred/blob/main/CODE_OF_CONDUCT.md).
