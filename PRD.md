# PRD: LeadLovers.Lib.SimpleEmailService

## 1. Summary

Public NPM package (`@leadlovers/simple-email-service`, MIT) that exposes a minimal API for sending transactional emails through LeadLovers infrastructure. The first release ships a single method, `email.send`, which persists a row into the `EmailSequence` table on the LeadLovers database (Prisma model `Emails`). The downstream LeadLovers worker is responsible for picking up that row and dispatching the email; this lib does not deliver SMTP traffic itself.

## 2. Goals

- Provide an external, ergonomic entry point for partners and internal services to enqueue transactional emails without re-implementing LeadLovers internals.
- Hide DB schema details behind a typed, validated DTO.
- Protect the platform from accidental abuse with idempotency and per-project rate limiting.
- Stay small, dependency-light, and easy to publish/version on NPM.

## 3. Non-Goals

- No template engine, no merge tags, no attachments in v1.
- No retry queue, no scheduling, no batching API.
- No outbound SMTP/HTTP delivery. Lib only writes to `EmailSequence`.
- No DB migrations. Schema is owned by the LeadLovers monolith.
- No multi-tenant config beyond `projectId`.
- No verified-sender validation.
- No caller authentication at the lib level. Trust boundary is the DB credential (`DATABASE_URL`).

## 4. Target Consumer

- Internal LeadLovers services that need to enqueue transactional mail.
- External integrators that already hold LeadLovers DB and Redis credentials, provisioned out-of-band via env vars.

## 5. Public API

Single namespace export:

```ts
import { email } from '@leadlovers/simple-email-service';

await email.send({
  projectId: 1234,
  to: 'user@example.com',
  subject: 'Welcome',
  message: '<h1>Hi</h1>',
});
```

### 5.1 Input Contract

| Field       | Type     | Required | Notes                                                                                                           |
| ----------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `projectId` | `number` | yes      | Positive integer. Maps to `ProjCodi`. Also the rate-limit partition key.                                        |
| `to`        | `string` | yes      | Valid email, 1..510 chars (matches `NVARCHAR(510)` on `EmailPara`).                                             |
| `subject`   | `string` | yes      | 1..510 chars after trim (matches `NVARCHAR(510)` on `EmailAssunto`).                                            |
| `message`   | `string` | yes      | HTML or plaintext. Maps to `EmailMsg` (`NVARCHAR(MAX)`). Lib enforces a 1 MB soft cap to prevent payload abuse. |

Notes on omitted fields:

- `from` is intentionally absent from the DTO. `EmailSequence` has no sender column; the downstream dispatcher derives the sender from `projectId`. Callers cannot override sender identity through this lib.
- `isHtml`, `priority`, `sendType` are not exposed in v1; DB defaults (`true`, `-1`, `1`) are used.

Validation runs through a Zod schema before any DB or Redis call. Invalid input throws `EmailValidationError` carrying the Zod issue list.

### 5.2 Return Contract

`email.send` never throws for per-call operational outcomes. It resolves to a discriminated-union result:

```ts
type EmailSendResult =
  | { success: true;  id: bigint; queuedAt: Date; deduplicated: boolean }
  | { success: false; code: EmailErrorCode; error: string; retryAfterMs?: number };

type EmailErrorCode =
  | 'validation_error'
  | 'rate_limited'
  | 'persistence_error'
  | 'cache_error';
```

On success:

- `id`: `EmailCodi` of the inserted (or previously inserted) row. `bigint` since the column is `BIGINT`.
- `queuedAt`: `EmailDataCada` timestamp of the row.
- `deduplicated`: `true` when the call hit the idempotency cache and no new row was created.

On failure:

- `code`: stable machine-readable category for programmatic handling.
- `error`: human-readable description suitable for logging/display.
- `retryAfterMs`: populated only when `code === 'rate_limited'`.

Consumers narrow on `success` to access the rest of the fields safely.

### 5.3 Error Contract

When `success: false`, the result carries:

- `code`: stable enum value (one of the codes in §5.2). The contract for programmatic handling.
- `error`: concise, human-readable description of exactly what went wrong. Stable string; safe to surface to logs or end-user tooling.
- `retryAfterMs`: present only when `code === 'rate_limited'`.

No silent failures. No fallbacks. The lib never returns `{ success: true }` when the DB write did not happen.

`EmailConfigError` is the only thrown error. It fires once on lazy boot when env config is missing or invalid. A misconfigured deployment must fail loudly at process startup, not be caught per-call.

#### 5.3.1 `validation_error`

Zod issues are flattened into a semicolon-separated list (`error: 'to must be a valid email address; subject is required'`). Per-field templates:

