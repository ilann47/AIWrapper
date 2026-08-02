# Third-party software and incorporated code

| Project | Pinned commit | Incorporated tree |
|---|---|---|
| circlemouth/Codex-Wrapper | `e9353b8d29db0c00057f6c4f88e9d06fb27c61a6` | `services/codex-wrapper/` |
| lidge-jun/OpenCodex | `d1f544bbc22d25b9b2bd3c8e776fb8e3242b4ed5` | `apps/opencodex-gui/` and the original server under `upstream/opencodex/` |
| ndycode/codex-multi-auth | `89ca9696d0f46cce48b28fdaa64a62d4bb521874` | `packages/codex-multi-auth/` |
| Ducksss/codex-profiles | `b0df2dd0ab955eb712436f234bbab984cc017992` | `packages/codex-profiles/` |
| traycerai/traycer | `12b3bb82898af9d4eae333a7504f3005be96f577` | `upstream/traycer/` and selected chat runtime imports |
| decolua/9router | `6fcd27337a7893642c7fe630840d0a641743f28f` | `upstream/9router/`, RTK runtime and chat/usage adapters |

All six incorporated projects are MIT-licensed. Their source snapshots and license files are preserved under `upstream/`, and copied package trees retain their upstream license files. OAuth client credentials embedded by 9router were security-redacted and replaced with environment-variable lookups; this is the only snapshot-level source alteration. Odysseus (AGPL-3.0) and Dionysus (no license) were audited but not incorporated; see `FEATURE_GAP_ANALYSIS.md`. See `provenance/manifest.json` for exact per-file hashes and `docs/generated/PROVENANCE_EVIDENCE.md` for metrics and diffs.
