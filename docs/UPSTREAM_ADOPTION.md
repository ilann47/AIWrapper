# Upstream adoption report

This document deliberately distinguishes copied code, direct imports, adapters and original code.

## Imported Git histories

| Project | Pinned commit | Location | License |
|---|---|---|---|
| circlemouth/Codex-Wrapper | `e9353b8d29db0c00057f6c4f88e9d06fb27c61a6` | `upstream/Codex-Wrapper` | MIT |
| lidge-jun/OpenCodex | `d1f544bbc22d25b9b2bd3c8e776fb8e3242b4ed5` | `upstream/opencodex` | MIT |
| ndycode/codex-multi-auth | `89ca9696d0f46cce48b28fdaa64a62d4bb521874` | `upstream/codex-multi-auth` | MIT |
| Ducksss/codex-profiles | `b0df2dd0ab955eb712436f234bbab984cc017992` | `upstream/codex-profiles` | MIT |

All four projects were added with `git subtree`, not copied as unattributed snapshots. Their upstream commit ancestry is present in this repository.

## Real reuse matrix

| Source | Destination / consumer | Classification | Preserved / changed / added | Reason |
|---|---|---|---|---|
| `upstream/Codex-Wrapper/app/*.py` | `services/codex-wrapper/app/*.py` | **COPIED MODULE** | exact copies; see generated report | Runs the original FastAPI proxy, Codex execution, streaming, schemas, images, model registry and middleware. |
| `upstream/Codex-Wrapper/tests/*.py` | `services/codex-wrapper/tests/*.py` | **COPIED TESTS** | exact copies; see generated report | Keeps the upstream behavioral contract attached to the copied service. |
| `upstream/codex-multi-auth/lib/budget-guard.ts` | `packages/quota/src/budget.ts` | **DIRECT RUNTIME IMPORT + ADAPTER** | upstream unchanged; adapter is original | Calendar windows and allow/deny evaluation call the original functions. The adapter maps PostgreSQL metrics and rolling windows. |
| `upstream/codex-multi-auth/lib/usage/pricing.ts` | no production consumer yet | **IMPORTED, NOT YET WIRED** | upstream unchanged | Pricing cannot be applied correctly until the selected model is carried into reconciliation. |
| `upstream/opencodex` | no production consumer yet | **IMPORTED, NOT YET WIRED** | upstream unchanged | The pinned project manages providers/configuration but does not expose a source-compatible AIWrapper App Server transport. The local runtime is **IMPLEMENTAÇÃO PRÓPRIA**. |
| `upstream/codex-profiles/bin/codex-profile` | no Windows production consumer | **IMPORTED, INCOMPATIBLE** | upstream unchanged | The original implementation is Bash and its desktop flow is macOS-only. The Windows profile manager is **IMPLEMENTAÇÃO PRÓPRIA**. |

## Important original implementations

`apps/web`, `apps/api`, `packages/codex-runtime`, the PostgreSQL layer, scheduler, Redis lock, observability and subscription-relative weighted units are **IMPLEMENTAÇÃO PRÓPRIA**. They are not presented as copied or adapted code.

## Reproducible line report

Run `pnpm provenance:update`. The generator is adapted from codex-multi-auth's vendor provenance tooling and writes `provenance/manifest.json`, `provenance/diffs/*.diff` and `docs/generated/PROVENANCE_EVIDENCE.md`. Validate all hashes with `pnpm provenance:verify`.
