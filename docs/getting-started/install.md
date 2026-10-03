# Install

Alfred is a Next.js app that runs on your machine against a local SQLite file.

## Requirements

- **Node.js 22 or newer** — `better-sqlite3` requires it, and CI covers 22 and 24.
- A C toolchain for `better-sqlite3`. Prebuilt binaries cover most platforms; if
  yours isn't covered, npm compiles from source and you'll need `build-essential`
  (Debian/Ubuntu) or the Xcode command line tools (macOS).

## Optional

- The [Claude Code](https://claude.com/claude-code) CLI. If it is installed and
  signed in, Alfred can use it as a provider with no API key at all.

## Install

```sh
git clone https://github.com/Unchained-Labs/alfred.git
cd alfred
npm install
```

## Run

=== "Development"

    ```sh
    npm run dev
    ```

    Open <http://localhost:3000>.

=== "Production"

    ```sh
    npm run build
    npm run start
    ```

=== "Make"

    ```sh
    make dev        # or: make start
    make help       # everything else
    ```

The schema is applied on first render, so a fresh clone works with no setup
step. The database lives at `data/alfred.db` and is gitignored.

## Demo data

To see Alfred populated before wiring up a provider:

```sh
npm run seed
```

!!! warning "This is destructive"
`npm run seed` **deletes all existing applications** before inserting the
demo pipeline. Don't run it against a database you care about.

## Next

[Quick start →](quickstart.md) — point Alfred at a provider and run your first
analysis.
