# Adoção upstream

| Módulo final | Origem preservada | Classificação | Integração mínima |
|---|---|---|---|
| `apps/opencodex-gui/` | `upstream/opencodex/gui/` | `adapter` | rotas e imports das seis extensões; traduções sincronizadas |
| `services/codex-wrapper/` | `upstream/Codex-Wrapper/` | `adapter` | autenticação individual, quota preflight, ledger e sessão nas bordas existentes |
| `packages/codex-multi-auth/` | `upstream/codex-multi-auth/` | `copied` | pacote completo; build e funções originais executados pelo bridge |
| `packages/codex-profiles/` | `upstream/codex-profiles/` | `copied` | pacote completo; Bash original chamado pelo adapter Python |
| `extensions/aiwrapper-*` | referências revisadas, sem equivalente upstream | `IMPLEMENTAÇÃO PRÓPRIA` | apenas Chat, Users, Organizations, Sessions, Sharing, Billing, permissões e integração |

Não há módulos classificados como “inspirados” ou “reescritos”. A classificação literal, incompatibilidade, auditoria de paridade, commit, licença, hashes, métricas e diff de cada arquivo estão no manifesto e no relatório gerado.

Ledger, accounting e budget guard estão ligados ao request path. Account policies, routing profiles e health-based rotation permanecem completos, porém classificados como `imported-not-wired`: com apenas uma conta OAuth ChatGPT, não existe uma segunda conta real para rotear ou rotacionar. Ativá-los agora criaria uma falsa impressão de separação do limite upstream.

- Manifesto: `provenance/manifest.json`
- Configuração auditável: `provenance/components.json`
- Evidência humana: `docs/generated/PROVENANCE_EVIDENCE.md`
- Unified diffs: `provenance/diffs/`
