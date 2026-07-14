import { pool } from "./db.js";
import { GENESIS_HASH, computeHash } from "./chain.js";

export type Action = "approve" | "deny" | "escalate";

export interface NewDecision {
  request_context: string;
  embedding: number[];
  policy_version: string;
  action: Action;
  rationale: string;
}

export interface DecisionRow {
  seq: number;
  decision_id: string;
  created_at: string;
  request_context: string;
  policy_version: string;
  action: Action;
  rationale: string;
  prev_hash: string;
  hash: string;
}

export interface RecallHit extends DecisionRow {
  distance: number;
}

// O VECTOR do CockroachDB armazena float32. Quantizamos com Math.fround para que
// o hash calculado no append case exatamente com o vetor relido na verificacao.
function quantize(embedding: number[]): number[] {
  return embedding.map((x) => Math.fround(x));
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// Grava uma decisao como novo elo da cadeia, dentro de uma transacao serializavel:
// le o ultimo elo, insere com hash placeholder, rele o vetor ja em float32
// (embedding::STRING), calcula o hash encadeado e faz UPDATE. Ler o vetor da
// mesma fonte no append e no verify torna o round-trip deterministico.
export async function appendDecision(d: NewDecision): Promise<DecisionRow> {
  const emb = quantize(d.embedding);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const last = await client.query(
      "SELECT seq, hash FROM decisions ORDER BY seq DESC LIMIT 1",
    );
    const prevSeq = last.rows[0]?.seq ? Number(last.rows[0].seq) : 0;
    const prevHash = last.rows[0]?.hash ?? GENESIS_HASH;
    const seq = prevSeq + 1;
    const decision_id = (
      await client.query<{ id: string }>("SELECT gen_random_uuid() AS id")
    ).rows[0].id;

    // Insere com hash placeholder (unico) e le de volta o vetor canonico do banco.
    const placeholder = `pending:${decision_id}`;
    const inserted = await client.query<DecisionRow & { embedding_str: string }>(
      `INSERT INTO decisions
         (seq, decision_id, request_context, embedding, policy_version, action, rationale, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING seq, decision_id, created_at, request_context, policy_version, action, rationale, prev_hash, hash, embedding::STRING AS embedding_str`,
      [
        seq,
        decision_id,
        d.request_context,
        toVectorLiteral(emb),
        d.policy_version,
        d.action,
        d.rationale,
        prevHash,
        placeholder,
      ],
    );
    const row = inserted.rows[0];

    const hash = computeHash(prevHash, {
      seq,
      decision_id,
      request_context: d.request_context,
      policy_version: d.policy_version,
      action: d.action,
      rationale: d.rationale,
      embedding: row.embedding_str,
    });

    await client.query("UPDATE decisions SET hash = $1 WHERE seq = $2", [hash, seq]);
    await client.query("COMMIT");
    return {
      seq,
      decision_id: row.decision_id,
      created_at: row.created_at,
      request_context: row.request_context,
      policy_version: row.policy_version,
      action: row.action,
      rationale: row.rationale,
      prev_hash: row.prev_hash,
      hash,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Recupera as top-K decisoes mais parecidas por distancia L2 no indice vetorial.
export async function recallSimilar(
  embedding: number[],
  k = 3,
): Promise<RecallHit[]> {
  const vec = toVectorLiteral(quantize(embedding));
  const { rows } = await pool.query(
    `SELECT seq, decision_id, created_at, request_context, policy_version,
            action, rationale, prev_hash, hash,
            embedding <-> $1 AS distance
     FROM decisions
     ORDER BY embedding <-> $1
     LIMIT $2`,
    [vec, k],
  );
  return rows.map((r) => ({ ...r, seq: Number(r.seq), distance: Number(r.distance) }));
}

// Lista as decisoes mais recentes (para o painel/CLI).
export async function listDecisions(limit = 20): Promise<DecisionRow[]> {
  const { rows } = await pool.query(
    `SELECT seq, decision_id, created_at, request_context, policy_version,
            action, rationale, prev_hash, hash
     FROM decisions ORDER BY seq DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, seq: Number(r.seq) }));
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  brokenAt?: { seq: number; reason: string };
}

// Percorre a cadeia inteira em ordem e reprova se qualquer elo foi adulterado:
// checa o encadeamento prev_hash -> hash e recalcula o hash de cada registro.
export async function verifyChain(): Promise<VerifyResult> {
  const { rows } = await pool.query(
    `SELECT seq, decision_id, request_context, policy_version, action, rationale,
            prev_hash, hash, embedding::STRING AS embedding
     FROM decisions ORDER BY seq ASC`,
  );

  let expectedPrev = GENESIS_HASH;
  for (const r of rows) {
    const seq = Number(r.seq);
    if (r.prev_hash !== expectedPrev) {
      return {
        ok: false,
        count: rows.length,
        brokenAt: {
          seq,
          reason: `prev_hash nao encadeia (esperado ${expectedPrev.slice(0, 12)}..., achou ${String(r.prev_hash).slice(0, 12)}...)`,
        },
      };
    }
    const recomputed = computeHash(r.prev_hash, {
      seq,
      decision_id: r.decision_id,
      request_context: r.request_context,
      policy_version: r.policy_version,
      action: r.action,
      rationale: r.rationale,
      embedding: r.embedding,
    });
    if (recomputed !== r.hash) {
      return {
        ok: false,
        count: rows.length,
        brokenAt: { seq, reason: "hash recalculado nao bate (registro adulterado)" },
      };
    }
    expectedPrev = r.hash;
  }
  return { ok: true, count: rows.length };
}
