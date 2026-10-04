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
# No `COPY /app/public`: this app has no public/ directory, and COPY fails the
# build on a missing source rather than skipping it. Add it back the day a
# public/ appears.
#
# The native module, copied whole. Standalone tracing can take the JavaScript
# around a native module and miss the compiled .node file, which produces an
# image that looks correct until the first query.
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

USER node
EXPOSE 3100
VOLUME ["/data"]

# Hits the app's own health route rather than the root page: the root renders
# the dashboard, which touches the database, so a root-based check would report
# unhealthy during a slow first migration when the server is in fact fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
