# Migration Plan

1. Freeze and commit the current Python MVP as a rollback baseline.
2. Add the TypeScript monorepo alongside the MVP; do not break the current UI
   until API compatibility and the App Server supervisor are verified.
3. Incorporate provenance-tracked modules from the four references.
4. Introduce PostgreSQL/Redis schema and migrations, then import legacy SQLite
   users, sessions, messages and usage rows.
5. Route `/v1/models`, `/v1/responses` and `/v1/chat/completions` through the new
   gateway with real streaming and cancellation.
6. Enable quota reservation/reconciliation and compare ledger output with the
   legacy counter in shadow mode.
7. Replace the monolithic HTML dashboard with React and real-time events.
8. Add production compose, metrics, Grafana and reverse-proxy examples.
9. Run unit, integration, failure, concurrency, security and end-to-end suites.
10. Remove the Python runtime from the default deployment only after parity;
    retain it under `legacy/` for one migration release.

## Preserved MVP behavior

- Individual user keys and per-user visibility.
- Model/effort/fast-mode selection.
- Codex ChatGPT login status and model discovery.
- Persistent conversation mapping.
- Existing SQLite data through a one-time importer.

## Replaced components

- Per-request `codex exec` -> persistent App Server pool.
- SHA-256 API key hashes -> keyed HMAC digests with rotation/revocation.
- SQLite production store -> PostgreSQL repositories and migrations.
- Inline HTML/JavaScript -> React application.
- Approximate two-window quota -> transactional multi-dimensional budget guard.
- Process-local RPM check -> distributed scheduler/rate limiter.

