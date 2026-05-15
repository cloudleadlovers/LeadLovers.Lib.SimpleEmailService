# LeadLovers Simple Email Service

A two-artifact monorepo for sending transactional email through LeadLovers infrastructure. The contract is a single `email.send({ projectId, to, subject, message })` call that writes one row into the legacy `EmailSequence` table; an internal LeadLovers worker picks the row up and dispatches the message. This repo owns the contract once and exposes it in two shapes so that both modern and legacy backends can consume it.

| App                                                                | Path                            | Shape                                   | Distribution                              |
| ------------------------------------------------------------------ | ------------------------------- | --------------------------------------- | ----------------------------------------- |
| [`@leadlovers/simple-email-service`](./apps/lib/README.md)         | [`apps/lib/`](./apps/lib)       | ESM TypeScript library, Node 20+ / Bun. | Published to npm.                         |
| [Email gateway](./apps/gateway/README.md)                          | [`apps/gateway/`](./apps/gateway) | Bun HTTP service wrapping the lib.    | Docker image on Docker Hub, deployed to the OCI agent pool by Azure Pipelines. |

The lib is the source of truth. The gateway is a thin network adapter on top of it (about 80 lines of code, plus tests) so that consumers that cannot import an ESM / Node 20+ package, such as `99webinar.Functions.Notifications` on Node 12 / CommonJS / AdonisJS, can still send mail through the same code path. Modern consumers like `LeadLovers.Api` import the lib directly and skip the network hop.

The full product spec lives in [`PRD.md`](./PRD.md). The decision behind the lib + gateway split is captured in commit history and in the consumer audit that produced it.

## Repo layout

```
.
├── apps/
│   ├── lib/                            @leadlovers/simple-email-service (npm)
│   │   ├── src/                          orchestrator, schemas, errors, db/cache/utils
│   │   ├── prisma/schema.prisma          manually maintained map of EmailSequence
│   │   ├── tests/unit/                   78 unit tests
│   │   ├── tests/integration/            gated on TEST_DATABASE_URL + TEST_REDIS_URL
│   │   └── package.json, tsconfig*.json, README.md, LICENSE
│   └── gateway/                        @leadlovers/simple-email-gateway (Docker)
│       ├── src/{index,server}.ts         Bun.serve + createFetch(deps)
│       ├── tests/server.test.ts          14 unit tests with a stubbed email
│       ├── devops/{Dockerfile,docker-compose.yml}
│       ├── azure-pipelines.gateway.yml
│       └── package.json, tsconfig.json, README.md
├── .github/workflows/
│   ├── ci.yml                          typecheck + unit tests, lib build smoke on Node 20/22
│   └── release-lib.yml                 publish lib to npm on `lib-v*` tag push
├── tsconfig.base.json                  shared TS config, extended by each app
├── package.json                        workspace root, scripts use bun --filter='*'
├── bun.lock                            single lockfile for both apps
├── .dockerignore                       trims gateway build context
├── PRD.md                              product spec for the contract
├── CLAUDE.md                           agent / contributor working notes
├── LICENSE                             MIT
└── README.md                           this file
```

## The lib

`@leadlovers/simple-email-service` exposes a single function. Consumers install it from npm alongside the four peer deps (`@prisma/client`, `@prisma/adapter-mssql`, `redis`, `zod`), configure two env vars (`DATABASE_URL`, `REDIS_URL`), and call `email.send`. The result is a discriminated union that never throws for per-call operational outcomes; only `EmailConfigError` throws, once at boot, when env config is missing.

The interesting behavior lives in `apps/lib/src/send.ts`: Zod validation, implicit Redis-backed idempotency keyed on `sha256(projectId|to|subject)` with a 10-minute TTL, per-project rate limiting at 60 sends per minute, then a Prisma insert into `EmailSequence`. The full consumer-facing documentation lives at [`apps/lib/README.md`](./apps/lib/README.md); the design choices and error contract live in [`PRD.md`](./PRD.md).

## The gateway

`apps/gateway/` is a Bun HTTP service. One real route, `POST /v1/emails/send`, forwards a JSON body to `email.send` and returns the result, with HTTP status mapped from the result code (200 / 400 / 429 / 502 / 503). Two probe routes, `GET /health` and `GET /ready`, return `200 ok` for orchestrator liveness and readiness. Optional shared-secret auth via the `GATEWAY_API_KEY` env var enables an `x-internal-key` header check; when unset, the trust boundary moves to the network layer. See [`apps/gateway/README.md`](./apps/gateway/README.md) for the endpoint table and full status mapping.

## Development

Bun workspaces. From the repo root:

```bash
bun install                              # installs deps for every workspace
bun run typecheck                        # typechecks every workspace
bun run test                             # runs every workspace's unit tests
bun run build                            # runs every workspace's build script
```

Per-app:

```bash
cd apps/lib && bun run build             # emits apps/lib/dist/ for npm publish
cd apps/lib && bun run test:int          # integration tests, gated on env
cd apps/gateway && bun run dev           # bun --hot run src/index.ts
cd apps/gateway && bun run start         # production mode
```

Integration tests for the lib require a real SQL Server reachable via `TEST_DATABASE_URL` and a real Redis reachable via `TEST_REDIS_URL`. Without those, the integration suite is silently skipped. Unit tests run with no external services.

## Publishing the lib to npm

