# Alfred in a container.
#
# Two things about this app decide the shape of this file, and both fail at
# runtime rather than at build time if you get them wrong.
#
# better-sqlite3 is a NATIVE module, so the stage that compiles it and the stage
# that loads it must agree on libc. That is why every stage here is
# bookworm-slim (glibc) rather than the alpine (musl) most Next.js Dockerfiles
# reach for: on alpine the prebuilt binary does not apply, the source build
# needs a toolchain you then ship or strip, and the failure arrives as an
# "invalid ELF header" the first time a page touches the database.
#
# And next.config.ts lists better-sqlite3 in serverExternalPackages, so Next
# deliberately does not bundle it. It stays a real require at runtime, which
# means node_modules must be present in the image.

# ---------------------------------------------------------------- dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# For better-sqlite3 when no prebuild matches this platform. They stay in THIS
# stage: the runtime image never sees a compiler, which is smaller and one less
# thing to patch.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# `npm ci`, not `npm install`: the lockfile is the input, and a build that
# silently resolves a different tree than CI is a build nobody reviewed.
RUN npm ci

# --------------------------------------------------------------------- builder
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# The build needs a database, and that is worth explaining because it looks
# wrong — it is.
#
# src/db/index.ts opens SQLite at MODULE SCOPE, so importing anything from @/db
# connects. `next build` collects page data for every route in parallel workers,
# so a fresh build has several processes racing to create and migrate the same
# new file and dies with "database is locked". It passes on a developer's
# machine only because a migrated data/alfred.db is already sitting there.
#
# So: migrate once, to a throwaway path, before the build. The workers then open
# a file that already exists, which SQLite is happy to share.
#
# /tmp, not ./data — this is a build artefact and must not be mistaken for
# anyone's data. It never leaves this stage.
#
# The proper fix is to open the handle lazily so a build never touches a
# datastore at all. That is a change to the data layer, not the container, and
# belongs in its own pull request.
ENV ALFRED_DB_PATH=/tmp/alfred-build.db
RUN npm run migrate && npm run build

# --------------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    ALFRED_DB_PATH=/data/alfred.db

# The data directory is created and owned here rather than left to the mount: a
# bind mount arrives owned by root and the app's first write would fail.
RUN mkdir -p /data && chown -R node:node /data

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# public/ holds the self-hosted fonts. Next does not bundle or trace static
# files, so without this line the app builds and serves while every page falls
# back to a system face — the one failure mode that looks like a design choice.
COPY --from=builder --chown=node:node /app/public ./public
#
# The native module, copied whole. Standalone tracing can take the JavaScript
# around a native module and miss the compiled .node file, which produces an
# image that looks correct until the first query.
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
# The exercise runner, and the Python it runs.
#
# runner/python-runner.mjs is spawned as a child process by absolute path, so
# Next never bundles it and standalone tracing never sees it. Pyodide is reached
# only from that script — also invisible to tracing — and it is the whole point:
# without it, generating or submitting a coding exercise fails at runtime while
# every other page works, which is the worst shape a missing file can take.
#
# Both are copied whole. pyodide carries its own .wasm and python_stdlib.zip
# beside its JavaScript, and taking only what an import graph mentions would
# leave a package that loads and then cannot start an interpreter.
COPY --from=builder --chown=node:node /app/runner ./runner
COPY --from=builder --chown=node:node /app/node_modules/pyodide ./node_modules/pyodide

# And prove it runs, in the image that will ship, while a failure is still a
# failed build rather than a 502 the first time someone submits an exercise.
# It boots a real interpreter and checks a real assertion, so a pyodide that
# copied without its wasm, or a Node that cannot resolve it from runner/, does
# not get out of this stage.
RUN node -e "process.stdout.write(JSON.stringify({code:'def ok():\n    return 1\n',tests:[{name:'boots',call:'ok()',expect:'1',hidden:false}]}))" > /tmp/runner-job.json \
 && node runner/python-runner.mjs < /tmp/runner-job.json | grep -q '"passed":true' \
 && rm -f /tmp/runner-job.json \
 && echo "exercise runner verified"

# The migrations themselves. src/app/layout.tsx calls runMigrations(), so EVERY
# page renders through drizzle reading ./drizzle/meta/_journal.json at a path
# relative to the working directory. Standalone tracing cannot see it — it is
# read at runtime by a string path, not imported — so without this line the
# image builds, starts, and answers /api/health happily while every single page
# returns 500 "Can't find meta/_journal.json file".
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

USER node
EXPOSE 3100
VOLUME ["/data"]

# Checks BOTH the health route and the root page, and needs both to pass.
#
# /api/health alone is not enough, and the way that was discovered is the reason
# for this comment: a route handler does not render the root layout, so when the
# migrations folder was missing from this image the health route answered
# {"ok":true} while every page in the app returned 500. A check that cannot
# observe the failure mode you have is not a check.
#
# The root page touches the database and runs migrations, so a cold start is
# slow — that is what start-period and retries are for, rather than a reason to
# probe something cheaper and less truthful.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const b='http://127.0.0.1:'+(process.env.PORT||3100);Promise.all([fetch(b+'/api/health'),fetch(b+'/')]).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
