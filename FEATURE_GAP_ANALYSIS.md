# Feature gap analysis

Audit date: 2026-08-02. The comparison below records product decisions. The generated [component-level proof](docs/generated/PROVENANCE_EVIDENCE.md#component-summary) records, for every delivered functionality, its project, source and destination files, upstream commit, license, literal classification, preserved/changed/removed/added lines, reuse percentage and links to the exact unified diffs. It is generated from `provenance/components.json` by `pnpm provenance:update` and verified fail-closed by `pnpm provenance:verify`.

## Sources and licensing

| Project | Commit | License | Decision |
|---|---|---|---|
| OpenCodex | `d1f544bbc22d25b9b2bd3c8e776fb8e3242b4ed5` | MIT | Complete React/Vite GUI and provider/OAuth data plane incorporated as the product and execution base |
| Codex-Wrapper | `e9353b8d29db0c00057f6c4f88e9d06fb27c61a6` | MIT | Complete FastAPI/OpenAI proxy, Codex execution and SSE service incorporated and extended at policy boundaries |
| codex-multi-auth | `89ca9696d0f46cce48b28fdaa64a62d4bb521874` | MIT | Complete package incorporated; ledger, accounting and budget guard execute directly |
| codex-profiles | `b0df2dd0ab955eb712436f234bbab984cc017992` | MIT | Complete package incorporated; profile init/path/doctor execute through a subprocess adapter without porting logic |
| Traycer | `12b3bb82898af9d4eae333a7504f3005be96f577` | MIT | Complete snapshot incorporated; chat find and context-usage runtime directly imported |
| 9router | `6fcd27337a7893642c7fe630840d0a641743f28f` | MIT | Snapshot incorporated with embedded OAuth credentials security-redacted; RTK/capability runtime directly executed and chat/usage components adapted |
| Odysseus | `25c9e73543dece9a1d97cad55647ee4893920dff` | AGPL-3.0 | Audited but not copied into this MIT distribution; incorporation requires an explicit relicensing decision |
| pewdiepie-archdaemon/odysseus | `25c9e73543dece9a1d97cad55647ee4893920dff` | AGPL-3.0 | Exact duplicate of the Odysseus commit above |
| pewdiepie-archdaemon/dionysus | `1a5bdf7427093b353041addd55d6c056cf7dbaae` | No license | Arch/Hyprland dotfiles; not legally reusable or relevant to an AI gateway |

## Functional comparison

| Project | Functionality | Existed | Valuable | Code reused | Incorporated files | Adaptation | Status |
|---|---:|---:|---:|---:|---|---|---|
| OpenCodex | Product GUI, provider/model administration, OAuth pools, fallback, logs, usage and settings | Partial | Yes | Yes | Complete `upstream/opencodex/gui` and `src/server` → `apps/opencodex-gui` and canonical OpenCodex runtime | AIWrapper role/session/policy pages are mounted into the unchanged shell; data-plane adapter keeps original provider execution | wired |
| Codex-Wrapper | FastAPI OpenAI/Responses gateway, OAuth Codex CLI execution, models and SSE | No | Yes | Yes | Complete `upstream/codex-wrapper` → `services/codex-wrapper` | Multi-user authentication, quotas and OpenCodex execution are integration boundaries around the original service | wired |
| codex-multi-auth | Ledger, token accounting, budget guard and usage grouping | No | Yes | Yes | Complete package plus `governance-bridge.mjs` | JSON subprocess executes compiled upstream functions unchanged | wired |
| codex-profiles | Isolated CODEX_HOME creation, status and doctor diagnostics | Partial | Yes | Yes | Complete package, `profiles.py`, `ProfilesPage.tsx` | FastAPI invokes original `init`, `path` and `doctor --json`; admin UI renders the machine-readable contract | wired |
| Traycer | In-chat mounted-range highlighting | No | Yes | Yes | `chat-find-highlighter.ts` → `traycer-chat-runtime.ts` | Re-export and message-container binding | wired |
| Traycer | Context-window formatting/warning tone | Partial | Yes | Yes | `context-usage.ts` → `traycer-chat-runtime.ts` | Feed per-user quota data | wired |
| Traycer | Fuzzy conversation search and favorite-first history ordering | Partial | Yes | Yes | `use-history-query.ts`, `home-page.data.ts` → `traycer-session-history.ts` | Traycer's host/cloud task boundary is replaced by authenticated AIWrapper sessions; Fuse thresholds, relevance flow and sorting architecture are retained | wired |
| Traycer | Notification lifecycle, filters, Attention/Recent feed, live-arrival toasts and stable scrolling | No | Yes | Yes | `notification-lifecycle.ts`, `notification-category.ts`, `notifications-popover-store.ts`, `notification-occurrence.ts`, `notification-temporal-group.ts`, `use-notification-center-arrivals.ts`, `use-notification-center-scroll-anchor.ts`, `notifications-popover.tsx` → `aiwrapper-notifications` | Portable modules copied with only type-boundary adaptation; host-bound UI adapted to the authenticated quota/audit feed | wired |
| Traycer | First-launch onboarding, progress, keyboard flow and replay | No | Yes | Yes | `onboarding-store.ts`, `onboarding-acts.ts`, `onboarding-page.tsx` → `aiwrapper-onboarding` | Retains the Zustand lifecycle and act/progress/navigation architecture; scopes completion per AIWrapper user and replaces desktop/provider-only screens with real product destinations | wired |
| Traycer | Agent/workspace collaboration | No | Yes | Snapshot only | `upstream/traycer/` | Needs Traycer desktop services/project graph | preserved |
| Traycer | Chat/composer/session UX | Partial | Yes | Selected modules | Complete snapshot plus runtime exports | AIWrapper keeps authenticated HTTP/SSE boundary | wired |
| 9router | RTK token compression | No | Yes | Yes | `open-sse/rtk/index.js` → `nine-router-bridge.mjs` | JSON subprocess boundary only | wired |
| 9router | Headroom external compression and health | No | Yes | Yes | `open-sse/rtk/headroom.js`, `src/lib/headroom/detect.js` executed by `nine-router-bridge.mjs` | Complete compressor/diagnostics and original `/health` probe; administrator-owned HTTP(S) endpoint | wired |
| 9router | Caveman terse-response transform | No | Yes | Yes | `open-sse/rtk/caveman.js`, `cavemanPrompts.js`, `systemInject.js` executed by `nine-router-bridge.mjs` | Original OpenAI-format injector; persisted administrator setting | wired |
| 9router | Ponytail minimal-code transform | No | Yes | Yes | `open-sse/rtk/ponytail.js`, `ponytailPrompt.js`, `systemInject.js` executed by `nine-router-bridge.mjs` | Original OpenAI-format injector; persisted administrator setting | wired |
| 9router | Required capability detection | No | Yes | Yes | `open-sse/services/combo.js` → same bridge | JSON operation selector | wired |
| 9router | Chat attachments, IDs, dates, content normalization | Partial | Yes | Yes | `BasicChatPageClient.js` → `nine-router-chat-core.ts` | Type contracts and gateway binding | wired |
| 9router | Usage overview cards/table | Partial | Yes | Yes | `OverviewCards.js`/`UsageTable.js` → `nine-router-usage.tsx` | OpenCodex tokens and authenticated ledger | wired |
| 9router | Lightweight SQLite safety backup and bounded retention | No | Yes | Yes | `src/lib/db/backup.js` → `nine-router-db-backup.mjs` | Parameterized AIWrapper state path; original ATTACH copy and retention preserved | wired |
| 9router | Provider pools/OAuth/fallback | Yes via OpenCodex | Yes | Yes, equivalent mature upstream runtime | `upstream/opencodex/src/server/` executed through `opencodex.py` | Avoid a conflicting second router while exposing the same multi-provider capability through the primary OpenCodex runtime | wired |
| 9router | Grouping by model/day/outcome | Partial | Yes | Yes | codex-multi-auth summarizer + 9router-style UI | Existing bridge gained a grouping input | wired |
| 9router | Persistent Token Saver settings and product control | No | Yes | Yes | `settingsRepo.js`, `nodeSqliteAdapter.js`, `TokenSaverClient.js` adapted into runtime repository, SQLite boundary and `TokenSaverPanel.tsx` | Canonical AIWrapper database, administrator auth, external Headroom status and OpenCodex design tokens | wired |
| 9router | Headroom local installer/process manager | No | Conditional | No | `src/lib/headroom/process.js` remains in `upstream/` | Mutates host Python packages and starts detached processes; production topology requires a separately managed service instead | audited, not wired |
| 9router | PXPIPE image-context transform | No | Conditional | No | `open-sse/rtk/pxpipe.js`, `src/lib/pxpipe/loader.js`, `src/lib/pxpipe/install.js` remain in `upstream/` | The transform only accepts Claude bodies after provider translation, but AIWrapper's policy boundary runs on OpenAI bodies before OpenCodex routing. The actual `pxpipe-proxy` source is absent and upstream installs mutable `@latest`; adapting at this layer would either corrupt provider-neutral routing or require a replacement implementation. | audited, not wired |
| 9router | Header/sidebar navigation search | No | Yes | Yes | `headerSearchStore.js` and `Header.js` adapted into `header-search-store.ts` and `NavigationSearch.tsx` | Strict TypeScript, OpenCodex hash navigation and existing SVG/CSS tokens | wired |
| 9router | Codex CLI and OpenAI-client connection wizard | No | Yes | Yes | `CodexToolCard.js`, `ManualConfigModal.js` → `aiwrapper-connections` | Preserves manual config generation and copy flow; intentionally excludes server-host writes that would replace the gateway's ChatGPT OAuth | wired |
| Traycer | Full command palette | No | Yes | No | `apps/desktop/src/renderer/components/command-palette/` | Depends on Traycer's Radix/cmdk stack, analytics, workspace stores and TanStack route graph; mounting it would import a second application shell. The portable global-search need is fulfilled with the smaller original 9router store/component instead. | audited |
| Odysseus | Tauri shell, terminal and file tools | No | Conditional | No | None | AGPL and incompatible desktop topology | blocked |
| Odysseus | MCP/plugin workflows | Partial | Yes | No | None | Existing Codex/OpenCodex surface avoids AGPL copy | blocked |
| PewDiePie Odysseus | All functions | Same | Same | No | None | Byte-identical audited source | duplicate |
| PewDiePie Dionysus | Hyprland configuration | No | No | No | None | No license; unrelated domain | rejected |

## Product UX delivered

- User navigation: Chat, Conversations, Sharing and personal Usage.
- Connect apps: users generate Codex CLI `config.toml`/`auth.json` and OpenAI-compatible environment variables with endpoint guidance, live model discovery and memory-only individual-key handling.
- First use: a Traycer-derived four-act tour introduces Chat, Conversations, Usage and Connect apps, remembers completion per user and remains replayable from the sidebar.
- Profiles: creating a user automatically initializes an isolated `CODEX_HOME`; administrators can inspect original codex-profile CLI health, login state, paths and workspace-reference diagnostics without entering filesystem paths manually.
- Global navigation search: filters every role-visible destination and focuses with `Ctrl+K`/`Cmd+K`, preserving the 9router registration/query lifecycle.
- Conversation history uses Traycer's Fuse-based tolerant search, relevance ordering and favorite-first recent/oldest/title projections.
- Notifications use Traycer's original lifecycle, category, popover-filter, occurrence, live-arrival, scroll-anchor and calendar-grouping modules with a persistent per-user quota/audit feed, unread badge, Attention/Recent center, N-new reveal control and live Sonner toasts.
- Administrator navigation: Administration, Monitoring, System and Configuration.
- Chat: search, favorites, history, recent/new/continued sessions, rename, delete, share, Markdown export, model, effort, streaming, cancel, copy, regenerate, edit/resend, Markdown/GFM, code and image attachments.
- Usage: 5-hour/7-day quota bars, health, request/input/cache/output/cost cards, usage by day and usage by model.
- RTK compression runs before Codex and reports saved bytes in `X-AIWrapper-RTK-Saved-Bytes`.
- Administrators can configure RTK, external Headroom, Caveman and Ponytail from the dashboard; the complete 9router settings repository persists every choice transactionally, while `AIWRAPPER_RTK_ENABLED` remains a deployment-level RTK safety lock.
- The canonical Docker topology routes Codex-Wrapper through OpenCodex's original data plane, so provider OAuth, account pools, model visibility, fallback and measured token usage now affect AIWrapper chat requests instead of remaining a disconnected administration surface.
- The OpenCodex image now builds the GUI in its real `apps/` + `extensions/` repository layout with a frozen Bun lock, then copies only the compiled static output into the unchanged runtime; clean container builds no longer omit AIWrapper pages or create a second React instance.

## Production integration increment (2026-08-02)

- `AIWRAPPER_EXECUTION_BACKEND=opencodex` keeps Codex-Wrapper as the public policy/quota gateway and executes provider traffic through the unchanged OpenCodex server.
- Model discovery comes from OpenCodex `/v1/models`; readiness verifies the identity-bearing OpenCodex `/healthz` response.
- Streaming and non-streaming requests retain OpenCodex-reported input, output, cached-input and reasoning usage for the codex-multi-auth ledger. Character estimation remains only as the explicit CLI fallback.
- Browser access is origin-allowlisted and request rate limiting is attributed to the authenticated AIWrapper principal rather than only to a shared reverse-proxy IP.
- The Docker image now includes the 9router runtime bridge that was previously absent from the production stage, so RTK no longer silently fails open solely because of packaging.
- The imported OpenCodex dashboard now embeds an administrator-only AIWrapper operations strip, using the original polling/stat composition for user, conversation, active-request, queue, throughput, failure, block and latency metrics.
- OpenCodex's memory-only, origin-bound GUI-session architecture now protects AIWrapper users: the individual key is exchanged once, access credentials stay in memory, an HttpOnly refresh is rotated, and user disable/key rotation revokes active sessions.
- Conversation sharing is complete rather than decorative: public read-only routes, one-time secret links, hashed persistence, 1/7/30-day expiration, owner revocation and a themed public transcript are wired end to end.
- SQLite startup migrations now add indexed auth, audit, message, session and share paths. Security/governance events are persisted and exposed to administrators in the existing dashboard extension.
- The administrator dashboard now invokes 9router's original ATTACH-based lightweight SQLite backup, retains the newest three copies and downloads a portable database file. The runtime image includes the actual 9router source tree and Node 22 needed by the SQLite bridge.
- The dashboard now exposes 9router's Token Saver as a commercial settings card. RTK, external Headroom, Caveman and Ponytail state is stored by the adapted original settings repository in the canonical SQLite database and takes effect on the next request without a restart; compressor, health probe and prompt injectors execute directly from upstream.

## Parity audit

Complete Traycer and 9router trees remain in `upstream/`; the smaller adapters do not claim to replace either application. RTK and highlighting execute/re-export original modules. Chat and analytics adapters retain portable presentation/helper behavior; provider-specific fetch paths, Next.js/Tauri services and unrelated administration remain explicitly not wired. Odysseus code was not copied because AGPL-3.0 is incompatible with this distribution decision, and Dionysus provides no reuse license.

The 9router snapshot differs only where upstream committed OAuth client credentials. Those literals were replaced with `NINE_ROUTER_*` environment lookups and redacted test baselines so GitHub push protection and downstream forks do not redistribute them.

OpenCodex now supplies multi-provider pooling and automated fallback on the canonical request path. Remaining candidates are Traycer project graphs/desktop orchestration and legally compatible substitutes for the AGPL-only Odysseus desktop surface; they are intentionally not represented as complete today.
