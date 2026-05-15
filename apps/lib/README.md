# @leadlovers/simple-email-service

Send transactional emails through LeadLovers infrastructure. Hand the lib a payload and it queues the email for delivery; downstream LeadLovers services handle the actual dispatch.

## Consumer Requirements

Before installing, confirm your project meets all of the following. The package will not work otherwise; there is no CommonJS build and no fallback for older Node versions.

| Requirement     | Constraint                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| Runtime         | **Node.js ≥ 20** or **Bun ≥ 1.0**. Node 18 and below are not supported.             |
| Module system   | **ESM only**. Your `package.json` must declare `"type": "module"`, or you must use dynamic `import()` from CommonJS. There is no `require()` entry point. |
| TypeScript      | Optional but recommended. Any version that supports `moduleResolution: "node16"`, `"nodenext"`, or `"bundler"` works. |
| Peer deps       | `@prisma/client@^7`, `@prisma/adapter-mssql@^7`, `redis@^5`, `zod@^4`.              |
| Database access | Connection string issued by LeadLovers ops.                                         |
| Redis           | A reachable Redis instance (any standard host: AWS ElastiCache, self-hosted, etc.). |

### Not supported

- Node.js 18 or earlier (including Node 12/14/16). Prisma 7 itself requires Node ≥ 18, and this package targets Node ≥ 20.
- CommonJS-only projects. Migrate to ESM, or use the LeadLovers email HTTP gateway service for legacy backends.
- Bun's built-in `Bun.redis` as a substitute for the `redis` peer dep. The lib imports from the npm `redis` package directly; even on Bun you must install `redis` in your `package.json`. A `Bun.redis` adapter is on the v0.2 roadmap.
- Bundled deployments that try to bundle `@prisma/client`. Leave it as an external dependency.

## Install

```bash
npm i @leadlovers/simple-email-service
# install peer deps if your project doesn't have them yet
npm i @prisma/client @prisma/adapter-mssql redis zod
```

Bun-native projects use the same packages:

```bash
bun add @leadlovers/simple-email-service
bun add @prisma/client @prisma/adapter-mssql redis zod
```

The package ships with a pre-generated Prisma Client tailored to the internal schema; you do not need to run `prisma generate` yourself.

## Environment

| Var            | Required | Description                                                            |
| -------------- | -------- | ---------------------------------------------------------------------- |
| `DATABASE_URL` | yes      | Connection string issued by LeadLovers ops.                            |
| `REDIS_URL`    | yes      | Redis URL used for idempotency cache and per-project rate-limit state. |

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
    case 'persistence_error':/* infrastructure issue */ break;
    case 'cache_error':      /* infrastructure issue */ break;
  }
}

// Optional: gracefully close pooled clients in short-lived processes.
await email.disconnect();
```

## API

### `email.send(input): Promise<EmailSendResult>`

| Field       | Type     | Notes                                                                |
| ----------- | -------- | -------------------------------------------------------------------- |
| `projectId` | `number` | Positive integer. Identifies the LeadLovers project that owns the send. Also the rate-limit partition. |
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

Closes the underlying pooled clients. Optional; only useful in short-lived processes that must exit cleanly.

### `email.setLogger(logger): void`

Inject a `{ debug, info, warn, error }` logger. The package logs latency at `debug`, failed sends at `error` (or `warn` for `rate_limited`), and best-effort cache-write failures at `warn`. `message`, `to`, and full secrets are never logged at `info+`.

## Idempotency

Always on. The cache key is `sha256(projectId + '|' + to + '|' + subject)`, retained in Redis for 10 minutes.

A second call with the same `(projectId, to, subject)` within the window resolves to `{ success: true, deduplicated: true }` and returns the original send's `id` / `queuedAt`. Varying any of those three fields breaks the dedup; the `message` body is intentionally excluded from the hash, so a retried notification with a reworded body is still treated as a duplicate.

A `bypassIdempotency` flag is on the v0.2 roadmap.

## Rate Limiting

Per `projectId`, fixed 1-minute window, 60 sends per minute. Not configurable.

On limit hit, the call returns `{ success: false, code: 'rate_limited', error, retryAfterMs }`. `retryAfterMs` is the time until the window resets. No queued send is created.

## Errors

Every failure carries a stable `code` (machine-readable) and a stable `error` string (human-readable, safe to surface to logs).

| Code                 | When                                                                                      | `error` shape                                                |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `validation_error`   | Input failed Zod validation.                                                              | Flattened issue list joined with `; `.                       |
| `rate_limited`       | `projectId` exceeded its quota for the current 1-minute window. `retryAfterMs` populated. | `rate limit exceeded: {limit} sends per minute per project`. |
| `persistence_error`  | Backing-store failure (connection, constraint, timeout).                                  | Sanitized message; no schema details, no PII.                |
| `cache_error`        | Redis failure (connection, timeout, command error).                                       | Sanitized message.                                           |

## Trust Model

The lib does not authenticate callers. Anyone holding a valid `DATABASE_URL` can use it. Treat the credential as the access boundary.

## License

MIT. See [LICENSE](./LICENSE).
