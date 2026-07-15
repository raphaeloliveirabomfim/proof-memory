# ProofMemory
### Memória de agente como evidência, não como cache
**CockroachDB × AWS Hackathon — Build with Agentic Memory**

Status: em desenvolvimento para submissão no CockroachDB × AWS Hackathon (prazo 18 de agosto de 2026).

---

## Tese

A maioria dos projetos de "memória de agente" resolve um problema estreito: lembrar o que
foi dito antes. Isso é recall, não memória de produção. Um agente que toma decisões reais
(aprovar, negar, escalar) precisa de outra coisa: um registro da decisão que seja ao mesmo
tempo recuperável por semelhança (memória semântica) e verificável quanto à integridade
(memória à prova de adulteração). O ProofMemory trata a memória do agente como evidência:
cada decisão vira um registro encadeado criptograficamente no CockroachDB, recuperável por
busca vetorial e auditável a qualquer momento.

Isso responde diretamente ao critério de julgamento do hackathon ("a memória não é
acessório, é o que torna o agente útil em produção") com algo que vai além de consulta
trivial: o CockroachDB não guarda só embeddings, guarda a cadeia de decisões do agente,
distribuída e sempre disponível.

## O problema que o agente resolve

Um agente de suporte a acesso interno (help desk / concessão de permissão) recebe pedidos
do tipo "preciso de acesso elevado ao banco de produção por 24 horas". Ele precisa decidir
aprovar, negar ou escalar, de forma consistente com decisões anteriores parecidas, e deixar
um rastro que qualquer auditor consiga verificar depois sem confiar na palavra do agente.

Esse domínio é deliberadamente genérico, mas espelha um padrão real de governança de
decisão em sistemas de produção: manter consistência com o histórico e deixar rastro
verificável.

## Arquitetura

```
Pedido do usuário
      │
      ▼
[1] Embedding do contexto do pedido (Bedrock Titan Embeddings)
      │
      ▼
[2] Busca por semelhança no CockroachDB (Distributed Vector Indexing)
      │   → top-K decisões parecidas do passado
      ▼
[3] Verificação de integridade da cadeia (hash-chain) dos registros recuperados
      │
      ▼
[4] Raciocínio do agente (Amazon Bedrock, modelo Claude)
      │   → contexto do pedido + casos parecidos + política aplicável
      ▼
[5] Decisão (aprovar / negar / escalar)
      │
      ▼
[6] Commit no CockroachDB:
      decision_id (UUID) · timestamp · embedding · policy_version ·
      ação · racional resumido · prev_hash · hash = sha256(prev_hash + conteúdo)
      │
      ▼
[7] Resposta ao usuário + decision_id (o "recibo de memória")
```

Uma CLI de demonstração mostra as últimas decisões e permite rodar "verificar memória",
que percorre a cadeia de hashes e confirma que nada foi alterado.

## Ferramentas exigidas e como são usadas

**CockroachDB (mínimo 2 exigidas, projeto usa 3):**

- **Managed MCP Server** — o agente se conecta ao cluster diretamente via MCP, para leitura
  e escrita dos registros de decisão. Configurado em [`.mcp.json`](.mcp.json); detalhes em
  [`docs/mcp-server.md`](docs/mcp-server.md).
- **Distributed Vector Indexing** — guarda o embedding de cada decisão (`VECTOR(1024)` com
  índice `vector_l2_ops`) e permite buscar as decisões mais parecidas com o pedido atual.
- **ccloud CLI** — provisionamento do cluster e configuração de rede feitos via CLI,
  agent-ready.

**AWS (mínimo 1 exigida, projeto usa 1):**

- **Amazon Bedrock** — Claude como modelo de raciocínio para decidir a ação, e Titan
  Embeddings para gerar os vetores de contexto.

## Estrutura do repositório

```
proof-memory/
├── README.md
├── LICENSE                      (MIT)
├── .mcp.json                    Managed MCP Server (project-scoped, OAuth)
├── .env.example
├── package.json
├── docs/
│   ├── adr/
│   │   └── adr-001-memory-design.md    decisão de design da camada de memória
│   └── mcp-server.md                   configuração e auth do Managed MCP Server
├── src/
│   ├── agent/                   loop do agente, política, providers (Bedrock | mock)
│   ├── memory/                  schema, hash-chain, store (append/recall/verify)
│   ├── aws/                     cliente Bedrock (Titan embeddings + Claude reasoning)
│   └── demo/                    CLI: decide | list | verify | tamper
└── scripts/
    ├── seed.ts                  popula casos históricos de exemplo
    └── smoke.ts                 prova append + recall + verify + detecção de adulteração
```

Stack: TypeScript/Node (>= 20).

## Como rodar

```bash
npm install
cp .env.example .env          # preencher DATABASE_URL (e credenciais AWS, se PROVIDER=bedrock)

npm run db:ping               # testa a conexão com o cluster
npm run db:schema             # cria a tabela decisions + índice vetorial
npm run seed                  # popula 6 casos históricos
npm run demo -- decide "preciso de acesso admin ao banco de producao por 24h"
npm run demo -- list
npm run verify                # percorre a cadeia e confirma a integridade
```

O provider padrão é `mock`: embeddings por feature-hashing e raciocínio por regras, o que
permite rodar a demo inteira sem AWS. Com `PROVIDER=bedrock` no `.env`, o agente usa Titan
Embeddings e Claude via Bedrock.

### Demonstração de tamper-evidence

```bash
npm run demo -- tamper 3      # altera um registro direto no banco, por fora do agente
npm run verify                # detecta: cadeia COMPROMETIDA, quebrou em seq=3
```

O embedding entra no hash na forma canônica em que o banco o devolve, então adulterar o
vetor — e não só o texto — também quebra a verificação.

## Como o projeto responde a cada critério de julgamento

| Critério | Como o ProofMemory responde |
|---|---|
| Agentic Memory Design | CockroachDB não é cache, é o sistema de registro da decisão do agente: semântico (vetor) e íntegro (hash-chain), distribuído e sempre disponível |
| Technical Implementation | Integração real com MCP Server, Distributed Vector Indexing e ccloud CLI, não só uma chamada de exemplo |
| Potencial de impacto | Qualquer agente que decide algo relevante (acesso, aprovação, triagem) precisa desse padrão, não é nicho |

## Roadmap de implementação

| # | Etapa | Status |
|---|---|---|
| 1 | Provisionar cluster CockroachDB, configurar MCP Server | cluster `short-possum` no ar (AWS us-east-1); MCP configurado e autenticado. Falta registrar no repo os comandos `ccloud` do provisionamento |
| 2 | Criar schema de memória (embedding + hash-chain) | feito — tabela `decisions` aplicada, com índice vetorial |
| 3 | Conectar Bedrock (Titan Embeddings + Claude) via SDK AWS | código escrito, **ainda não exercitado** contra a AWS (falta credencial) |
| 4 | Loop do agente: recall → verificação de cadeia → raciocínio → commit | feito — `src/agent/agent.ts` |
| 5 | Popular casos históricos de exemplo | feito — 6 casos semeados (com embeddings do provider `mock`; refazer ao ligar o Titan) |
| 6 | Construir a demo (CLI) | feito — `decide` / `list` / `verify` / `tamper` |
| 7 | Gravar vídeo de demonstração | pendente — pedido novo → recall de caso parecido → decisão → `verify` confirmando a integridade |
