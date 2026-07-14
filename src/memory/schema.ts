import { pool, closePool } from "./db.js";
import { EMBED_DIM } from "./config.js";

const DDL: { label: string; sql: string }[] = [
  {
    label: "tabela decisions",
    sql: `
      CREATE TABLE IF NOT EXISTS decisions (
        seq             INT8        NOT NULL,
        decision_id     UUID        NOT NULL DEFAULT gen_random_uuid(),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        request_context STRING      NOT NULL,
        embedding       VECTOR(${EMBED_DIM}) NOT NULL,
        policy_version  STRING      NOT NULL,
        action          STRING      NOT NULL,
        rationale       STRING      NOT NULL,
        prev_hash       STRING      NOT NULL,
        hash            STRING      NOT NULL,
        CONSTRAINT pk_decisions PRIMARY KEY (seq),
        CONSTRAINT uq_decision_id UNIQUE (decision_id),
        CONSTRAINT uq_hash UNIQUE (hash),
        CONSTRAINT ck_action CHECK (action IN ('approve', 'deny', 'escalate'))
      )`,
  },
  {
    label: "indice vetorial (Distributed Vector Indexing)",
    sql: `CREATE VECTOR INDEX IF NOT EXISTS idx_decisions_embedding ON decisions (embedding)`,
  },
];

async function main() {
  for (const stmt of DDL) {
    process.stdout.write(`  aplicando: ${stmt.label} ... `);
    await pool.query(stmt.sql);
    console.log("ok");
  }

  const { rows } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'decisions' ORDER BY ordinal_position`,
  );
  console.log("\nSchema 'decisions':");
  for (const c of rows) console.log(`  ${c.column_name}: ${c.data_type}`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error("\nFalha ao aplicar schema:", err.message);
    await closePool();
    process.exit(1);
  });
