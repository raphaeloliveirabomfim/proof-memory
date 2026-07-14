import { createHash } from "node:crypto";

// Hash de genese: ancora da cadeia (primeiro registro aponta para ele).
export const GENESIS_HASH = "0".repeat(64);

// Conteudo canonico de uma decisao — a ordem e o formato SAO o contrato do hash.
// Qualquer alteracao silenciosa em qualquer campo abaixo quebra a verificacao.
export interface DecisionContent {
  seq: number;
  decision_id: string;
  request_context: string;
  policy_version: string;
  action: string;
  rationale: string;
  // Forma canonica EXATA do vetor como o CockroachDB retorna (embedding::STRING),
  // ja convertido para float32 pelo banco. Usar a mesma fonte no append e no verify
  // garante round-trip deterministico; adulterar o vetor tambem quebra a cadeia.
  embedding: string;
}

// Serializacao determinista: campos em ordem fixa.
export function canonicalize(c: DecisionContent): string {
  return [
    `seq=${c.seq}`,
    `decision_id=${c.decision_id}`,
    `request_context=${c.request_context}`,
    `policy_version=${c.policy_version}`,
    `action=${c.action}`,
    `rationale=${c.rationale}`,
    `embedding=${c.embedding}`,
  ].join("\n");
}

// hash = sha256(prev_hash + conteudo canonico)
export function computeHash(prevHash: string, content: DecisionContent): string {
  return createHash("sha256")
    .update(prevHash)
    .update("\n")
    .update(canonicalize(content))
    .digest("hex");
}
