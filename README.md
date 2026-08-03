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
| `extensions/` | AIWrapper + módulos comunitários rastreados | Chat, Users, Organizations, Sessions, Sharing, Billing, notificações, conexão de clientes, permissões e adapters |

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

Abra `http://127.0.0.1:8765`. O item **Codex Auth** mantém o OAuth original do OpenCodex. No primeiro acesso às páginas AIWrapper, informe a chave individual uma vez: o servidor troca a chave por um access token curto mantido somente em memória e um refresh rotacionado em cookie HttpOnly. A sessão é restaurada silenciosamente depois de recarregar a página, sem gravar a chave em `localStorage` ou `sessionStorage`. Na primeira inicialização local, a chave owner é criada atomicamente em `services/codex-wrapper/.aiwrapper/bootstrap-owner.key` (arquivo ignorado pelo Git). Bancos temporários e testes gravam sua própria chave ao lado da respectiva base, sem alterar a recuperação da instância configurada.

O frontend dev separado também pode ser iniciado com `pnpm dev:web`, usando `OPENCODEX_PROXY_TARGET=http://127.0.0.1:8765` quando precisar encaminhar as APIs de gerenciamento do OpenCodex.

Use `Ctrl+K` (ou `Cmd+K`) para focar a busca global da barra lateral. Ela filtra somente as páginas permitidas para o papel autenticado e reutiliza o ciclo de registro e consulta do header search original do 9router.

No primeiro acesso de cada usuário, o onboarding derivado do Traycer apresenta Chat, Conversas, Consumo e Conectar aplicativos em quatro passos. O progresso aceita teclado (`←`, `→`, `Enter` e `Esc`), a conclusão é armazenada por usuário e o tour pode ser reaberto em **Primeiros passos**.

Ao criar um usuário, o backend chama `codex-profile init` e `codex-profile path` diretamente; não é necessário informar `CODEX_HOME`. Em **Perfis**, administradores veem o resultado original de `codex-profile doctor --json`: versão e saúde do CLI, login por perfil, diretórios isolados, vínculos e referências ausentes de workspaces.

Em **Conectar aplicativos**, cada usuário pode informar temporariamente sua chave individual, escolher o modelo e gerar os arquivos `~/.codex/config.toml` e `~/.codex/auth.json` para usar o Codex CLI através do AIWrapper. A tela também gera `OPENAI_BASE_URL` e `OPENAI_API_KEY` para outros clientes compatíveis. A chave permanece somente na memória da página; a gravação automática do 9router no host foi deliberadamente excluída porque alteraria o OAuth compartilhado do servidor em vez do computador do usuário.

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
- `GET /admin/multi-auth/monitor`
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

O card **Token Saver** no dashboard controla RTK, Headroom, Caveman e Ponytail sem reiniciar os serviços. O repositório transacional original do 9router persiste as escolhas na base AIWrapper; os módulos Headroom/Caveman/Ponytail originais executam no pedido OpenAI e `AIWRAPPER_RTK_ENABLED=false` continua funcionando como trava mestra exclusiva da compressão RTK.

Headroom é integrado como serviço externo: implante o proxy separadamente, informe uma URL HTTP(S) alcançável pelo `codex-wrapper` (por exemplo `http://headroom:8787` numa rede Compose) e confirme **Reachable** antes de ativar. O AIWrapper não instala pacotes Python nem inicia processos no host; o status usa o health probe original do 9router e o compressor permanece fail-open.

### Governança multi-conta

O card **Codex multi-account governance** executa o `monitor --json` original do codex-multi-auth e mostra policies, budget guards, perfil de roteamento do projeto, capability matrix, quota cache, ledger e runtime. Ele é deliberadamente somente leitura; a rotação só deve ser ativada depois de cadastrar duas ou mais identidades OAuth independentes.

Para implantações remotas, defina `VITE_API_BASE` e `VITE_AIWRAPPER_API_BASE` com as URLs públicas vistas pelo navegador antes de construir a imagem. A imagem Docker recebe ambas como argumentos de build; nomes internos da rede Docker não devem ser enviados ao navegador.

### Topologia de produção com uma única origem

