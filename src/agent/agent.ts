import { recallSimilar, appendDecision, verifyChain, type RecallHit, type DecisionRow } from "../memory/store.js";
import { getProvider, type AgentProvider } from "./provider.js";
import { POLICY_VERSION } from "./policy.js";

export interface AgentResult {
  decision: DecisionRow;
  similarCases: RecallHit[];
  chainVerifiedBefore: boolean;
  provider: string;
}

// Loop do agente para um pedido de acesso:
//  1. embedding do contexto do pedido
//  2. recall das decisoes passadas mais parecidas (busca vetorial)
//  3. verificacao da integridade da cadeia ANTES de confiar na memoria recuperada
//  4. raciocinio (com pedido + casos parecidos + politica)
//  5. commit da decisao como novo elo da cadeia
export async function handleRequest(
  request: string,
  opts: { provider?: AgentProvider; k?: number } = {},
): Promise<AgentResult> {
  const provider = opts.provider ?? getProvider();
  const k = opts.k ?? 3;

  // 1. embedding
  const embedding = await provider.embed(request);

  // 2. recall por similaridade
  const similarCases = await recallSimilar(embedding, k);

  // 3. verificar integridade da cadeia antes de usar a memoria
  const verify = await verifyChain();
  if (!verify.ok) {
    throw new Error(
      `Cadeia de memoria comprometida (seq=${verify.brokenAt?.seq}: ${verify.brokenAt?.reason}). Abortando decisao.`,
    );
  }

  // 4. raciocinio
  const { action, rationale } = await provider.decide({ request, similarCases });

  // 5. commit
  const decision = await appendDecision({
    request_context: request,
    embedding,
    policy_version: POLICY_VERSION,
    action,
    rationale,
  });

  return { decision, similarCases, chainVerifiedBefore: true, provider: provider.name };
}
