# AIWrapper Lab

Laboratório multiusuário para o Codex autenticado por uma conta ChatGPT. O projeto é uma composição rastreável de forks reais: o frontend administrativo é o GUI completo do OpenCodex; o proxy é o FastAPI completo do Codex-Wrapper; ledger, accounting e budget executam o codex-multi-auth; isolamento de `CODEX_HOME` chama o executável original do codex-profiles.

> Este controle cobre somente requisições que passam pelo gateway. Ele não divide oficialmente o limite da assinatura, não bloqueia uso direto no ChatGPT/Codex e não deve ser exposto publicamente como revenda ou compartilhamento de conta.

## Origem dos módulos

| Caminho | Base real | Papel |
|---|---|---|
| `apps/opencodex-gui/` | `lidge-jun/OpenCodex` | GUI React/Vite completa, OAuth, providers, models, keys, usage, quotas, logs e settings |
| `services/codex-wrapper/` | `circlemouth/Codex-Wrapper` | FastAPI, OpenAI proxy, Codex CLI, modelos, OAuth e streaming SSE |
| `packages/codex-multi-auth/` | `ndycode/codex-multi-auth` | ledger, usage, accounting, budgets, policies, routing e rotação |
| `packages/codex-profiles/` | `Ducksss/codex-profiles` | perfis e isolamento real de `CODEX_HOME`/`auth.json` |
| `extensions/` | AIWrapper | somente Chat, Users, Organizations, Sessions, Sharing, Billing, permissões e adapters |

As quatro árvores upstream, commits e licenças estão preservados em `upstream/`. A evidência linha a linha é gerada em `docs/generated/PROVENANCE_EVIDENCE.md`; os unified diffs ficam em `provenance/diffs/`.

## Executar localmente no Windows

Requisitos: Python 3.11+, Node 20+, pnpm 10+, Git for Windows e Codex CLI autenticado.

```powershell
cd 'C:\Users\ilan.wendling\Documents\AI Wrapper'
corepack enable
pnpm install
python -m pip install -r services/codex-wrapper/requirements.txt
codex login
pnpm build:governance
pnpm build:web
```

Terminal 1 — backend Codex-Wrapper com extensões:

```powershell
pnpm dev:api
```

Terminal 2 — servidor e GUI completos do OpenCodex:

```powershell
pnpm dev:opencodex -- --port 8765
```

Abra `http://127.0.0.1:8765`. O item **Codex Auth** mantém o OAuth original do OpenCodex. No primeiro acesso às páginas AIWrapper, informe a chave individual uma vez: o servidor troca a chave por um access token curto mantido somente em memória e um refresh rotacionado em cookie HttpOnly. A sessão é restaurada silenciosamente depois de recarregar a página, sem gravar a chave em `localStorage` ou `sessionStorage`. Na primeira inicialização local, a chave owner é criada uma única vez em `services/codex-wrapper/.aiwrapper/bootstrap-owner.key` (arquivo ignorado pelo Git).

O frontend dev separado também pode ser iniciado com `pnpm dev:web`, usando `OPENCODEX_PROXY_TARGET=http://127.0.0.1:8765` quando precisar encaminhar as APIs de gerenciamento do OpenCodex.

Use `Ctrl+K` (ou `Cmd+K`) para focar a busca global da barra lateral. Ela filtra somente as páginas permitidas para o papel autenticado e reutiliza o ciclo de registro e consulta do header search original do 9router.

## Fluxo de uma conversa

1. A chave individual identifica usuário, organização, papel e perfil.
2. O budget guard original do codex-multi-auth avalia as janelas de 5 horas e 7 dias.
3. No `docker compose`, o Codex-Wrapper envia a requisição ao data plane original do OpenCodex, que executa o provider/OAuth/account pool/fallback selecionado. `AIWRAPPER_EXECUTION_BACKEND=codex-cli` preserva o CLI direto como fallback explícito.
4. O SSE original transmite a resposta; Chat mostra modelo, effort e tempo decorrido.
5. Em sucesso, erro, bloqueio ou desconexão, o gateway grava uma entrada no ledger original do codex-multi-auth; no backend OpenCodex usa os tokens reportados pelo provider, incluindo cache e reasoning.
6. Sessão e mensagens ficam persistidas para listar, continuar ou iniciar outra conversa.
7. Links compartilhados são exibidos uma única vez, armazenados somente como hash, podem expirar e podem ser revogados pelo proprietário.

As cotas usam **tokens contabilizados pelo ledger interno**, pois a assinatura ChatGPT não expõe um orçamento fixo por usuário. No backend OpenCodex, o ledger preserva os tokens de entrada, saída, cache e raciocínio reportados pelo provider; no fallback `codex-cli`, estima entrada/saída por caracteres. Os limites podem ser editados na página Users. Isso é governança local, não o contador oficial da OpenAI.

## API principal

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/me` e `/v1/me/usage`
- `POST /auth/sessions`, `POST /auth/sessions/refresh` e `DELETE /auth/sessions/current`
- `GET /admin/overview`
- `GET /admin/audit`
- `GET/POST /admin/backups` e `GET /admin/backups/{id}`
- `GET/PATCH /admin/token-saver`
- `GET/POST/PATCH /admin/users`
- `GET/POST /admin/organizations`
- `GET/DELETE /v1/sessions`
- `GET/POST /v1/shares`
- `DELETE /v1/shares/{id}` e `GET /public/shares/{token}`

Exemplo:

```powershell
$headers = @{ Authorization = 'Bearer aiw_SUA_CHAVE' }
$body = @{ model='codex-cli'; reasoning_effort='medium'; stream=$false; messages=@(@{role='user'; content='Responda OK'}) } | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:8766/v1/chat/completions -Method Post -Headers $headers -ContentType application/json -Body $body
```

## Docker

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Os serviços são publicados somente em loopback: OpenCodex em `8765` e Codex-Wrapper em `8766`. `OPENCODEX_API_AUTH_TOKEN` é obrigatório no Compose e também autentica o canal interno configurado por `AIWRAPPER_OPENCODEX_API_KEY`. Proteja o volume OAuth, use segredos aleatórios e mantenha `AIWRAPPER_CORS_ORIGINS` restrito às origens reais. Em publicação HTTPS, configure `AIWRAPPER_SESSION_COOKIE_SECURE=true`; em HTTP local ele deve permanecer `false`.

O botão **Download backup** no dashboard administrativo executa o algoritmo SQLite original do 9router, preserva esquema e dados e mantém somente as três cópias mais recentes em `AIWRAPPER_STATE_DIR/backups`.

O card **Token Saver** no dashboard controla RTK, Caveman e Ponytail sem reiniciar os serviços. O repositório transacional original do 9router persiste as escolhas na base AIWrapper; os módulos Caveman/Ponytail originais injetam os respectivos prompts no pedido OpenAI e `AIWRAPPER_RTK_ENABLED=false` continua funcionando como trava mestra exclusiva da compressão RTK.

## Validação e proveniência

```powershell
pnpm build
pnpm test
pnpm --dir apps/opencodex-gui lint
pnpm --dir apps/opencodex-gui lint:i18n
pnpm provenance:update
pnpm provenance:verify
```

Classificações são literais: `copied`, `directly imported`, `adapter`, `imported-not-wired` ou `IMPLEMENTAÇÃO PRÓPRIA`. Código próprio só aparece nas funcionalidades exclusivas permitidas e em boundaries de integração, sempre com incompatibilidade e auditoria documentadas.
