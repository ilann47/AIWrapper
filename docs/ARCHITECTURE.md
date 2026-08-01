# Arquitetura

```text
Cliente A -- aiw_key_A --+
                         +--> FastAPI --> quota guard --> backend mock/OpenAI
Cliente B -- aiw_key_B --+       |
                                 +--> SQLite: users, usage, audit
                                 +--> dashboard administrativo
```

## Fronteiras

1. A chave administrativa gerencia usuários e consulta todos os saldos.
2. Cada usuário recebe uma chave aleatória; somente o hash é persistido.
3. A autorização consulta cota e RPM antes do backend.
4. O consumo confirmado é gravado após uma resposta bem-sucedida.
5. O backend não recebe a identidade ou a chave do cliente.

## Próximas extensões

- Streaming SSE com contabilização no bloco `finally`.
- Rotação e revogação de chaves.
- Reserva transacional de unidades para concorrência estrita.
- PostgreSQL e migrations.
- Prometheus/OpenTelemetry.
- Políticas por modelo e orçamento monetário.
- Adaptador read-only para métricas do `codex app-server` de uma conta própria.

