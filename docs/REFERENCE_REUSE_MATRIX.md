# Reference reuse matrix

All upstreams are MIT licensed. Commits are pinned so the adaptations remain auditable.

| Resource | Origin / original files | Commit | Integration and changes | Destination | Tests | Status |
|---|---|---|---|---|---|---|
| OpenAI request/response contracts | Codex-Wrapper `app/schemas.py`, `app/prompt.py` | `e9353b8` | Ported to TypeScript/Zod, kept OpenAI field names | `packages/protocol/src/openai.ts`, `apps/api/src/server.ts` | protocol/API validation | integrated |
| SSE and disconnect lifecycle | Codex-Wrapper `app/main.py`, `app/codex.py`; OpenCodex `src/server/sse-payload-rewrite.ts` | `e9353b8`, `d1f544b` | Ported true framing; disconnect invokes App Server interrupt | `packages/protocol/src/sse.ts`, `apps/api/src/server.ts` | `test/sse.test.ts`, live turn | integrated |
| Model catalog | Codex-Wrapper `app/model_registry.py`; OpenCodex `src/providers/registry.ts` | `e9353b8`, `d1f544b` | App Server discovery plus extensible aliases/availability/cost routing | `packages/providers/src/registry.ts`, API `/v1/models` | `test/providers.test.ts`, live discovery | integrated; external adapters not enabled |
| Persistent process | OpenCodex `src/codex/app-server-processes.ts`, `src/server/lifecycle.ts` | `d1f544b` | JSON-RPC correlation, restart backoff, profile pool, Windows-safe spawn | `packages/codex-runtime/src/*` | `test/runtime.test.ts`, live handshake/turn | integrated |
| Ledger and redaction | codex-multi-auth `lib/usage/ledger.ts`, `types.ts`, `redaction.ts`, `pricing.ts` | `89ca969` | Ported rich event types/redaction; PostgreSQL idempotency and export | `packages/usage/src/*`, `packages/db/src/*` | migration and live token event | integrated |
| Budget guard | codex-multi-auth `lib/budget-guard.ts`, `lib/account-policy.ts` | `89ca969` | Ported windows and weights; transactional reservation/reconciliation | `packages/quota/src/*`, `packages/db/src/repository.ts` | `test/quota.test.ts` | integrated |
| Local API keys | codex-multi-auth `lib/local-client-tokens.ts` | `89ca969` | Ported generation/prefixes; upgraded hashes to peppered HMAC | `packages/auth/src/api-keys.ts` | `test/auth.test.ts` | integrated |
| Routing profiles/mutex | codex-multi-auth `lib/routing-profiles.ts`, `routing-mutex.ts` | `89ca969` | Profile association is persisted; PostgreSQL advisory lock and Redis lease replace local mutex | `packages/db/src/repository.ts`, `packages/queue/src/redis-lock.ts` | quota concurrency tests | integrated core; multi-instance scheduler wiring remains |
| Resilience/circuit breaker | codex-multi-auth `lib/circuit-breaker.ts`, `request-resilience.ts` | `89ca969` | Restart backoff incorporated; provider circuit breaker not ported | `packages/codex-runtime/src/json-rpc.ts` | crash test pending | partial |
| `CODEX_HOME` profiles | codex-profiles `bin/codex-profile` | `b0df2dd` | Ported safe names, canonical paths and symlink protection for Windows/Linux | `packages/profiles/src/profiles.ts` | `test/profiles.test.ts` | integrated |
| Provider registry | OpenCodex `src/providers/registry.ts`, `derive.ts`, `adapter-resolve.ts` | `d1f544b` | Adapted registry, aliases, availability and preference/cost selection | `packages/providers/src/registry.ts` | `test/providers.test.ts` | integrated; Codex execution only by default |
| OAuth/provider secret store | OpenCodex `src/oauth/store.ts`, `token-guardian.ts` | `d1f544b` | AES-256-GCM envelope; ChatGPT OAuth remains in protected homes | `packages/auth/src/secrets.ts` | `test/secrets.test.ts` | integrated |
| Concurrency limiter | Codex-Wrapper `app/codex.py` `_CodexConcurrencyLimiter` | `e9353b8` | Extended into fair global/user/model queue with timeout/cancellation | `packages/queue/src/scheduler.ts` | `test/queue.test.ts` | integrated |

## Compatibility decisions

OpenCodex uses Bun APIs, codex-profiles is Bash, and Codex-Wrapper is Python. Runtime-neutral algorithms/contracts were ported; platform-specific calls were replaced with Node APIs. `auth.json` is deliberately not copied into PostgreSQL. See `THIRD_PARTY.md` and `NOTICE` for attribution.
