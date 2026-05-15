# @leadlovers/simple-email-service

Send transactional emails through LeadLovers infrastructure. The package writes one row per send into the `EmailSequence` table on the LeadLovers SQL Server database; the downstream LeadLovers worker dispatches the email.

Runs on Node.js 20+ and Bun.

## Install

```bash
npm i @leadlovers/simple-email-service
# also install the peer deps if you don't already have them
npm i @prisma/client @prisma/adapter-mssql redis zod
```

The package ships with a pre-generated Prisma Client tailored to the LeadLovers `EmailSequence` table; you do not need to run `prisma generate` yourself.

## Environment

| Var                          | Required | Default | Description                                                            |
| ---------------------------- | -------- | ------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`               | yes      | —       | SQL Server JDBC URL for the LeadLovers DB.                             |
| `REDIS_URL`                  | yes      | —       | Redis URL used for idempotency cache and per-project rate-limit state. |
| `SES_RATE_LIMIT_PER_MINUTE`  | no       | `60`    | Positive integer. Sends per minute per `projectId`.                    |

A missing or invalid value throws `EmailConfigError` on the first call to `email.send`.

## Quickstart

```ts
import { email } from '@leadlovers/simple-email-service';

const result = await email.send({
  projectId: 1234,
  to: 'user@example.com',
  subject: 'Welcome',
  message: '<h1>Hi</h1>',
});

if (result.success) {
  console.log('queued', result.id, result.deduplicated);
} else {
  switch (result.code) {
    case 'validation_error': /* fix the payload */ break;
    case 'rate_limited':     /* retry after result.retryAfterMs */ break;
    case 'persistence_error':/* DB issue */ break;
    case 'cache_error':      /* Redis issue */ break;
  }
}

// Optional: gracefully shut down DB and Redis clients in short-lived processes.
await email.disconnect();
```

## API

### `email.send(input): Promise<EmailSendResult>`

| Field       | Type     | Notes                                                                |
| ----------- | -------- | -------------------------------------------------------------------- |
| `projectId` | `number` | Positive integer. Maps to `ProjCodi`. Also the rate-limit partition. |
| `to`        | `string` | Valid email, 1..510 chars.                                           |
| `subject`   | `string` | 1..510 chars after trim.                                             |
| `message`   | `string` | HTML or plaintext. 1..1 MB.                                          |

Returns a discriminated union:

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

`email.send` never throws for per-call operational outcomes. The only thrown error is `EmailConfigError`, fired once at boot when env config is missing or invalid.

### `email.disconnect(): Promise<void>`

Closes the underlying Prisma and Redis clients. Optional; only useful in short-lived processes that must exit cleanly.

### `email.setLogger(logger): void`

Inject a `{ debug, info, warn, error }` logger. The package logs DB and Redis latency at `debug`, failed sends at `error` (or `warn` for `rate_limited`), and best-effort cache-write failures at `warn`. `message`, `to`, and full secrets are never logged at `info+`.

## Idempotency

Always on. The cache key is `sha256(projectId + '|' + to + '|' + subject)`, retained in Redis for 10 minutes.

A second call with the same `(projectId, to, subject)` within the window resolves to `{ success: true, deduplicated: true }` and returns the original row's `id` / `queuedAt`. Varying any of those three fields breaks the dedup; the `message` body is intentionally excluded from the hash, so a retried notification with a reworded body is still treated as a duplicate.

A `bypassIdempotency` flag is on the v0.2 roadmap.

## Rate Limiting

Per `projectId`, fixed 1-minute window, default 60 sends/minute. Override via `SES_RATE_LIMIT_PER_MINUTE`.

On limit hit, the call returns `{ success: false, code: 'rate_limited', error, retryAfterMs }`. `retryAfterMs` is the time until the window resets. No DB write occurs.

## Errors

Every failure carries a stable `code` (machine-readable) and a stable `error` string (human-readable). The full message catalog lives in [PRD.md §5.3](./PRD.md#53-error-contract).

## Trust Model

The lib does not authenticate callers. Anyone holding valid LeadLovers DB credentials (`DATABASE_URL`) can use it. Treat the DB credential as the access boundary.

## Contributing

Schema is owned by the LeadLovers monolith. **Do not run `prisma migrate`** from this repo. The Prisma model in `prisma/schema.prisma` is hand-maintained to mirror the live `EmailSequence` table; column changes happen upstream, then we update the model here.

Layout:

```
src/                source
prisma/             schema.prisma + (generated) client
tests/unit/         pure-function tests; bun test tests/unit
tests/integration/  hit a real DB + Redis; gated on TEST_DATABASE_URL / TEST_REDIS_URL
devops/             canonical CI/CD config (mirrored under .github/workflows/)
```

Scripts:

```bash
bun install                              # install deps
bun run prisma:generate                  # regenerate Prisma client
bun run typecheck                        # tsc --noEmit
bun test                                 # unit tests
TEST_DATABASE_URL=... TEST_REDIS_URL=... bun run test:int  # integration
bun run build                            # emit dist/ for publish
```

## License

MIT. See [LICENSE](./LICENSE).
