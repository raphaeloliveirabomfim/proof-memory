# ProofMemory

> Memória para agentes de IA com trilha de integridade: se alguém alterar uma lembrança antiga sem recalcular a sequência, o sistema detecta a divergência e recusa usá-la.

Bancos de memória comuns respondem apenas *"o que o agente lembra?"*. O **ProofMemory** também verifica *"essa lembrança continua igual ao que foi gravado?"*.

## 1. Qual é o problema?

Agentes de IA costumam salvar histórico de conversas, fatos e preferências como linhas comuns em um banco de dados ou índice vetorial. Sem nenhum mecanismo de verificação, qualquer bug, script ou acesso indevido ao banco pode alterar ou apagar uma memória antiga silenciosamente.

## 2. Por que isso importa?

**Quando o histórico de um agente é adulterado, suas decisões perdem confiabilidade sem deixar rastro.**

Se um agente toma decisões com base em uma memória alterada — como uma instrução modificada ou um dado falso inserido no passado —, ele age sobre uma premissa errada sem saber que os dados mudaram, e não há como auditar onde a falha começou.

## 3. O que o ProofMemory faz?

Em vez de gravar registros isolados, o sistema organiza as memórias em uma cadeia usando hashes **SHA-256** acoplada à busca semântica:

* **Encadeamento:** Cada memória salva no banco guarda seu conteúdo, seu vetor de busca e um **hash SHA-256 calculado sobre o seu próprio conteúdo combinado com o hash da memória anterior**.

* **Verificação na leitura:** Antes de devolver memórias recuperadas numa busca por semelhança, o sistema recalcula os hashes da sequência. Se alguém alterar o texto de uma memória sem recalcular a cadeia, o hash deixa de bater e o registro comprometido é descartado.

## 4. Como provar que funciona?

A prova de funcionamento será um teste automatizado que simula uma adulteração real no banco:

1. O sistema grava uma sequência de memórias encadeadas.

2. O teste executa um `UPDATE` direto no banco para alterar o texto de um registro antigo sem recalcular os hashes seguintes.

3. O agente faz uma busca por aquela informação e o sistema recusa retornar a memória alterada ao detectar a quebra na cadeia.

> **Status atual:** Em construção — os testes automatizados de adulteração entram na próxima etapa do projeto.

## 5. O que ele NÃO faz?

Para manter o escopo honesto e claro, estes são os limites atuais da arquitetura:

* **Não impede a alteração no banco:** O objetivo é tornar a adulteração detectável (*tamper-evident*), não bloquear a escrita no banco. Quem tiver acesso direto ao Postgres ainda consegue editar uma linha, mas deixa a quebra evidente na cadeia se não recalcular a cadeia.

* **Não detecta recálculo completo da cadeia:** Como o hash mais recente (a "cabeça" da cadeia) ainda fica armazenado dentro do próprio banco, se alguém alterar uma memória antiga *e* recalcular todos os hashes dali para frente, a cadeia interna volta a fechar. Para pegar esse cenário, a próxima etapa do projeto vai guardar o hash mais recente fora do banco.

* **Não é uma blockchain:** Não existe rede distribuída, consenso ou tokens. É apenas uma estrutura encadeada por hash (no mesmo princípio do histórico de commits do Git) rodando sobre um banco relacional.

## Decisões de Stack

| Peça | Escolha | Por quê | Limitações aceitas | 
| ----- | ----- | ----- | ----- | 
| **Linguagem** | TypeScript + Node 22 | Tipagem estática para modelar os registros e a lógica de validação da cadeia com segurança. | — | 
| **Banco de Dados** | Postgres via **PGlite** | Postgres real compilado para rodar embarcado no Node, sem depender de Docker ou servidor externo em dev e CI. | Aceita apenas uma conexão por vez; serve para desenvolvimento, testes e CI, mas não para produção multi-usuário. | 
| **Busca Vetorial** | `pgvector` (`@electric-sql/pglite-pgvector`) | Extensão padrão de vetores no ecossistema Postgres, mantendo compatibilidade com ambientes de produção. | — | 
| **Embeddings** | Modelo local (com Gemini como opção gratuita) | Permite rodar o projeto e o CI sem chaves de API externas ou custos. | Precisão semântica menor em relação a modelos maiores, aceitável para a prova de conceito. | 
| **Testes** | `node:test` | Runner nativo do Node.js, eliminando dependências externas de teste. | — | 
| **CI** | GitHub Actions | Automação gratuita para validar o projeto em repositório público. | — | 

## Como instalar

Instalação e testes entram na próxima etapa.