# LeadLovers Simple Email Service

Monorepo holding two related artifacts that share one source of truth for transactional email at LeadLovers:

| App | Path | Distribution |
| --- | ---- | ------------ |
| `@leadlovers/simple-email-service` | [`apps/lib/`](./apps/lib) | Public NPM package. Consumers `import { email } from '@leadlovers/simple-email-service'` and call `email.send(...)`. |
| Email gateway | [`apps/gateway/`](./apps/gateway) | Bun HTTP service. Wraps the lib behind `POST /v1/emails/send` for legacy consumers that cannot import an ESM/Node 20+ package. Deployed via Azure Pipelines + Docker Hub. |

The lib is the contract; the gateway is a thin network adapter on top of it. Modern consumers (LeadLovers.Api) import the lib directly. Legacy consumers (99webinar on Node 12 / CommonJS) hit the gateway over HTTP.

See [`PRD.md`](./PRD.md) for the full product spec.

## Workspace

Bun workspaces. From the repo root:

```bash
bun install                 # installs deps for every app
bun run typecheck           # typechecks every workspace
bun run test                # unit tests across every workspace
bun run build               # builds every workspace
```

Per-app commands:

```bash
cd apps/lib && bun run build         # bundle dist/ for npm publish
cd apps/gateway && bun run dev       # start the HTTP gateway locally
```

## Layout

```
.
├── apps/
│   ├── lib/                  publishable NPM package
│   └── gateway/              Bun HTTP service
├── tsconfig.base.json        shared TS config, extended per app
├── PRD.md                    product requirements (lib contract)
├── CLAUDE.md                 agent / contributor working notes
└── .github/workflows/        CI + lib release workflow
```

## License

MIT. See [LICENSE](./LICENSE).
