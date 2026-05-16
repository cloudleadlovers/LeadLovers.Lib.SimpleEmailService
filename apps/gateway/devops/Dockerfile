# syntax=docker/dockerfile:1.7
#
# Email gateway runtime image. Build context is the repo root so that both
# apps/lib and apps/gateway are reachable.
#
#   docker build -f apps/gateway/devops/Dockerfile -t <image>:<tag> .
#
# We run as root inside the container deliberately. Earlier versions tried
# USER bun for defense-in-depth, but the OCI agent's legacy Docker builder
# creates WORKDIR-paths as root regardless of the current USER, so
# `bun install` failed with EPERM on copyfile. Once the agent moves to
# BuildKit, USER bun can be reinstated; until then, root keeps the build
# reliable and the trust boundary lives at the OCI host.

FROM oven/bun:1.3-alpine

USER root
WORKDIR /app

# Workspace manifests first for better layer cache.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/lib/package.json ./apps/lib/
COPY apps/gateway/package.json ./apps/gateway/

# --backend=copyfile avoids hardlinks across overlay layers, which break
# under the legacy Docker builder. Drop the flag once the agent runs
# BuildKit.
RUN bun install --frozen-lockfile --backend=copyfile

# Source.
COPY apps/lib ./apps/lib
COPY apps/gateway ./apps/gateway

# Build the lib so apps/lib/dist/ exists. The lib's package.json points
# `main`, `types`, and `exports` at ./dist/index.js; without this step
# the gateway's `import '@leadlovers/simple-email-service'` resolves to
# a missing file. `bun run build` runs prisma generate, tsc, and copies
# the generated client into dist/.
RUN cd apps/lib && bun run build

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["bun", "run", "apps/gateway/src/index.ts"]
