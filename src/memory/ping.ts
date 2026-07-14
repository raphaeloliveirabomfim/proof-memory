import { pool, closePool } from "./db.js";

async function main() {
  const { rows } = await pool.query(
    "SELECT version() AS version, current_database() AS db, now() AS now",
  );
  const r = rows[0];
  console.log("Conectado ao CockroachDB");
  console.log("  version:", r.version);
  console.log("  database:", r.db);
  console.log("  now:", r.now);

  // Confirma disponibilidade do tipo VECTOR (Distributed Vector Indexing)
  const vec = await pool.query("SELECT '[1,2,3]'::VECTOR(3) AS v");
  console.log("  vector support:", vec.rows[0].v);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error("Falha ao conectar:", err.message);
    await closePool();
    process.exit(1);
  });
