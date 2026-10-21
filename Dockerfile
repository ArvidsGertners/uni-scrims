# syntax=docker/dockerfile:1
# Targets: web, bot, migrate (see ARCHITECTURE.md §8). Build context: repository root.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Manifests only, so the install layer is cached until dependencies change.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/

# ─── web ──────────────────────────────────────────────────────────────────────

FROM manifests AS web-build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @uni-scrims/web...
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @uni-scrims/db generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @uni-scrims/web build

FROM node:24-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Docker sets HOSTNAME to the container ID otherwise; the standalone server must listen on all interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ─── bot ──────────────────────────────────────────────────────────────────────

FROM manifests AS bot
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @uni-scrims/bot...
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/bot ./apps/bot
ENV NODE_ENV=production
WORKDIR /app/apps/bot
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]

# ─── migrate ──────────────────────────────────────────────────────────────────

FROM manifests AS migrate
# Prisma's schema engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @uni-scrims/db
COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma packages/db/prisma
WORKDIR /app/packages/db
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
