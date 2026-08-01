# Target Architecture

## Runtime topology

```text
React dashboard / OpenAI clients
             |
       API gateway (Fastify)
       | auth/RBAC/request-id
       | quota reservation
       | OpenAI protocol + SSE
             |
       Fair Redis scheduler
       | global/user/model limits
       | cancellation/backpressure
             |
      Codex runtime supervisor -------- Provider router
       | persistent app-server pool       | OpenAI API
       | one pool per profile             | Azure/OpenRouter
       | restart/orphan cleanup            | Ollama/custom
             |
   PostgreSQL ledger/cycles/audit <---- Redis live state
             |
    Prometheus / OpenTelemetry / Grafana
```

## Workspace layout

```text
apps/
  api/          HTTP/OpenAI/admin API
  worker/       queue consumer and runtime execution
  web/          React/Vite dashboard
packages/
  auth/         API keys, RBAC, secret encryption
  codex-runtime persistent App Server client/supervisor
  db/           Drizzle schema, migrations, repositories
  profiles/     CODEX_HOME isolation
  protocol/     OpenAI schemas and SSE
  providers/    provider registry and adapters
  queue/        fairness, cancellation, resilience
  quota/        reservations, cycles, budget guards
  usage/        ledger, pricing, redaction, summaries
  observability logs, metrics and tracing
infra/
  prometheus/ grafana/ reverse-proxy/
```

## Security boundaries

- Administrative routes require authenticated RBAC; localhost is not an auth
  bypass in the production profile.
- Client API keys are displayed once and stored as HMAC-SHA-256 digests with a
  server-side pepper.
- Provider secrets use authenticated encryption at rest.
- `CODEX_HOME` paths are canonicalized, constrained to the configured profile
  root, checked against symlinks/reparse points and never supplied by clients.
- Prompts/responses are excluded from logs and ledger by default.
- Quota reservation is transactional before queue admission and reconciled
  after completion/cancellation.

## Persistence

PostgreSQL is authoritative. Redis stores queue, distributed locks, live
request state and pub/sub dashboard events. SQLite remains supported only by
the legacy development adapter during migration.

## App Server protocol

Each active profile owns a supervised `codex app-server --stdio` process. The
client performs `initialize`/`initialized`, correlates JSON-RPC IDs, dispatches
notifications, resolves server requests/approvals according to profile policy,
and emits normalized runtime events. A crash rejects or safely retries eligible
work, restarts with bounded exponential backoff and records an audit event.

