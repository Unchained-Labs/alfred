# Configuration

Almost everything is configured in the **Settings** page and stored in the local
database. Environment variables exist for the credentials you'd rather not store.

## Environment

| Variable               | Effect                                                  |
| ---------------------- | ------------------------------------------------------- |
| `ALFRED_DB_PATH`       | Where the SQLite file lives. Default `./data/alfred.db` |
| `ANTHROPIC_API_KEY`    | Claude credentials                                      |
| `ALFRED_LLM_API_KEY`   | Bearer token for the OpenAI-compatible endpoint         |
| `ALFRED_AGENT_API_KEY` | Bearer token for a custom agent                         |

Copy `.env.example` to `.env` to set them. **The environment wins** where both it
and the stored setting are present, so you can leave the Settings fields blank
and keep credentials out of the database entirely.

## Settings

### You

| Field                               | Why it matters                                       |
| ----------------------------------- | ---------------------------------------------------- |
| Résumé / background                 | The single biggest driver of output quality          |
| Name, headline, years of experience | Framing for every prompt                             |
| Core skills                         | Used for coverage matching                           |
| Target roles, locations             | Feed the positioning angle                           |
| Compensation target                 | Compared against the posted range in the salary read |

### AI layer

See [AI providers](ai-providers.md).

### Mailbox

See [Mailbox](../guide/mailbox.md).

## Database

SQLite via Drizzle, in WAL mode with foreign keys on. Migrations in `drizzle/`
are applied on first render, so a fresh clone needs no setup.

```sh
npm run migrate       # apply pending migrations
npm run db:generate   # after editing src/db/schema.ts
npm run db:studio     # browse the data
```

## Scripts

| Command                   | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Dev server                                                |
| `npm run build` / `start` | Production build and serve                                |
| `npm run typecheck`       | `tsc --noEmit`                                            |
| `npm run lint` / `format` | ESLint / Prettier                                         |
| `npm run seed`            | **Destructive.** Replaces all data with the demo pipeline |
| `npm run reset:providers` | Clears provider and mailbox config, keeps your profile    |

`make help` lists the equivalent targets.
