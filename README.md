# AIWrapper Platform

Multi-user OpenAI-compatible gateway backed by persistent Codex App Server processes. It authenticates individual clients, isolates ChatGPT OAuth state by `CODEX_HOME`, reserves quota before execution, streams real SSE, records an auditable PostgreSQL ledger and exposes an RBAC-protected React dashboard.

## Architecture and provenance

- Fastify API: `/v1/chat/completions`, `/v1/responses`, `/v1/models`, `/v1/me/usage`, admin API, health/readiness and Prometheus metrics.
- Persistent `codex app-server --stdio`: one supervised runtime per active profile, thread reuse support, cancellation and bounded pool eviction.
- PostgreSQL: users, keys, profiles, sessions, immutable cycles, budgets, requests, reservations and audit.
- Redis: distributed lease primitive and deployment-ready queue coordination.
- React/Vite dashboard, maintenance worker, Prometheus and Grafana.

See `docs/TARGET_ARCHITECTURE.md`, `docs/REFERENCE_REUSE_MATRIX.md`, `THIRD_PARTY.md` and `NOTICE`.

The four community repositories are imported with their real Git ancestry under `upstream/`. The original Codex-Wrapper FastAPI service and tests live under `services/codex-wrapper`; run it with `docker compose --profile upstream-proxy up codex-wrapper`. See `docs/UPSTREAM_REUSE_POLICY.md` and `docs/UPSTREAM_ADOPTION.md`; run `pnpm provenance:update` for line-level metrics/diffs and `pnpm provenance:verify` for fail-closed validation.

## Local installation (Windows)

Requirements: Node 22+, pnpm 10+, PostgreSQL 16+, Redis 7+ and the official Codex CLI.

```powershell
cd C:\Users\ilan.wendling\claude\AIWrapper
corepack enable
pnpm install
$env:DATABASE_URL='postgres://aiwrapper:aiwrapper@127.0.0.1:5432/aiwrapper'
$env:API_KEY_PEPPER='replace-with-at-least-32-random-characters'
pnpm db:migrate
codex login
pnpm db:bootstrap owner "$env:USERPROFILE\.codex"
pnpm dev:api
```

The bootstrap command prints the owner key once. In another terminal run `pnpm dev:web`; sign in with that key. The ChatGPT OAuth tokens remain inside the selected `CODEX_HOME` and are never returned by the API.

## Docker deployment

Codex OAuth login must be made available to the API container through a protected profile volume. Generate secrets, then start the stack:

```powershell
$env:API_KEY_PEPPER=[Convert]::ToBase64String((1..48|ForEach-Object{Get-Random -Maximum 256}))
$env:GRAFANA_ADMIN_PASSWORD='change-this'
docker compose up --build -d
docker compose exec api node dist/packages/db/src/bootstrap.js owner /profiles/owner
```

Services bind dashboard, Prometheus and Grafana only to loopback. Put `infra/reverse-proxy/nginx.conf` behind TLS or use a private Tailscale network. Do not publish Codex/ChatGPT OAuth access to untrusted users.

## Example API request

```powershell
$headers=@{Authorization='Bearer aiw_KEY_RETURNED_ONCE'}
$body=@{model='gpt-5.6-sol';stream=$false;messages=@(@{role='user';content='Olá'})}|ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:8080/v1/chat/completions -Method Post -Headers $headers -ContentType application/json -Body $body
```

For SSE set `stream=true`. Client disconnects issue `turn/interrupt`; successful terminal events reconcile reserved quota with actual App Server token usage.

## Validation

```powershell
pnpm typecheck
pnpm test
pnpm --dir apps/web build
python -m pytest -q
```

## Real limitations

- This gateway can enforce only traffic passing through it. It cannot partition or police direct ChatGPT/Codex use on the same personal account.
- ChatGPT subscription limits are not a fixed public token budget. Percentage budgets are an internal allocation and need calibration against provider-visible limits.
- Provider registry interfaces and routing are present; only the Codex/ChatGPT App Server adapter is wired into request execution by default. OpenAI, Azure, OpenRouter and Ollama require configured adapters and their own credentials.
- Tool declarations are accepted by the OpenAI schemas, while App Server native tool activity is streamed and audited. Full OpenAI function-call round-tripping is not yet equivalent across every provider.
- The React dashboard currently implements authenticated overview, aggregate usage and audit polling; advanced editors use the admin API and are not all exposed as forms.

## Legacy migration

The previous Python/SQLite MVP remains in the repository for rollback. `docs/MIGRATION_PLAN.md` documents the cutover. PostgreSQL is authoritative for the new platform; do not run both writers against the same traffic.
