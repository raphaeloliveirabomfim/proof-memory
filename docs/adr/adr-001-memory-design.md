# ADR-001 · Memória de decisão como cadeia de hash + índice vetorial, não histórico de conversa simples

**Status:** accepted
**Data:** 2026-07-10
**Owner:** Raphael Oliveira Bomfim
**Frente:** Outro (Hackathons — CockroachDB × AWS, projeto ProofMemory)

## 1. Contexto

O critério de julgamento do hackathon exige que o CockroachDB tenha papel significativo e de produção como memória do agente, além de "consulta de brinquedo". A maioria das submissões de "memória de agente" usa só busca vetorial (recall semântico) ou só um histórico de conversa (log simples). É preciso decidir o desenho da camada de memória antes de começar a implementação.

## 2. Decisão

Cada decisão do agente é gravada como um registro imutável: `decision_id`, embedding (vetor do contexto) e um hash criptográfico encadeado ao registro anterior (tamper-evidence). A recuperação usa busca por similaridade vetorial para achar casos parecidos E verifica a integridade da cadeia de hash antes de usar os registros recuperados para informar a nova decisão.

## 3. Alternativas consideradas

| Alternativa | Por que foi considerada | Por que foi aceita/rejeitada |
|---|---|---|
| A — Histórico de conversa simples (log append-only, sem encadeamento, sem vetor) | Padrão mais comum em demos de agente | Rejeitada: não diferencia de qualquer cache Redis/Postgres, não passa no critério de "não é brinquedo" |
| B — Só busca vetorial, sem hash-chain | É a feature de destaque do CockroachDB (Distributed Vector Indexing) | Rejeitada sozinha: dá recall semântico mas nada impede ou detecta alteração silenciosa de um registro |
| C — Só hash-chain, sem busca vetorial | Reaproveita o padrão de recibo de evidência já validado em produção | Rejeitada sozinha: garante integridade sequencial mas não deixa o agente recuperar casos parecidos, só metade do requisito de memória |
| D (escolhida) — Hash-chain + índice vetorial juntos | Combina recall semântico com evidência de integridade, usando duas ferramentas exigidas do CockroachDB de forma real, não superficial | Aceita |

## 4. Consequências

**Positivas:** diferencia a submissão no critério "Agentic Memory Design"; reaproveita um padrão (recibo de evidência) já testado, reduzindo risco de implementação; dá um momento natural e demonstrável de "verificar memória" para o vídeo.

**Negativas / trade-offs:** mais superfície de implementação que uma abordagem de padrão único (precisa de pipeline de embedding e lógica de hash-chain) dentro de uma janela de fim de semana comprimida; a verificação de hash adiciona um passo no caminho de leitura (latência) que as regras do hackathon não exigem por si só.

## 5. Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Escopo maior que o tempo disponível (só começa segunda) | medium | Implementar hash-chain e busca vetorial sobre o mesmo caminho de escrita (uma tabela, uma escrita), não dois sistemas separados |
| Nenhuma instância real de CockroachDB provisionada ainda | medium | Primeiro passo do roadmap (já no README) é provisionar via ccloud CLI antes de qualquer outra coisa |
| Bedrock (Titan Embeddings/Claude) ainda não testado, dependência nova | low | Usar exemplos oficiais do hackathon como referência antes de integrar |

## 6. Evidência

- Issue: #8 (este), #5 (shortlist de hackathons)
- PR: ainda não existe, código começa segunda
- Documento: README do repositório `proof-memory`
- Log: n/a ainda

## Contrato de execução

**O que mudou:** decisão de design da camada de memória do agente para o hackathon CockroachDB × AWS.
**Por que mudou:** memória "de verdade" (não cache) é o critério central de julgamento; hash-chain + vetor é a combinação que atende isso com o menor número de sistemas novos.
**Qual risco reduz:** a submissão ser julgada como uso superficial ("toy query") do CockroachDB.
**Qual risco cria:** escopo de implementação maior dentro de um fim de semana livre (ver riscos acima).
**Como testar:** teste de integração que verifica que uma alteração manual num registro quebra a verificação de hash-chain, e que a busca vetorial retorna os casos corretos por similaridade.
**Como reverter:** se o prazo apertar, cair para a alternativa B (só vetor), documentando a regressão aqui mesmo, sem reescrever a decisão original.

## Incerteza declarada

**ASSUMPTION:** o free tier/trial do CockroachDB Cloud oferece Distributed Vector Indexing sem custo adicional para o escopo do hackathon.
**UNKNOWN:** latência real da verificação de hash-chain em cadeia longa, não medida ainda, sem dado de produção equivalente.
**RISK:** se o volume de casos históricos de exemplo for pequeno, a demonstração de busca vetorial pode não parecer convincente no vídeo.
**EVIDENCE:** nenhuma ainda, é decisão pré-implementação.
