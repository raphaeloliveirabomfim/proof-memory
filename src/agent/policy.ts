// Politica de concessao de acesso aplicada pelo agente.
// A versao entra no registro de cada decisao (policy_version) para auditoria:
// permite saber sob qual regra uma decisao passada foi tomada.
export const POLICY_VERSION = "access-policy-v1";

export const POLICY_TEXT = `Politica de concessao de acesso (${POLICY_VERSION}):

1. Acesso a sistemas de PRODUCAO com privilegio elevado (admin, escrita, root)
   deve ser ESCALADO para aprovacao humana, nunca aprovado automaticamente.
2. Acesso ADMIN ou PERMANENTE a producao deve ser NEGADO por padrao
   (viola menor privilegio); so um humano pode conceder via escalonamento.
3. Acesso de LEITURA a ambientes de STAGING ou DESENVOLVIMENTO, por tempo
   limitado, e baixo risco e pode ser APROVADO.
4. Acesso TEMPORARIO (janela definida, ex: 24h) a producao para responder a
   incidente deve ser ESCALADO, com o racional do incidente registrado.
5. Consistencia: decisoes devem ser coerentes com casos passados parecidos.
   Se um caso quase identico ja foi decidido, siga a mesma acao salvo mudanca
   clara de contexto.`;

export type Action = "approve" | "deny" | "escalate";
