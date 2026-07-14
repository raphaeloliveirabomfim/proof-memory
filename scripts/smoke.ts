// Smoke test do nucleo de memoria — sem AWS, usa vetores aleatorios.
// Prova: append encadeado, recall vetorial, verify OK, e deteccao de adulteracao.
import { pool, closePool } from "../src/memory/db.js";
import { appendDecision, recallSimilar, verifyChain } from "../src/memory/store.js";
import { EMBED_DIM } from "../src/memory/config.js";

function randVec(seed: number): number[] {
  // vetor determinista por seed, normalizado grosseiramente
  const v: number[] = [];
  let x = seed * 9301 + 49297;
  for (let i = 0; i < EMBED_DIM; i++) {
    x = (x * 9301 + 49297) % 233280;
    v.push((x / 233280) * 2 - 1);
  }
  return v;
}

async function main() {
  // limpa qualquer estado anterior do smoke test
  await pool.query("DELETE FROM decisions");

  console.log("1) Append de 3 decisoes encadeadas...");
  const base = randVec(1);
  await appendDecision({
    request_context: "acesso elevado ao banco de producao por 24h para debugar incidente",
    embedding: base,
    policy_version: "v1",
    action: "escalate",
    rationale: "acesso a producao sempre escala para aprovacao humana",
  });
  await appendDecision({
    request_context: "acesso de leitura a logs de staging por 1h",
    embedding: randVec(2),
    policy_version: "v1",
    action: "approve",
    rationale: "leitura em staging e baixo risco",
  });
  await appendDecision({
    request_context: "acesso admin permanente ao cluster de producao",
    embedding: randVec(3),
    policy_version: "v1",
    action: "deny",
    rationale: "acesso permanente admin viola politica de menor privilegio",
  });

  console.log("2) Recall vetorial (parecido com o pedido #1)...");
  const query = base.map((x) => x + (Math.random() - 0.5) * 0.01);
  const hits = await recallSimilar(query, 3);
  for (const h of hits) {
    console.log(`   seq=${h.seq} dist=${h.distance.toFixed(4)} action=${h.action} :: ${h.request_context.slice(0, 50)}`);
  }
  const topOk = hits[0]?.action === "escalate";
  console.log(`   top-1 e o caso esperado (escalate)? ${topOk ? "SIM" : "NAO"}`);

  console.log("3) Verify da cadeia (deve estar integra)...");
  const v1 = await verifyChain();
  console.log(`   ok=${v1.ok} count=${v1.count}`);

  console.log("4) Adulteracao: mudar 'deny' -> 'approve' direto no banco...");
  await pool.query("UPDATE decisions SET action = 'approve' WHERE action = 'deny'");
  const v2 = await verifyChain();
  console.log(`   ok=${v2.ok} (esperado: false)`);
  if (v2.brokenAt) console.log(`   quebrou em seq=${v2.brokenAt.seq}: ${v2.brokenAt.reason}`);

  const pass = topOk && v1.ok && !v2.ok;
  console.log(`\nRESULTADO: ${pass ? "PASS ✔" : "FAIL �’"}`);

  // limpa para nao deixar estado adulterado
  await pool.query("DELETE FROM decisions");
  if (!pass) process.exitCode = 1;
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error("Erro no smoke test:", err);
    await closePool();
    process.exit(1);
  });
