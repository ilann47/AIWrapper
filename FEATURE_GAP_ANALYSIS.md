# Feature gap analysis

Audit date: 2026-08-01. Exact line counts, reuse percentages and unified diffs are generated from `provenance/components.json` into `docs/generated/PROVENANCE_EVIDENCE.md`.

## Sources and licensing

| Project | Commit | License | Decision |
|---|---|---|---|
| Traycer | `12b3bb82898af9d4eae333a7504f3005be96f577` | MIT | Complete snapshot incorporated; chat find and context-usage runtime directly imported |
| 9router | `6fcd27337a7893642c7fe630840d0a641743f28f` | MIT | Snapshot incorporated with embedded OAuth credentials security-redacted; RTK/capability runtime directly executed and chat/usage components adapted |
| Odysseus | `25c9e73543dece9a1d97cad55647ee4893920dff` | AGPL-3.0 | Audited but not copied into this MIT distribution; incorporation requires an explicit relicensing decision |
| pewdiepie-archdaemon/odysseus | `25c9e73543dece9a1d97cad55647ee4893920dff` | AGPL-3.0 | Exact duplicate of the Odysseus commit above |
| pewdiepie-archdaemon/dionysus | `1a5bdf7427093b353041addd55d6c056cf7dbaae` | No license | Arch/Hyprland dotfiles; not legally reusable or relevant to an AI gateway |

## Functional comparison

| Project | Functionality | Existed | Valuable | Code reused | Incorporated files | Adaptation | Status |
|---|---:|---:|---:|---:|---|---|---|
| Traycer | In-chat mounted-range highlighting | No | Yes | Yes | `chat-find-highlighter.ts` → `traycer-chat-runtime.ts` | Re-export and message-container binding | wired |
| Traycer | Context-window formatting/warning tone | Partial | Yes | Yes | `context-usage.ts` → `traycer-chat-runtime.ts` | Feed per-user quota data | wired |
| Traycer | Agent/workspace collaboration | No | Yes | Snapshot only | `upstream/traycer/` | Needs Traycer desktop services/project graph | preserved |
| Traycer | Chat/composer/session UX | Partial | Yes | Selected modules | Complete snapshot plus runtime exports | AIWrapper keeps authenticated HTTP/SSE boundary | wired |
| 9router | RTK token compression | No | Yes | Yes | `open-sse/rtk/index.js` → `nine-router-bridge.mjs` | JSON subprocess boundary only | wired |
| 9router | Required capability detection | No | Yes | Yes | `open-sse/services/combo.js` → same bridge | JSON operation selector | wired |
| 9router | Chat attachments, IDs, dates, content normalization | Partial | Yes | Yes | `BasicChatPageClient.js` → `nine-router-chat-core.ts` | Type contracts and gateway binding | wired |
| 9router | Usage overview cards/table | Partial | Yes | Yes | `OverviewCards.js`/`UsageTable.js` → `nine-router-usage.tsx` | OpenCodex tokens and authenticated ledger | wired |
| 9router | Provider pools/OAuth/fallback | Yes via OpenCodex | Yes | Snapshot only | `upstream/9router/` | Avoided a conflicting second router | preserved |
| 9router | Grouping by model/day/outcome | Partial | Yes | Yes | codex-multi-auth summarizer + 9router-style UI | Existing bridge gained a grouping input | wired |
| Odysseus | Tauri shell, terminal and file tools | No | Conditional | No | None | AGPL and incompatible desktop topology | blocked |
| Odysseus | MCP/plugin workflows | Partial | Yes | No | None | Existing Codex/OpenCodex surface avoids AGPL copy | blocked |
| PewDiePie Odysseus | All functions | Same | Same | No | None | Byte-identical audited source | duplicate |
| PewDiePie Dionysus | Hyprland configuration | No | No | No | None | No license; unrelated domain | rejected |

## Product UX delivered

- User navigation: Chat, Conversations, Sharing and personal Usage.
- Administrator navigation: Administration, Monitoring, System and Configuration.
- Chat: search, favorites, history, recent/new/continued sessions, rename, delete, share, Markdown export, model, effort, streaming, cancel, copy, regenerate, edit/resend, Markdown/GFM, code and image attachments.
- Usage: 5-hour/7-day quota bars, health, request/input/cache/output/cost cards, usage by day and usage by model.
- RTK compression runs before Codex and reports saved bytes in `X-AIWrapper-RTK-Saved-Bytes`.

## Parity audit

Complete Traycer and 9router trees remain in `upstream/`; the smaller adapters do not claim to replace either application. RTK and highlighting execute/re-export original modules. Chat and analytics adapters retain portable presentation/helper behavior; provider-specific fetch paths, Next.js/Tauri services and unrelated administration remain explicitly not wired. Odysseus code was not copied because AGPL-3.0 is incompatible with this distribution decision, and Dionysus provides no reuse license.

The 9router snapshot differs only where upstream committed OAuth client credentials. Those literals were replaced with `NINE_ROUTER_*` environment lookups and redacted test baselines so GitHub push protection and downstream forks do not redistribute them.

Future candidates include multi-provider pooling, automated fallback, Traycer project graphs and desktop orchestration. They are intentionally not represented as complete today.
