# Provisionamento do cluster via ccloud CLI

O ProofMemory usa a **ccloud CLI** — uma das três ferramentas CockroachDB do projeto — para
provisionar e operar o cluster que guarda a memória do agente. Nada do ciclo de vida do
cluster depende da console web: criar, criar usuário SQL, obter a connection string e
inspecionar o estado são todos comandos de CLI, o que torna o caminho agent-ready
(reproduzível por um agente ou por um pipeline, sem clique humano).

Versão usada: `ccloud 0.6.12` (CCAPI 2023-04-10).

## Cluster deste projeto

Config real, conferida com `ccloud cluster info short-possum`:

| Campo | Valor |
|---|---|
| name | `short-possum` |
| id | `ef0ffa10-90bb-42dc-9284-2d0323c9ca86` |
| plan type | SERVERLESS (BASIC) |
| cloud | AWS |
| regions | `us-east-1` (primary) |
| cockroach version | v26.2.1 |
| spend limit | $0.00 (free tier) |

O `id` acima é o mesmo `mcp-cluster-id` declarado em [`.mcp.json`](../.mcp.json) — ver
[`mcp-server.md`](mcp-server.md).

## Comandos

Os comandos abaixo reproduzem este cluster do zero. Cada flag reflete a config real
verificada acima, não um exemplo genérico.

### 1. Autenticar

```bash
ccloud auth login
```

Abre o browser para o fluxo OAuth do CockroachDB Cloud e seleciona a org.

### 2. Criar o cluster

```bash
ccloud cluster create serverless short-possum us-east-1 \
  --cloud AWS \
  --spend-limit 0 \
  --wait
```

`--spend-limit 0` mantém o cluster no free tier. `--wait` bloqueia até o cluster ficar em
estado `CREATED`, o que torna o comando encadeável num script sem polling manual. Em
serverless de região única, a região informada já vira a primária (`--primary-region` só é
necessário com múltiplas regiões).

A região `us-east-1` na AWS não é arbitrária: coloca a memória do agente no mesmo provedor
e região do Amazon Bedrock usado para embeddings e raciocínio (`AWS_REGION=us-east-1`),
evitando latência entre nuvens no caminho de leitura do agente.

### 3. Criar o usuário SQL da aplicação

```bash
ccloud cluster user create short-possum proofmemory --password '<senha>'
```

A aplicação conecta como `proofmemory`, separado do usuário humano de administração. Não
versione a senha — ela entra no `DATABASE_URL` do `.env`, que é git-ignored.

### 4. Obter a connection string

```bash
ccloud cluster sql short-possum --connection-url --username proofmemory
```

O valor retornado vai para `DATABASE_URL` no `.env`. O CockroachDB Cloud Serverless usa
certificado de CA pública (`sslmode=verify-full`), então o driver `pg` valida contra as CAs
do sistema sem precisar de arquivo de CA baixado — ver [`src/memory/db.ts`](../src/memory/db.ts).

### 5. Aplicar o schema

```bash
npm run db:ping      # confirma a conexão
npm run db:schema    # cria a tabela decisions + o indice vetorial
```

## Inspeção e verificação

```bash
ccloud cluster list                      # clusters da org
ccloud cluster info short-possum         # plano, regiao, versao, spend limit
ccloud cluster user list short-possum    # usuarios SQL
ccloud cluster sql short-possum          # shell SQL interativo
```

## Referências

- Doc: <https://www.cockroachlabs.com/docs/cockroachcloud/ccloud-get-started>
