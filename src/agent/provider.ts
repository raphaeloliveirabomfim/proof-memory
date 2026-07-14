import { EMBED_DIM } from "../memory/config.js";
import type { RecallHit } from "../memory/store.js";
import type { Action } from "./policy.js";
import { POLICY_TEXT } from "./policy.js";

export interface DecideInput {
  request: string;
  similarCases: RecallHit[];
}

export interface Decision {
  action: Action;
  rationale: string;
}

// Abstracao do "cerebro" do agente: embeddings + raciocinio.
// Duas implementacoes: Bedrock (producao) e Mock (offline, sem AWS).
export interface AgentProvider {
  readonly name: string;
  embed(text: string): Promise<number[]>;
  decide(input: DecideInput): Promise<Decision>;
}

// ---------------------------------------------------------------------------
// Provider Bedrock (real) — Titan Embeddings + Claude.
// ---------------------------------------------------------------------------
export class BedrockProvider implements AgentProvider {
  readonly name = "bedrock";

  async embed(text: string): Promise<number[]> {
    const { embedText } = await import("../aws/bedrock.js");
    return embedText(text);
  }

  async decide(input: DecideInput): Promise<Decision> {
    const { reasonText } = await import("../aws/bedrock.js");
    const system = `Voce e um agente de governanca de acesso. Decida entre approve, deny ou escalate.\n\n${POLICY_TEXT}\n\nResponda SOMENTE com JSON: {"action": "approve|deny|escalate", "rationale": "..."}`;
    const cases = input.similarCases.length
      ? input.similarCases
          .map(
            (c, i) =>
              `${i + 1}. (dist=${c.distance.toFixed(3)}) pedido: "${c.request_context}" -> ${c.action}: ${c.rationale}`,
          )
          .join("\n")
      : "(nenhum caso parecido no historico)";
    const user = `Pedido novo: "${input.request}"\n\nCasos parecidos do historico (memoria do agente):\n${cases}\n\nDecida a acao e o racional.`;
    const raw = await reasonText(system, user);
    return parseDecision(raw);
  }
}

function parseDecision(raw: string): Decision {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      const action = obj.action as Action;
      if (action === "approve" || action === "deny" || action === "escalate") {
        return { action, rationale: String(obj.rationale ?? "").trim() };
      }
    } catch {
      /* cai no fallback abaixo */
    }
  }
  // Fallback conservador se o modelo nao retornar JSON valido.
  return { action: "escalate", rationale: `resposta nao estruturada do modelo: ${raw.slice(0, 200)}` };
}

// ---------------------------------------------------------------------------
// Provider Mock (offline) — sem AWS. Embedding por feature-hashing (similaridade
// lexical real) e raciocinio por regras da politica + consistencia com o passado.
// Serve para rodar a demo inteira sem Bedrock; troque por bedrock quando a AWS
// estiver ativa (PROVIDER=bedrock).
// ---------------------------------------------------------------------------
export class MockProvider implements AgentProvider {
  readonly name = "mock";

  async embed(text: string): Promise<number[]> {
    return featureHashEmbedding(text);
  }

  async decide(input: DecideInput): Promise<Decision> {
    const t = input.request.toLowerCase();
    const isProd = /produc|production|prod\b/.test(t);
    const isRead = /leitura|read|log|consult/.test(t);
    const isAdminPerm = /admin|permanente|permanent|root|irrestrit/.test(t);
    const isStagingDev = /staging|dev\b|desenvolv|homolog/.test(t);
    const isTemporary = /24h|1h|tempor|janela|horas|por \d+/.test(t);

    // Consistencia: se ha um caso quase identico, siga a mesma acao (regra 5).
    const near = input.similarCases[0];
    if (near && near.distance < 0.15) {
      return {
        action: near.action,
        rationale: `consistente com decisao passada quase identica (seq=${near.seq}, dist=${near.distance.toFixed(3)}): ${near.rationale}`,
      };
    }

    if (isProd && isAdminPerm) {
      return { action: "deny", rationale: "acesso admin/permanente a producao viola menor privilegio (regra 2)" };
    }
    if (isProd && (isTemporary || !isRead)) {
      return { action: "escalate", rationale: "acesso privilegiado/temporario a producao exige aprovacao humana (regras 1 e 4)" };
    }
    if (isStagingDev && isRead) {
      return { action: "approve", rationale: "leitura temporaria em staging/dev e baixo risco (regra 3)" };
    }
    return { action: "escalate", rationale: "pedido fora dos casos claros da politica; escalado por precaucao" };
  }
}

// Embedding deterministico por feature-hashing de tokens (palavras + bigramas).
// Textos parecidos compartilham tokens -> vetores proximos. Nao e semantico como
// o Titan, mas da similaridade lexical suficiente para demonstrar o recall offline.
export function featureHashEmbedding(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const h = hash32(tok);
    const idx = h % EMBED_DIM;
    const sign = (h & 1) === 0 ? 1 : -1;
    v[idx] += sign;
  }
  // L2-normaliza para que a distancia dependa da direcao, nao do tamanho do texto.
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const grams: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) grams.push(`${words[i]}_${words[i + 1]}`);
  return grams;
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Fabrica: escolhe o provider por env. Default = mock (roda sem AWS).
export function getProvider(): AgentProvider {
  const kind = (process.env.PROVIDER ?? "mock").toLowerCase();
  return kind === "bedrock" ? new BedrockProvider() : new MockProvider();
}
