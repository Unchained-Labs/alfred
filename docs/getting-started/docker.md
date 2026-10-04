# Docker

One command, and no database to stand up first:

```sh
docker compose up -d --build
```

Then open <http://127.0.0.1:3100>. The schema is created and migrated on first
render, exactly as when you run Alfred with `npm run dev`.

`make docker-up` does the same and prints the URL.

## What you get

| | |
|---|---|
| **Image** | Multi-stage, `node:22-bookworm-slim`, runs as the non-root `node` user |
| **Port** | `127.0.0.1:3100` — loopback only, deliberately |
| **Data** | Named volume `alfred-data`, mounted at `/data` |
| **Health** | `/api/health`, which asks SQLite a question rather than returning a constant |

## Why it binds loopback

Alfred has **no authentication of its own**, and it holds your résumé, your
application history and whichever provider key you gave it. Publishing the
container to every interface puts all three on your local network.

Put something in front of it that does have auth — a Tailscale sidecar, an SSH
tunnel, an authenticating reverse proxy — rather than changing the binding. If
you do change it, you are deciding that everyone on that network may read your
job hunt.

## Why not Alpine

`better-sqlite3` is a native module compiled against a specific libc. On Alpine
(musl) the prebuilt binary does not apply, the source build needs a toolchain
you then have to ship or strip, and the failure shows up as an `invalid ELF
header` the first time a page touches the database — not at build time, where
you would catch it.

Every stage is `bookworm-slim` (glibc), so the stage that compiles the module
and the stage that loads it agree.

The compiled module is also copied into the runtime image explicitly. Next's
standalone tracing is good at JavaScript and worst at exactly this: it can copy
the wrapper around a native module and miss the `.node` binary, producing an
image that looks correct until the first query.

## Why the build runs a migration

`src/db/index.ts` opens SQLite at module scope, so importing anything from
`@/db` connects — including during `next build`, which collects page data in
parallel workers. On a fresh build several of them race to create and migrate
the same new file and it fails with `database is locked`.

The Dockerfile migrates once to a throwaway path in `/tmp` first, so the
workers open a file that already exists. It never leaves the builder stage.

The better fix is to open the handle lazily so a build never touches a
datastore at all — a change to the data layer rather than the container.

## Your data

The database lives on the `alfred-data` volume, never in an image layer.

```sh
docker compose down       # stop; the volume is kept
docker compose down -v    # stop AND delete the database (destructive)
```

`make docker-reset` is the second one, named so nobody runs it by accident.

To back it up, copy `alfred.db`, `alfred.db-wal` and `alfred.db-shm` together,
or stop the container first. Copying only the `.db` while the app is running
gives you a file missing the most recent writes.

## Providers

Every key is optional and can be set in **Settings**, which stores it in the
database. Environment wins where both are present:

```sh
ANTHROPIC_API_KEY=sk-ant-… docker compose up -d
```

Or put them in a `.env` beside the compose file — it is in `.dockerignore`, so
Compose reads it and the image never sees it.
