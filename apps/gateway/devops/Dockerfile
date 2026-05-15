# syntax=docker/dockerfile:1.7
#
# Email gateway runtime image. Build context is the repo root so that both
# apps/lib and apps/gateway are reachable.
#
#   docker build -f apps/gateway/devops/Dockerfile -t <image>:<tag> .

FROM oven/bun:1.3-alpine

WORKDIR /app

# Workspace manifests first for better layer cache.
COPY --chown=bun:bun package.json bun.lock tsconfig.base.json ./
COPY --chown=bun:bun apps/lib/package.json ./apps/lib/
COPY --chown=bun:bun apps/gateway/package.json ./apps/gateway/

USER bun
RUN bun install --frozen-lockfile

# Source.
COPY --chown=bun:bun apps/lib ./apps/lib
COPY --chown=bun:bun apps/gateway ./apps/gateway

# Generate the Prisma client into apps/lib/src/generated/prisma/.
RUN cd apps/lib && bunx prisma generate

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["bun", "run", "apps/gateway/src/index.ts"]
