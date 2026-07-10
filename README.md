# ProofMemory
### Memória de agente como evidência, não como cache
**CockroachDB × AWS Hackathon — Build with Agentic Memory**

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

Esse domínio é deliberadamente genérico (não usa nenhum dado ou cliente real), mas espelha
o tipo de problema de governança de decisão que já é familiar no dia a dia de trabalho.

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

Um pequeno painel (CLI ou página web simples) mostra as últimas decisões e permite rodar
"verificar memória", que percorre a cadeia de hashes e confirma que nada foi alterado. Isso
é o que vira o vídeo de demonstração.

## Ferramentas exigidas e como são usadas

**CockroachDB (mínimo 2 exigidas, projeto usa 3):**
- **Managed MCP Server**: o agente se conecta ao cluster CockroachDB diretamente via MCP,
-   para leitura e escrita dos registros de decisão.
-   - **Distributed Vector Indexing**: guarda o embedding de cada decisão e permite buscar as
    -   decisões mais parecidas com o pedido atual.
    -   - **ccloud CLI**: provisionamento do cluster e configuração de rede feitos via CLI, agent-ready.
     
        - **AWS (mínimo 1 exigida, projeto usa 1):**
        - - **Amazon Bedrock**: modelo de raciocínio (Claude via Bedrock) para decidir a ação, e
          -   Titan Embeddings para gerar os vetores de contexto.
         
          -   ## Estrutura do repositório
         
          -   ```
              proof-memory/
              ├── README.md                  (este plano, adaptado para leitor externo/jurado)
              ├── LICENSE                    (MIT)
              ├── docs/
              │   └── architecture.png       (diagrama da arquitetura acima)
              ├── src/
              │   ├── agent/                 orquestração do agente, chamada ao Bedrock
              │   ├── memory/                schema CockroachDB, hash-chain, queries vetoriais
              │   ├── aws/                   cliente Bedrock (embeddings + reasoning)
              │   └── demo/                  CLI/página de demonstração + comando "verificar memória"
              ├── scripts/
              │   └── seed.ts                popula alguns casos históricos de exemplo
              ├── .env.example
              └── package.json
              ```

              Stack: TypeScript/Node.

              ## Como o projeto responde a cada critério de julgamento

              | Critério | Como o ProofMemory responde |
              |---|---|
              | Agentic Memory Design | CockroachDB não é cache, é o sistema de registro da decisão do agente: semântico (vetor) e íntegro (hash-chain), distribuído e sempre disponível |
              | Technical Implementation | Integração real com MCP Server, Distributed Vector Indexing e ccloud CLI, não só uma chamada de exemplo |
              | Potencial de impacto | Qualquer agente que decide algo relevante (acesso, aprovação, triagem) precisa desse padrão, não é nicho |

              ## Plano de execução 

              1. Provisionar cluster CockroachDB via ccloud CLI, configurar MCP Server.
              2. 2. Criar schema de memória (tabela de decisões com coluna de embedding e hash-chain).
                 3. 3. Conectar Bedrock (Titan Embeddings + Claude) via SDK AWS.
                    4. 4. Implementar o loop do agente: recall → verificação de cadeia → raciocínio → commit.
                       5. 5. Popular casos históricos de exemplo (seed.ts) para o agente ter memória desde o início.
                          6. 6. Construir a demo (CLI é suficiente, página web só se sobrar tempo).
                             7. 7. Gravar vídeo de demonstração (menos de 3 minutos): mostrar um pedido novo, o agente
                                8.    recuperando um caso parecido, decidindo, e depois "verificar memória" confirmando a
                                9.   integridade da cadeia.
                                10.   8. Escrever o README final para submissão (problema, arquitetura, ferramentas usadas,
                                      9.    como rodar, link do vídeo).
                                   
                                      10.## Checklist de submissão (Devpost)

                                      - [ ] Repositório público, com licença open source (MIT)
                                      - [ ] - [ ] README completo com instruções de setup e execução
                                      - [ ] - [ ] Vídeo de demonstração (menos de 3 min, público no YouTube ou Vimeo)
                                      - [ ] - [ ] Identificar claramente quais ferramentas CockroachDB foram usadas e como
                                      - [ ] - [ ] Identificar claramente quais serviços AWS foram usados e como
                                      - [ ] - [ ] Diagrama de arquitetura (opcional)
                                      - [ ] 
