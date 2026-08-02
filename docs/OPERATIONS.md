# Operação do laboratório

- OpenCodex: `http://127.0.0.1:8765`
- Codex-Wrapper/AIWrapper: `http://127.0.0.1:8766`
- OAuth: diretório configurado por `CODEX_CONFIG_DIR` ou perfil criado pelo codex-profiles.
- Estado exclusivo: `services/codex-wrapper/.aiwrapper/`, sempre ignorado pelo Git.
- Recuperação owner: `bootstrap-owner.key`; ao rotacionar a chave owner, o arquivo é atualizado atomicamente pela mesma operação lógica.

Antes de backup, pare o backend e copie o diretório de estado e os perfis OAuth com ACL restrita. O conteúdo de `auth.json`, chaves `aiw_` e o banco local são secretos.

Não publique as portas diretamente na internet. Use somente loopback, VPN privada ou túnel autenticado. O sistema não impede acesso direto à conta ChatGPT e não transforma uma assinatura pessoal em serviço multi-tenant oficial.

Validação operacional:

```powershell
pnpm build
pnpm test
pnpm --dir apps/opencodex-gui lint
pnpm provenance:verify
```
