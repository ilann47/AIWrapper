# AIWrapper Lab

Laboratório de gateway multiusuário com autenticação por chave, cotas ponderadas, duas janelas móveis, rate limit, SQLite, auditoria e dashboard.

O projeto funciona por padrão com um modelo simulado e pode encaminhar chamadas para uma conta da OpenAI Platform configurada por API key. Ele não distribui sessões OAuth pessoais nem tenta contornar limites do provedor.

## Recursos

- API compatível com o formato básico de `POST /v1/chat/completions`.
- API keys individuais armazenadas somente como SHA-256.
- Cota móvel primária de 5 horas e secundária de 7 dias.
- Unidades ponderadas: entrada + saída × 4.
- Rate limit por usuário.
- SQLite com ledger de consumo e auditoria.
- Dashboard administrativo em `/`.
- Backend `mock` pronto para testes sem custo.
- Backend `openai` para uso autorizado da OpenAI Platform.
- Backend local `codex`, que reutiliza o login OAuth oficial do Codex CLI.
- Docker Compose com bind somente em `127.0.0.1`.

## Início rápido

```powershell
Copy-Item .env.example .env
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload
```

Abra `http://127.0.0.1:8000`.

Em `localhost`, o painel administrativo não pede chave por padrão. Ele mostra o estado da conta autenticada pelo `codex login`. A chave administrativa continua obrigatória quando o cliente não é loopback. Controle isso com `AIWRAPPER_LOCAL_ADMIN_NO_KEY`.

Crie um usuário:

```powershell
$headers = @{ Authorization = "Bearer dev-admin-key" }
$body = @{ name = "ilan"; primary_limit = 100000; secondary_limit = 500000; rpm = 30 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/admin/users -Headers $headers -ContentType application/json -Body $body
```

Guarde a `api_key`: ela é retornada somente na criação.

Faça uma chamada:

```powershell
$headers = @{ Authorization = "Bearer aiw_SUA_CHAVE" }
$body = @{ model = "lab-model"; messages = @(@{ role = "user"; content = "Olá" }) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/v1/chat/completions -Headers $headers -ContentType application/json -Body $body
```

Consulte a cota:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/v1/me/usage -Headers $headers
```

## Backend OpenAI Platform

No `.env`:

```dotenv
AIWRAPPER_BACKEND=openai
AIWRAPPER_UPSTREAM_API_KEY=sk-...
AIWRAPPER_UPSTREAM_BASE_URL=https://api.openai.com/v1
```

O gateway utiliza uma credencial de serviço no servidor. Nunca entregue essa credencial aos clientes. Para produção, use um cofre de segredos, TLS, PostgreSQL e um proxy reverso.

## Backend Codex com OAuth do ChatGPT

Autentique o CLI oficial uma vez:

```powershell
codex login
codex login status
```

Depois configure o `.env`:

```dotenv
AIWRAPPER_BACKEND=codex
AIWRAPPER_CODEX_PATH=codex
AIWRAPPER_CODEX_MODEL=
AIWRAPPER_CODEX_WORKDIR=C:\Users\ilan.wendling\claude\AIWrapper
AIWRAPPER_CODEX_TIMEOUT=300
```

Reinicie o servidor. Cada chamada será executada com `codex exec --json --ephemeral --sandbox read-only`. A sessão OAuth permanece no armazenamento oficial do Codex e nunca é retornada pela API.

Verifique a integração com a chave administrativa:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/admin/codex/status -Headers @{ Authorization = "Bearer dev-admin-key" }
```

Mantenha o serviço ligado somente ao loopback. Esse backend usa a conta ChatGPT autenticada no computador e deve ser tratado como laboratório local de proprietário único.

## Endpoints

| Método | Caminho | Autenticação | Função |
|---|---|---|---|
| GET | `/health` | nenhuma | Saúde e backend ativo |
| POST | `/admin/users` | chave admin | Cria usuário e chave |
| GET | `/admin/users` | chave admin | Usuários e consumo |
| GET | `/admin/codex/status` | chave admin | Estado do login oficial do Codex |
| GET | `/v1/models` | chave de usuário | Modelos disponíveis |
| POST | `/v1/chat/completions` | chave de usuário | Executa uma solicitação |
| GET | `/v1/me/usage` | chave de usuário | Cota do usuário atual |

## Modelo de cota

As duas janelas são independentes. Uma solicitação é bloqueada quando qualquer janela se esgota. O reset informado é uma aproximação conservadora do início da janela móvel; o ledger continua sendo a fonte de verdade.

```text
weighted_units = input_tokens + output_tokens * 4
```

No backend simulado, tokens são estimados por comprimento. No backend OpenAI, são usados os números retornados pelo upstream.

## Testes

```powershell
python -m pytest -q
```

## Referências

Os repositórios estudados ficam em `references/` e são ignorados pelo Git do projeto. Consulte [THIRD_PARTY.md](THIRD_PARTY.md). Nenhum código deles foi incorporado diretamente nesta implementação inicial.