| Field       | Condition                | Message                                   |
| ----------- | ------------------------ | ----------------------------------------- |
| `projectId` | missing                  | `projectId is required`                   |
| `projectId` | not a positive integer   | `projectId must be a positive integer`    |
| `to`        | missing/empty            | `to is required`                          |
| `to`        | not a valid email        | `to must be a valid email address`        |
| `to`        | over 510 chars           | `to must be at most 510 characters`       |
| `subject`   | missing/empty            | `subject is required`                     |
| `subject`   | over 510 chars           | `subject must be at most 510 characters`  |
| `message`   | missing/empty            | `message is required`                     |
| `message`   | over 1 MB                | `message must be at most 1 MB`            |

#### 5.3.2 `rate_limited`

Fixed message + numeric `retryAfterMs` (millis until window end):

- `rate limit exceeded: {limit} sends per minute per project` (where `{limit}` resolves to the active `SES_RATE_LIMIT_PER_MINUTE`)

#### 5.3.3 `persistence_error`

Mapped from Prisma error codes. No raw SQL, no row contents, no PII:

| Prisma code | Message                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `P1001`     | `cannot reach the LeadLovers database`                                     |
| `P1002`     | `database connection timed out while connecting`                           |
| `P1008`     | `database operation timed out`                                             |
| `P1017`     | `database closed the connection`                                           |
| `P2002`     | `database unique constraint violation`                                     |
| `P2003`     | `database foreign key constraint violation (likely invalid projectId)`     |
| `P2024`     | `database connection pool exhausted`                                       |
| (any other) | `database error (Prisma {code})`                                           |

#### 5.3.4 `cache_error`

| Cause                  | Message                       |
| ---------------------- | ----------------------------- |
| connection refused     | `cannot connect to Redis`     |
| auth failure           | `Redis authentication failed` |
| command/network timeout| `Redis operation timed out`   |
| protocol/command error | `Redis command failed`        |

#### 5.3.5 `EmailConfigError` (thrown, not returned)

