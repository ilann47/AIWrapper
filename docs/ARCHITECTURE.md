# Arquitetura atual

AIWrapper é uma composição de quatro árvores upstream preservadas, com extensões próprias restritas ao domínio multiusuário.

```text
OpenCodex server + apps/opencodex-gui
  ├─ GUI administrativa upstream completa
  ├─ OAuth, providers, models, keys, usage, quotas, logs e settings
  └─ extensions/: Chat, Users, Organizations, Sessions, Sharing e Billing
                         │ chave individual
                         ▼
services/codex-wrapper (FastAPI upstream)
  ├─ /v1/models, /v1/chat/completions, /v1/responses e SSE
  ├─ app/aiwrapper: domínio e adapters permitidos
  ├─ governance bridge ──► packages/codex-multi-auth (código original compilado)
  └─ profiles adapter  ──► packages/codex-profiles/bin/codex-profile (original)
                         │
                         ▼
Codex CLI ──► auth.json da conta ChatGPT
```

SQLite armazena apenas entidades exclusivas do AIWrapper: usuários, organizações, sessões, mensagens e compartilhamentos. O ledger e o budget não são reimplementados no SQLite; eles são executados pelo codex-multi-auth e persistidos em seu formato file-backed original.

O frontend antigo, o Fastify antigo e as reimplementações locais de SSE, ledger, budget, profiles, provider registry e runtime foram removidos. As fronteiras de integração e justificativas estão em `provenance/components.json`.
