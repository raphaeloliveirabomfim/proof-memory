// CLI de demonstracao do ProofMemory.
//   npm run demo -- decide "preciso de acesso admin ao banco de producao por 24h"
//   npm run demo -- list
//   npm run demo -- verify
//   npm run demo -- tamper <seq>   (adultera um registro para demonstrar a deteccao)
import { closePool, pool } from "../memory/db.js";
import { listDecisions, verifyChain } from "../memory/store.js";
import { handleRequest } from "../agent/agent.js";
import { getProvider } from "../agent/provider.js";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

function actionColor(a: string): string {
  if (a === "approve") return C.green;
  if (a === "deny") return C.red;
  return C.yellow;
}

async function cmdDecide(request: string) {
  if (!request) throw new Error('uso: decide "<texto do pedido>"');
  const provider = getProvider();
  console.log(`${C.dim}provider: ${provider.name}${C.reset}`);
  console.log(`${C.bold}Pedido:${C.reset} ${request}\n`);

  const res = await handleRequest(request, { provider });

  console.log(`${C.dim}Casos parecidos recuperados da memoria:${C.reset}`);
  if (res.similarCases.length === 0) {
    console.log("  (memoria vazia — primeira decisao)");
  } else {
    for (const c of res.similarCases) {
      console.log(
        `  ${C.dim}seq=${c.seq} dist=${c.distance.toFixed(3)}${C.reset} ${actionColor(c.action)}${c.action}${C.reset} :: ${c.request_context.slice(0, 60)}`,
      );
    }
  }
  console.log(`\n${C.dim}Cadeia verificada antes de decidir: ${res.chainVerifiedBefore ? C.green + "OK" : C.red + "FALHA"}${C.reset}`);

  const d = res.decision;
  console.log(`\n${C.bold}Decisao:${C.reset} ${actionColor(d.action)}${C.bold}${d.action.toUpperCase()}${C.reset}`);
  console.log(`${C.bold}Racional:${C.reset} ${d.rationale}`);
  console.log(`\n${C.cyan}recibo de memoria (decision_id): ${d.decision_id}${C.reset}`);
  console.log(`${C.dim}seq=${d.seq} hash=${d.hash.slice(0, 16)}... prev=${d.prev_hash.slice(0, 16)}...${C.reset}`);
}

async function cmdList() {
  const rows = await listDecisions(20);
  if (rows.length === 0) {
    console.log("Memoria vazia. Rode 'npm run seed' ou 'npm run demo -- decide ...'.");
    return;
  }
  console.log(`${C.bold}Ultimas ${rows.length} decisoes (mais recente primeiro):${C.reset}\n`);
  for (const r of rows) {
    console.log(
      `${C.dim}seq=${String(r.seq).padStart(3)}${C.reset} ${actionColor(r.action)}${r.action.padEnd(8)}${C.reset} ${C.dim}${new Date(r.created_at).toISOString().slice(0, 19)}${C.reset}`,
    );
    console.log(`     ${r.request_context.slice(0, 72)}`);
    console.log(`     ${C.dim}hash=${r.hash.slice(0, 20)}... prev=${r.prev_hash.slice(0, 20)}...${C.reset}`);
  }
}

async function cmdVerify() {
  process.stdout.write("Verificando integridade da cadeia de memoria... ");
  const v = await verifyChain();
  if (v.ok) {
    console.log(`${C.green}${C.bold}INTEGRA${C.reset} (${v.count} registros, nenhum adulterado)`);
  } else {
    console.log(`${C.red}${C.bold}COMPROMETIDA${C.reset}`);
    console.log(`  quebrou em seq=${v.brokenAt?.seq}: ${v.brokenAt?.reason}`);
    process.exitCode = 1;
  }
}

// Ferramenta de demonstracao: adultera um registro por fora do agente, para
// mostrar que a verificacao detecta. NAO faz parte do caminho normal.
async function cmdTamper(seqArg: string) {
  const seq = Number(seqArg);
  if (!Number.isInteger(seq)) throw new Error("uso: tamper <seq>");
  const r = await pool.query(
    "UPDATE decisions SET rationale = rationale || ' [ADULTERADO]' WHERE seq = $1 RETURNING seq",
    [seq],
  );
  if (r.rowCount === 0) {
    console.log(`Nenhum registro com seq=${seq}.`);
    return;
  }
  console.log(`${C.yellow}Registro seq=${seq} adulterado direto no banco (fora do agente).${C.reset}`);
  console.log("Rode 'npm run verify' para ver a deteccao.");
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = rest.join(" ");
  switch (cmd) {
    case "decide": await cmdDecide(arg); break;
    case "list": await cmdList(); break;
    case "verify": await cmdVerify(); break;
    case "tamper": await cmdTamper(arg); break;
    default:
      console.log("Comandos: decide \"<pedido>\" | list | verify | tamper <seq>");
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(`${C.red}Erro:${C.reset}`, err.message);
    await closePool();
    process.exit(1);
  });
