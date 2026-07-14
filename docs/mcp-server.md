# Managed MCP Server do CockroachDB Cloud

O ProofMemory usa o **Managed MCP Server** do CockroachDB Cloud — uma das três
ferramentas CockroachDB do projeto. É um endpoint hospedado pela Cockroach Labs
(`https://cockroachlabs.cloud/mcp`); não há infraestrutura de MCP para subir ou
operar. Um cliente MCP (Claude Code, Cursor, VS Code) conecta via HTTP passando
o header `mcp-cluster-id` e autentica na mesma camada de auth/RBAC do Cloud.

Isso dá ao agente um caminho de leitura/escrita ao cluster via MCP, além do
driver `pg` usado pelo runtime da aplicação — e permite inspecionar/auditar a
tabela `decisions` diretamente pelo protocolo MCP.

## Configuração (project-scoped)

O arquivo [`.mcp.json`](../.mcp.json) na raiz do repositório declara o servidor
para qualquer cliente MCP que abra o projeto:

```json
{
  "mcpServers": {
    "cockroachdb-cloud": {
      "type": "http",
      "url": "https://cockroachlabs.cloud/mcp",
      "headers": {
        "mcp-cluster-id": "ef0ffa10-90bb-42dc-9284-2d0323c9ca86"
      }
    }
  }
}
```

O `mcp-cluster-id` é o ID do cluster `short-possum` (Serverless, AWS us-east-1).
A config usa **OAuth**, então não há segredo no arquivo — pode ir para o git.

## Autenticação

1. Reinicie o cliente MCP (ou aprove o servidor project-scoped quando solicitado)
   para que o `.mcp.json` seja carregado.
2. No Claude Code, rode `/mcp` e selecione `cockroachdb-cloud`.
3. O fluxo OAuth abre o browser → faça login → selecione a org **FoundLab** →
   conceda permissão de leitura/escrita (`mcp:read`, `mcp:write`).

Após isso, as ferramentas MCP do cluster ficam disponíveis (listar bancos/tabelas,
consultar schema, executar SELECT, e escrever).

### Alternativa: API key de service account

Em vez de OAuth, é possível usar uma API key de service account (papel Cluster
Admin ou Cluster Operator), adicionando o header:

```
"Authorization": "Bearer {service-account-api-key}"
```

Nesse caso, mantenha a key fora do git (via variável de ambiente / config local),
não no `.mcp.json` versionado.

## Referências

- Blog: <https://www.cockroachlabs.com/blog/cockroachdb-ai-agents-managed-mcp-server/>
- Doc: <https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server>