Releases are triggered by pushing a tag matching `lib-v*` (for example `lib-v0.1.0`). `.github/workflows/release-lib.yml` watches for those tags and runs the full pipeline: frozen install, build, unit tests, `npm pkg set version=` derived from the tag, then `npm publish --access public --provenance` from inside `apps/lib/`. The version that ends up on npm is whatever follows `lib-v` in the tag name, regardless of what `apps/lib/package.json` currently says on `main`, so the tag is the single source of truth for releases.

### One-time setup

These steps need to happen once before the first publish.

**npm side.**

1. Create the `@leadlovers` organization on npm at <https://www.npmjs.com/org/create>. If `leadlovers` is taken, pick a scope you can own and update the `name` field in `apps/lib/package.json`.
2. Add the publishing account as an Owner or Developer of the org with publish rights on the `@leadlovers/simple-email-service` package.
3. Enable 2FA on the publishing account.
4. Generate a token of type **Automation** at <https://www.npmjs.com/settings/your-username/tokens> and copy the value. Automation tokens are the only kind that work non-interactively with 2FA.

**GitHub side.**

1. Open repo settings, go to `Secrets and variables → Actions → New repository secret`, and add the npm Automation token as `NPM_TOKEN`. The name must match exactly.
2. Verify GitHub Actions can mint OIDC tokens. The release workflow declares `permissions: id-token: write`, which is required for `--provenance`. If the org has a default policy that strips write permissions, override it for this repo.
3. Optionally, add branch protection on `main` that requires `CI` (`ci.yml`) to be green. This prevents a release tag from pointing at a broken commit.

### Releasing a version

Once setup is in place, releasing is one command pair:

```bash
git tag lib-v0.1.0
git push origin lib-v0.1.0
```

Watch the workflow at `Actions → Release lib`. When it goes green, the package is live at <https://www.npmjs.com/package/@leadlovers/simple-email-service>. For subsequent releases, bump the version number in the tag (`lib-v0.1.1`, `lib-v0.2.0`, etc.) and repeat. SemVer rules apply.

### Local dry-run

Before a real release, especially the first one, replay the workflow locally to catch tarball-shape or build issues before they hit the registry:

```bash
cd apps/lib
bun install --frozen-lockfile
bun run build
bun test tests/unit
npm pkg set version=0.1.0          # the version you intend to publish
npm publish --dry-run --access public
```

The dry-run prints the full file list, total size, and resolved package name + version without touching npm. The current build ships 81 files at 3.2 MB packed, 9.5 MB unpacked; most of the unpacked weight is the generated Prisma client (wasm query compiler).

After the dry-run, reset the version if you bumped it locally:

```bash
git checkout apps/lib/package.json
```

### First-run failure modes

The four failures that are easy to hit on the first release, and what each one means:

| Symptom                                                                                          | Cause                                                            | Fix                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm ERR! 404 Not Found - PUT https://registry.npmjs.org/@leadlovers%2fsimple-email-service`     | Scope doesn't exist or token lacks permission on it.             | Create the org on npm, or change the package name to a scope you control. Confirm the Automation token belongs to a member with publish rights. |
| `npm ERR! code ENEEDAUTH`                                                                        | `NPM_TOKEN` secret missing or misnamed in GitHub.                | Add it under repo Secrets exactly as `NPM_TOKEN`.                                                                            |
| Provenance error                                                                                 | Workflow lost `id-token: write`, or org policy stripped it.      | Confirm the permission block in `release-lib.yml`; check repo-level Actions permissions.                                     |
| Workflow runs, but the version on npm doesn't match the tag                                      | Older workflow that committed a manual bump. Should not happen with the current version-from-tag step. | Verify the "Sync apps/lib/package.json version from tag" step ran; confirm the tag starts with `lib-v`.                      |

## Deploying the gateway

The gateway uses Azure Pipelines, not GitHub Actions, because it deploys to the LeadLovers OCI agent pool the same way other LeadLovers services do.

[`apps/gateway/azure-pipelines.gateway.yml`](./apps/gateway/azure-pipelines.gateway.yml) has a path-filtered trigger on `main` that fires only when `apps/gateway`, `apps/lib`, or workspace-root files change. Stage 1 builds the Docker image and pushes it to Docker Hub at `cloudlovers/leadlovers-email-gateway:$(Build.BuildNumber)` and `:latest`, via the `CloudLovers - Docker Hub` service connection. Stage 2 runs on the `OCI-LeadLovers022` self-hosted pool, copies `docker-compose.yml` to `/var/docker/leadlovers/email-gateway/production`, writes a `.env` from pipeline variables, and runs `docker compose up -d --remove-orphans`.

Before the first deployment:

1. Create the Azure DevOps variable group `leadlovers-ses-production` containing `DATABASE_URL`, `REDIS_URL`, and `GATEWAY_API_KEY` (all marked secret).
2. Create the `production-email-gateway` environment so deployment approvals and audit logs work.

The pipeline writes `apps/gateway/devops/docker-compose.yml` to the host with image, container name, port mapping, and external network injected from variables, so production-only values never live in the repo.

## Continuous integration

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every push and pull request:

- Installs the workspace, regenerates the Prisma client, typechecks every workspace, runs every workspace's unit suite. Total: 92 tests, currently green.
- A matrix job builds the lib from `apps/lib/` and smoke-imports `dist/index.js` on Node 20 and Node 22 to confirm the published artifact loads on both runtimes.

[`.github/workflows/release-lib.yml`](./.github/workflows/release-lib.yml) is documented in the "Publishing the lib to npm" section above.

## License

MIT. See [`LICENSE`](./LICENSE).
