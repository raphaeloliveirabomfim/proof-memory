import "dotenv/config";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { EMBED_DIM } from "../memory/config.js";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const EMBED_MODEL_ID =
  process.env.BEDROCK_EMBED_MODEL_ID ?? "amazon.titan-embed-text-v2:0";
const REASONING_MODEL_ID =
  process.env.BEDROCK_REASONING_MODEL_ID ??
  "us.anthropic.claude-sonnet-4-20250514-v1:0";

let _client: BedrockRuntimeClient | null = null;
function client(): BedrockRuntimeClient {
  if (!_client) _client = new BedrockRuntimeClient({ region: REGION });
  return _client;
}

// Amazon Titan Embeddings v2 — gera o vetor de contexto do pedido.
export async function embedText(text: string): Promise<number[]> {
  const body = JSON.stringify({
    inputText: text,
    dimensions: EMBED_DIM,
    normalize: true,
  });
  const res = await client().send(
    new InvokeModelCommand({
      modelId: EMBED_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body,
    }),
  );
  const parsed = JSON.parse(new TextDecoder().decode(res.body)) as {
    embedding: number[];
  };
  return parsed.embedding;
}

// Claude via Bedrock (Converse API) — raciocina a acao a partir do pedido,
// dos casos parecidos recuperados e da politica aplicavel. Retorna texto bruto.
export async function reasonText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages: Message[] = [
    { role: "user", content: [{ text: userPrompt }] },
  ];
  const res = await client().send(
    new ConverseCommand({
      modelId: REASONING_MODEL_ID,
      system: [{ text: systemPrompt }],
      messages,
      inferenceConfig: { maxTokens: 512, temperature: 0 },
    }),
  );
  const block = res.output?.message?.content?.[0];
  return block && "text" in block ? (block.text ?? "") : "";
}
