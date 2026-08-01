# Third-party software and incorporated code

AIWrapper incorporates materially adapted MIT-licensed code and tests. Exact source/destination mapping is recorded in `docs/REFERENCE_REUSE_MATRIX.md`.

| Project | Author/repository | Source commit | Incorporated areas |
|---|---|---|---|
| Codex-Wrapper | circlemouth/Codex-Wrapper | `e9353b8d29db0c00057f6c4f88e9d06fb27c61a6` | OpenAI contracts, prompt conversion, concurrency and streaming lifecycle |
| codex-multi-auth | ndycode/codex-multi-auth | `89ca9696d0f46cce48b28fdaa64a62d4bb521874` | API token patterns, ledger types/redaction and budget guard |
| codex-profiles | Ducksss/codex-profiles | `b0df2dd0ab955eb712436f234bbab984cc017992` | profile validation, canonical paths and `CODEX_HOME` isolation |
| OpenCodex | lidge-jun/opencodex | `d1f544bbc22d25b9b2bd3c8e776fb8e3242b4ed5` | SSE framing, provider registry, secret handling and persistent process architecture |

All four upstream projects are distributed under the MIT License. Their original copyright and permission notices are reproduced in `NOTICE`. AIWrapper changes include TypeScript ports, PostgreSQL persistence, Windows support, HMAC key digests and integration into a persistent Codex App Server gateway.