| Cause                                              | Message                                                |
| -------------------------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL` missing                             | `missing required env var DATABASE_URL`                |
| `DATABASE_URL` malformed                           | `invalid DATABASE_URL: {reason}`                       |
| `REDIS_URL` missing                                | `missing required env var REDIS_URL`                   |
| `REDIS_URL` malformed                              | `invalid REDIS_URL: {reason}`                          |
| `SES_RATE_LIMIT_PER_MINUTE` not a positive integer | `SES_RATE_LIMIT_PER_MINUTE must be a positive integer` |

## 6. Data Layer

### 6.1 ORM

Prisma. Schema mapped manually; `prisma migrate` is disabled. `prisma generate` is the only Prisma command in the build pipeline.

### 6.2 Prisma Model (authoritative for v1)

```prisma
model Emails {
  id        BigInt   @id @default(autoincrement()) @map("EmailCodi")
  projectId Int      @map("ProjCodi")
  statusId  Int      @map("StatCodi") @default(1)
  createdAt DateTime @map("EmailDataCada") @default(now())
  sendAt    DateTime @map("EmailDataEnviar") @default(now())
  to        String   @map("EmailPara") @db.NVarChar(510)
  subject   String   @map("EmailAssunto") @db.NVarChar(510)
  body      String   @map("EmailMsg") @db.NVarChar(Max)
  isHtml    Boolean  @map("EmailHtml") @default(true)
  attempts  Int      @map("EmailTentativas") @default(0)
  priority  Int      @map("EmailPrioridade") @default(-1)
  sendType  Int      @map("EmailTipoEnvi") @default(1)

  @@map("EmailSequence")
}
```

Lib writes only `projectId`, `to`, `subject`, `body`. Every other column relies on its DB default. Contributor doc note: do not run `prisma migrate`. Schema is authoritative on the DB side.

### 6.3 Connection

- One shared `PrismaClient` per process, lazy-initialized on first `email.send` call.
- Optional `email.disconnect()` helper for graceful shutdown in short-lived processes (scripts, lambdas).
- Connection string read from `DATABASE_URL`. Bun loads `.env` natively, no `dotenv`.

## 7. Trust Model

The lib does not authenticate callers in v1. The trust boundary is the DB credential (`DATABASE_URL`); whoever holds it can use this lib. This is consistent with the package being distributed publicly on NPM but useful only to deployments configured with LeadLovers DB access.

Rate limiting (see §8) still applies as a guard against accidental floods, but it is not an authorization mechanism.

A future v0.2 may introduce per-caller identity (DB-backed API keys with quotas) if external integrators land. Tracked as out-of-scope for v1.

## 8. Rate Limiting (Redis-backed)

- Per `projectId`, fixed-window counter at 1-minute granularity.
- Default quota: `60 sends/min/project`. Configurable per env via `SES_RATE_LIMIT_PER_MINUTE`. Per-project overrides deferred to v0.2.
- Implementation: `INCR ses:rl:{projectId}:{unixMinute}` followed by `EXPIRE 65` on the same key (covers clock skew). Compare result against limit.
- On limit hit, the result is `{ success: false, code: 'rate_limited', error, retryAfterMs }` where `retryAfterMs = (windowEnd - now)`. No DB write happens.
- Rate-limit check runs before the DB insert. No transactional coupling with the DB.

## 9. Idempotency (Redis-backed, 10-minute TTL, implicit)

- Always on. v1 does not expose a caller-supplied idempotency key.
- Hash input: `sha256(projectId + '|' + to + '|' + subject)` over the validated DTO.
- Cache key: `ses:idem:{hash}`. Cache value: JSON `{ id, queuedAt }` of the original insert.
- TTL: 600 seconds (10 minutes). Redis handles expiration natively; no pruning job.
- Scope: dedup is per `(projectId, to, subject)` triple. Any caller hitting that triple within the window collapses to the first writer's row.
- Flow:
  1. `GET ses:idem:{hash}`. On hit: return `{ success: true, id, queuedAt, deduplicated: true }`. Skip insert. Skip rate-limit increment.
  2. On miss: increment rate-limit counter. If allowed, insert `EmailSequence` row, then `SET ses:idem:{hash} <result> EX 600 NX`.
- Race handling: two concurrent identical calls may both miss the `GET` and both insert. The `NX` flag on `SET` ensures one cached result, but the second writer leaves a duplicate row. Trade-off documented; revisit with a Redis lock if it matters in production.
- Rationale: 10 minutes is sized to absorb retry storms (caller-side retries, queue redelivery, webhook re-fires) without blocking legitimate same-day re-sends. Hashing only `projectId/to/subject` (and not `message`) means a retried notification that rewords the body is still treated as a duplicate, which is the intended retry-storm shape.
- Known limitations:
  - Within 10 minutes, the same `(projectId, to, subject)` cannot be re-sent with a different `message`. The first call wins; the second is reported as `deduplicated: true` and the new body is dropped.
  - Within 10 minutes, two genuinely distinct emails that happen to share `(projectId, to, subject)` collide. Vary the subject to bypass.
  - If a real need for an "intentional duplicate" surfaces, add an optional `bypassIdempotency` flag in v0.2.

## 10. Configuration

`.env` keys:

| Key                         | Required | Description                                                 |
| --------------------------- | -------- | ----------------------------------------------------------- |
| `DATABASE_URL`              | yes      | LeadLovers DB connection string (Prisma).                   |
| `REDIS_URL`                 | yes      | Redis connection string. Missing throws `EmailConfigError`. |
| `SES_RATE_LIMIT_PER_MINUTE` | no       | Integer. Default `60`.                                      |

Boot-time validation: Zod schema reads `process.env` once on lazy init and throws `EmailConfigError` on any failure.

### 10.1 Redis Client

- Peer dependency: `redis` (official Node client). Runs on Node 20+ and Bun.
- `Bun.redis` is intentionally not used in v1 to keep the package runtime-agnostic. Tracked as a v0.2 optimization (runtime-detect and prefer `Bun.redis` when available).

## 11. Behavior on `email.send`

Every numbered step that "returns failure" produces an `EmailSendResult` with `success: false`. Only `EmailConfigError` (boot-time) throws.

1. Validate input with Zod. On failure, return `{ success: false, code: 'validation_error', error: <flattened Zod issues> }`.
2. Ensure Prisma + Redis clients are initialized (lazy). Client init failure throws `EmailConfigError`.
3. Compute idempotency hash. `GET ses:idem:{hash}`.
   - Hit: return `{ success: true, id, queuedAt, deduplicated: true }`.
   - Redis failure: return `{ success: false, code: 'cache_error', error: <sanitized> }`.
4. `INCR ses:rl:{projectId}:{unixMinute}` + `EXPIRE 65`. If result > quota, return `{ success: false, code: 'rate_limited', error, retryAfterMs: <to end of window> }`. Redis failure here also returns `cache_error`.
5. `prisma.emails.create({ data: { projectId, to, subject, body: message } })`. On failure, return `{ success: false, code: 'persistence_error', error: <sanitized DB message> }`.
6. `SET ses:idem:{hash} <result> EX 600 NX`. NX rejection or Redis failure here is logged at `warn` and otherwise ignored. The DB row is authoritative; a missed cache write only weakens future idempotency, it does not invalidate this send.
7. Return `{ success: true, id, queuedAt, deduplicated: false }`.

## 12. Packaging and Distribution

- Built with `bun build` to `dist/`, emitting ESM + type declarations.
- `package.json`:
  - `name`: `@leadlovers/simple-email-service`.
  - `license`: `MIT`.
  - `main`/`module`/`types` pointing into `dist/`.
  - `files`: `dist`, `prisma/schema.prisma`, `README.md`, `LICENSE`.
  - `engines`: `{ "node": ">=20", "bun": ">=1.0" }`.
  - `peerDependencies`: `@prisma/client`, `zod`, `redis`.
- Build target: ESM, dual-runtime (Bun and Node 20+). Verify with smoke tests on both runtimes in CI.
- Versioning: SemVer. v0.x while API is unstable.

## 13. DevOps and Release Pipeline

- All CI/CD config lives under `devops/`:
  - `devops/github-actions/ci.yml`: lint, typecheck, `bun test`, smoke on Node 20+ and Bun.
  - `devops/github-actions/release.yml`: triggered on `v*` tag push. Builds, runs tests, `npm publish --access public` using `NPM_TOKEN` secret. Uses `--provenance` for supply-chain attestation.
- Branch protection on `main` requires `ci.yml` green.
- First release (`v0.1.0`) cut manually to validate the pipeline end-to-end, then automated thereafter.

## 14. Testing Strategy

- `bun test` for unit tests covering: Zod validation table (valid + invalid inputs), rate-limit math (window boundary, exact-at-limit, over-limit), idempotency cache hit/miss + `NX` race, error mapping.
- Integration tests behind `TEST_DATABASE_URL` and `TEST_REDIS_URL`. Skipped in CI if absent. Hit real SQL Server + Redis instances; exercise both the cache-hit and cache-miss code paths and verify the `EmailSequence` insert reflects the DTO exactly.
- Cross-runtime smoke: run a minimal `email.send` against disposable DB + Redis on both Bun and Node 20+ as a release gate.

## 15. Observability

- No logger dependency baked in. The lib accepts an optional `logger?: { debug; info; warn; error }` at module init time so consumers can plug Pino/Winston/console.
- v1: log payload size, DB latency, and Redis latency at `debug`. Log `success: false` results at `error` (or `warn` for `rate_limited`). Step 6 cache-write failures log at `warn` since the send still succeeded. Never log `message` or `to` at `info`+.

## 16. Security and Compliance

- No PII in logs above `debug`.
- DB and Redis credentials never embedded in the package. Always env-driven.
- README must call out that this lib writes raw rows into LeadLovers-owned tables and consumers need direct DB + Redis credentials, which is unusual for a public package, and that the lib does no caller authentication beyond what the DB credential enforces.

## 17. Documentation

`README.md` rewrite covering: install, env setup, quickstart, API reference, error types, idempotency/rate-limit semantics, troubleshooting, contribution rules (no migrations, manual schema sync).

## 18. Milestones

1. **M1: Schema + clients.** Lock the `Emails` Prisma model against the live DB, set up Prisma + Redis clients, env config + Zod boot validation.
2. **M2: Core path.** Zod DTO, `email.send` happy path with DB write only. Unit tests green.
3. **M3: Idempotency + rate limit.** Redis flow integrated, integration tests against real DB + Redis including the `SET NX` race path.
4. **M4: DevOps.** `devops/github-actions/{ci,release}.yml`, NPM token, dual-runtime smoke.
5. **M5: Docs + LICENSE + v0.1.0 release.**

Release gate: `EmailSequence` must already exist on the target DB. Redis is the consumer's runtime responsibility, not a release blocker; the lib boots-fails with `EmailConfigError` when `REDIS_URL` is missing.

## 19. Risks

- Schema drift between LeadLovers DB and `schema.prisma`. Mitigation: integration tests against a real DB on every PR.
- Redis unavailable in production. Mitigation: lib boots-fail loudly via `EmailConfigError`. No degraded mode.
- Idempotency race on concurrent identical calls allows a duplicate row. Documented as a known trade-off; revisit with a Redis lock if it becomes a real-world problem.
- Public package surface leaking internal DB shape. Mitigation: DTO is decoupled from Prisma types; consumers never see Prisma models.
- DB connections exhausted by short-lived consumers. Mitigation: document `email.disconnect()` and recommend a singleton pattern.

---

## Open Questions

None blocking v1. v0.2 scope (caller-identity / DB-backed API keys with per-caller quotas, optional `Bun.redis` adapter, sliding-window rate limit, idempotency lock for strict single-insert semantics, optional `bypassIdempotency` flag) tracked separately.
