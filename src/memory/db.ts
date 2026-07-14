import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL nao definida — copie .env.example para .env e preencha.");
}

// CockroachDB Cloud Serverless usa certificado de CA publica (sslmode=verify-full),
// entao o pool nativo do Node valida contra as CAs do sistema sem arquivo de CA extra.
export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: true },
  max: 5,
});

export async function closePool(): Promise<void> {
  await pool.end();
}