O manifesto `docker-compose.production.yml` coloca OpenCodex e Codex-Wrapper em rede privada e publica somente um Nginx em `8080`. O frontend e as APIs originais do OpenCodex permanecem em `/`; a API autenticada do AIWrapper fica em `/aiwrapper/`. Essa composição evita URLs internas no bundle, elimina CORS entre os dois serviços e preserva SSE sem buffering.

```bash
cp .env.production.example .env.production
mkdir -p /srv/aiwrapper/codex-home
# Edite origem pública, diretório OAuth e os três segredos antes de iniciar.
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --wait
AIWRAPPER_PRODUCTION_E2E_ORIGIN=http://127.0.0.1:8080 pnpm test:e2e:compose
```

Mantenha `AIWRAPPER_PUBLIC_BIND=127.0.0.1` quando TLS for terminado por Nginx, Caddy, Cloudflare Tunnel ou outro proxy do host. O proxy externo deve encaminhar para `127.0.0.1:8080`, preservar `X-Forwarded-*` e permitir respostas SSE longas. Use `AIWRAPPER_SESSION_COOKIE_SECURE=true` com HTTPS. Para exposição direta em uma rede privada controlada, altere o bind conscientemente; os containers internos não publicam `8765` ou `8766` nessa topologia.

O diretório indicado por `CODEX_HOST_HOME` é montado com escrita somente no OpenCodex e como somente leitura no fallback Codex-Wrapper. Faça o login OAuth nesse diretório antes da implantação e proteja-o como segredo. `.env.production.example` contém apenas marcadores e não deve ser usado sem substituir `OPENCODEX_API_AUTH_TOKEN`, `OPENCODEX_ADMIN_AUTH_TOKEN` e `AIWRAPPER_OWNER_KEY` por três valores aleatórios independentes. O OpenCodex recusa deliberadamente reutilizar o segredo do data plane como segredo administrativo.

## Validação e proveniência

```powershell
pnpm build
pnpm test
pnpm --dir apps/opencodex-gui lint
pnpm --dir apps/opencodex-gui lint:i18n
pnpm provenance:update
pnpm provenance:verify
pnpm test:e2e:compose # com a topologia de produção já ativa
```

### Gate E2E da topologia real

Com OpenCodex em `8765` e Codex-Wrapper em `8766`, execute uma prova ponta a ponta opt-in:

```powershell
$env:AIWRAPPER_E2E_LIVE='1'
$env:AIWRAPPER_E2E_KEY_FILE='services/codex-wrapper/.aiwrapper/bootstrap-owner.key'
pnpm test:e2e:live
```

O gate reutiliza o padrão de smoke live do 9router e o isolamento/redação do OpenCodex. Ele valida sessão de navegador vinculada à origem, descoberta de modelos, resposta SSE real, persistência e edição da conversa, exportação Markdown, compartilhamento temporário e contabilização no ledger. A conversa, o link público e a sessão de autenticação criados pelo teste são removidos no `finally`. A execução é recusada sem `AIWRAPPER_E2E_LIVE=1`, pois faz uma solicitação curta ao provider conectado.

Para validar a experiência completa em Chrome/Edge real, incluindo o bundle compilado:

```powershell
$env:AIWRAPPER_E2E_UI_LIVE='1'
$env:AIWRAPPER_E2E_KEY_FILE='services/codex-wrapper/.aiwrapper/bootstrap-owner.key'
pnpm test:e2e:ui
```

Esse gate importa diretamente o transporte CDP do Traycer e usa um perfil temporário. Ele percorre login, onboarding, navegação por papel, chat SSE, histórico, arquivamento e desconexão, falha diante de erros JavaScript ou toasts históricos e salva uma captura local em `services/codex-wrapper/.aiwrapper/e2e/live-browser-smoke.png`. A conversa criada é arquivada pela interface e removida pela API se o fluxo falhar antes da limpeza.

Classificações são literais: `copied`, `directly imported`, `adapter`, `imported-not-wired` ou `IMPLEMENTAÇÃO PRÓPRIA`. Código próprio só aparece nas funcionalidades exclusivas permitidas e em boundaries de integração, sempre com incompatibilidade e auditoria documentadas.
