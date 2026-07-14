// Popula a memoria do agente com casos historicos, para que ele ja tenha
// precedentes desde o inicio (recall vetorial + consistencia).
// Usa o provider ativo (mock por padrao; bedrock se PROVIDER=bedrock).
import { pool, closePool } from "../src/memory/db.js";
import { appendDecision } from "../src/memory/store.js";
import { getProvider } from "../src/agent/provider.js";
import { POLICY_VERSION, type Action } from "../src/agent/policy.js";

const CASES: { request: string; action: Action; rationale: string }[] = [
  {
    request: "preciso de acesso de leitura aos logs de staging por 1 hora para investigar um bug",
    action: "approve",
    rationale: "leitura temporaria em staging e baixo risco (regra 3)",
  },
  {
    request: "quero acesso admin permanente ao cluster de producao",
    action: "deny",
    rationale: "acesso admin permanente a producao viola menor privilegio (regra 2)",
  },
  {
    request: "acesso elevado de escrita ao banco de producao por 24h para resolver um incidente critico",
    action: "escalate",
    rationale: "acesso temporario privilegiado a producao para incidente exige aprovacao humana (regra 4)",
  },
  {
    request: "acesso de leitura ao dashboard de metricas de desenvolvimento",
    action: "approve",
    rationale: "leitura em ambiente de desenvolvimento e baixo risco (regra 3)",
  },
  {
    request: "conceder role de superusuario no banco de producao de forma permanente",
    action: "deny",
    rationale: "superusuario permanente em producao viola menor privilegio (regra 2)",
  },
  {
    request: "acesso root temporario ao servidor de producao por 2 horas durante janela de manutencao",
    action: "escalate",
    rationale: "acesso root a producao, mesmo temporario, exige aprovacao humana (regras 1 e 4)",
  },
];

async function main() {
  const provider = getProvider();
  console.log(`Seed usando provider: ${provider.name}`);
  const existing = await pool.query("SELECT count(*)::INT AS n FROM decisions");
  if (existing.rows[0].n > 0) {
    console.log(`Ja existem ${existing.rows[0].n} decisoes. Limpando antes de semear...`);
    await pool.query("DELETE FROM decisions");
  }

  for (const c of CASES) {
    const embedding = await provider.embed(c.request);
    const row = await appendDecision({
      request_context: c.request,
      embedding,
      policy_version: POLICY_VERSION,
      action: c.action,
      rationale: c.rationale,
    });
    console.log(`  seq=${row.seq} ${row.action.padEnd(8)} :: ${c.request.slice(0, 56)}`);
  }
  console.log(`\n${CASES.length} casos historicos gravados.`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error("Erro no seed:", err.message);
    await closePool();
    process.exit(1);
  });
