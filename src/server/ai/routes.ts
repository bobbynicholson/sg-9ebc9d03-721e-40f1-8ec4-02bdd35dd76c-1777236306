/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The AI routing the server actually uses, for /admin/platform/tech-costs.
 *
 * Built from the same functions and env variables the AI helpers read
 * (src/lib/ai/textLlm.ts, src/server/chatbot/brain.ts), so the page shows
 * the real provider order and models in each environment, plus which
 * provider keys are set. Never exposes key values.
 *
 * Also fetches OpenRouter's public price list (cached for 6 hours) so the
 * page can show today's OpenRouter prices next to the ones in
 * src/lib/techCosts/model.ts.
 */
import { textModel, visionModels } from "@/lib/ai/textLlm";
import { describeChatRoute, describeEmbeddingRoute } from "@/server/chatbot/brain";
import type { LivePrices } from "@/lib/techCosts/model";

export type { LivePrices };

export interface AiRouteStep {
  provider: string;
  model: string;
  configured: boolean;
  /** Retry on the same provider when the first read finds nothing (receipts). */
  retryModel?: string;
}

export interface AiRoute {
  feature: string;
  steps: AiRouteStep[];
  note?: string;
}

const has = (env: string) => !!process.env[env];

export function describeAiRoutes(): AiRoute[] {
  const textChain = (tier: "default" | "smart"): AiRouteStep[] => [
    { provider: "openrouter", model: textModel("openrouter", tier), configured: has("OPENROUTER_API_KEY") },
    { provider: "groq", model: textModel("groq", tier), configured: has("GROQ_API_KEY") },
    { provider: "openai", model: textModel("openai", tier), configured: has("OPENAI_API_KEY") },
    { provider: "anthropic", model: textModel("anthropic", tier), configured: has("ANTHROPIC_API_KEY") },
  ];
  const visionChain = (anthropicModel: string): AiRouteStep[] => {
    const or = visionModels("openrouter");
    const oa = visionModels("openai");
    const gq = visionModels("groq");
    return [
      { provider: "openrouter", model: or.primary, retryModel: or.fallback !== or.primary ? or.fallback : undefined, configured: has("OPENROUTER_API_KEY") },
      { provider: "openai", model: oa.primary, retryModel: oa.fallback !== oa.primary ? oa.fallback : undefined, configured: has("OPENAI_API_KEY") },
      { provider: "groq", model: gq.primary, retryModel: gq.fallback !== gq.primary ? gq.fallback : undefined, configured: has("GROQ_API_KEY") },
      { provider: "anthropic", model: anthropicModel, configured: has("ANTHROPIC_API_KEY") },
    ];
  };
  const chat = describeChatRoute();
  const embedding = describeEmbeddingRoute();

  return [
    { feature: "chat_reply", steps: chat },
    {
      feature: "chat_intent",
      steps: [{ provider: "openai", model: process.env.OPENAI_INTENT_MODEL || "gpt-4o-mini", configured: has("OPENAI_API_KEY") }],
      note: "Without an OpenAI key, questions are routed by local rules at no cost.",
    },
    { feature: "embeddings", steps: [{ provider: embedding.provider, model: embedding.model, configured: embedding.configured }] },
    { feature: "knowledge_review", steps: chat },
    { feature: "column_matching", steps: textChain("smart") },
    { feature: "import_row_repair", steps: textChain("default") },
    { feature: "receipt_scan", steps: visionChain(process.env.ANTHROPIC_RECEIPT_MODEL || "claude-haiku-4-5") },
    {
      feature: "eft_proof",
      steps: visionChain(process.env.ANTHROPIC_EFT_PROOF_MODEL || "claude-haiku-4-5"),
      note: "PDF proofs can only be read by Claude; without an Anthropic key they go to a person to check.",
    },
    { feature: "blog_draft", steps: textChain("default") },
    { feature: "brand_palette", steps: textChain("default") },
  ];
}

// ─── OpenRouter live prices ────────────────────────────────────────────

let cache: { at: number; prices: LivePrices } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000;

/** OpenRouter's current per-model prices (US$ per 1M tokens), keyed by model id. Empty on failure. */
export async function getOpenRouterLivePrices(): Promise<{ prices: LivePrices; fetched_at: string | null }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return { prices: cache.prices, fetched_at: new Date(cache.at).toISOString() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: controller.signal });
    if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
    const json: any = await res.json();
    const prices: LivePrices = {};
    for (const m of Array.isArray(json?.data) ? json.data : []) {
      const input = Number(m?.pricing?.prompt);
      const output = Number(m?.pricing?.completion);
      if (m?.id && Number.isFinite(input) && Number.isFinite(output)) {
        prices[String(m.id)] = { input_usd_per_m: +(input * 1_000_000).toFixed(6), output_usd_per_m: +(output * 1_000_000).toFixed(6) };
      }
    }
    cache = { at: Date.now(), prices };
    return { prices, fetched_at: new Date(cache.at).toISOString() };
  } catch {
    return cache ? { prices: cache.prices, fetched_at: new Date(cache.at).toISOString() } : { prices: {}, fetched_at: null };
  } finally {
    clearTimeout(timer);
  }
}
