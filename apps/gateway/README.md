# Email Gateway

Thin Bun HTTP service that wraps [`@leadlovers/simple-email-service`](../lib/README.md). Exists for legacy consumers that cannot import an ESM / Node 20+ package directly (e.g., projects pinned to Node 12 or CommonJS).

Modern consumers should keep importing the lib directly.

## Endpoints

| Method | Path                 | Purpose                                                                   |
| ------ | -------------------- | ------------------------------------------------------------------------- |
| `POST` | `/v1/emails/send`    | Forwards the JSON body to `email.send`. Returns the lib's `EmailSendResult` as JSON, plus an HTTP status mapped from the result code. |
| `GET`  | `/health`            | Always `200 ok`. Use for liveness probes.                                 |
| `GET`  | `/ready`             | Always `200 ok`. Use for readiness probes. (Lazy connects happen on first send.) |

### HTTP status mapping

| Result                                    | HTTP status |
| ----------------------------------------- | ----------- |
| `success: true`                           | `200`       |
| `code: 'validation_error'`                | `400`       |
| `code: 'unauthorized'` (gateway-level)    | `401`       |
| `code: 'rate_limited'`                    | `429`       |
| `code: 'persistence_error'`               | `502`       |
| `code: 'cache_error'`                     | `503`       |
| Unrouted request                          | `404`       |

The response body is always the JSON-serialized `EmailSendResult`. `id` is rendered as a decimal string (since `bigint` is not JSON-native); callers should keep it as a string.

## Environment

| Var                          | Required                | Notes                                                                 |
| ---------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`               | yes                     | Passed straight to the lib.                                           |
| `REDIS_URL`                  | yes                     | Passed straight to the lib.                                           |
| `SES_RATE_LIMIT_PER_MINUTE`  | no (default `60`)       | Passed straight to the lib.                                           |
| `PORT`                       | no (default `8787`)     | Port the gateway listens on.                                          |
| `GATEWAY_API_KEY`            | no                      | If set, every request to `/v1/emails/send` must include `x-internal-key: <value>`. If unset, no app-level auth (trust boundary moves to the network layer / firewall). |

## Run locally

```bash
cd apps/gateway
bun run dev              # bun --hot run src/index.ts
```

## Container

See [`devops/Dockerfile`](./devops/Dockerfile) and [`devops/docker-compose.yml`](./devops/docker-compose.yml). Deployed via [`azure-pipelines.gateway.yml`](./azure-pipelines.gateway.yml).
