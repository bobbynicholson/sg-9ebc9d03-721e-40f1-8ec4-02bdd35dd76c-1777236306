/**
 * @jest-environment node
 */
import { describeAiRoutes } from "@/server/ai/routes";
import { resolvePrice } from "@/lib/techCosts/model";
import { buildAiUsageRow } from "@/lib/ai/usageLog";

const KEYS = [
  "OPENROUTER_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "LLM_PROVIDER", "EMBEDDING_PROVIDER",
  "OPENROUTER_MODEL", "OPENROUTER_TEXT_MODEL", "GROQ_TEXT_MODEL", "OPENAI_TEXT_MODEL", "GROQ_CHAT_MODEL", "OPENAI_CHAT_MODEL",
  "OPENROUTER_VISION_MODEL", "OPENROUTER_VISION_FALLBACK_MODEL", "GROQ_RECEIPT_MODEL", "OPENAI_VISION_MODEL",
  "OPENROUTER_SMART_TEXT_MODEL", "GROQ_SMART_TEXT_MODEL", "OPENAI_SMART_TEXT_MODEL", "OPENAI_INTENT_MODEL",
  "OPENROUTER_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL", "ANTHROPIC_RECEIPT_MODEL", "ANTHROPIC_EFT_PROOF_MODEL",
];
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const k of KEYS) saved[k] = process.env[k]; });
afterAll(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
function setKeys(keys: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, keys);
}
const route = (feature: string) => describeAiRoutes().find((r) => r.feature === feature)!;

describe("AI routes shown on the tech-costs page", () => {
  it("lists every AI feature", () => {
    setKeys({});
    expect(describeAiRoutes().map((r) => r.feature)).toEqual([
      "chat_reply", "chat_intent", "embeddings", "knowledge_review", "column_matching",
      "import_row_repair", "receipt_scan", "eft_proof", "blog_draft", "brand_palette",
    ]);
  });

  it("shows the real provider order and models", () => {
    setKeys({ OPENROUTER_API_KEY: "r", OPENAI_API_KEY: "o" });
    expect(route("chat_reply").steps.map((s) => [s.provider, s.model, s.configured])).toEqual([
      ["openrouter", "openai/gpt-oss-20b", true],
      ["groq", "openai/gpt-oss-20b", false],
      ["openai", "gpt-4o-mini", true],
      ["anthropic", "claude-haiku-4-5", false],
    ]);
    expect(route("column_matching").steps.map((s) => s.model)).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-120b", "gpt-4.1-mini", "claude-haiku-4-5"]);
    expect(route("receipt_scan").steps.map((s) => [s.provider, s.model, s.retryModel])).toEqual([
      ["openrouter", "meta-llama/llama-4-scout", "meta-llama/llama-4-maverick"],
      ["openai", "gpt-4.1-mini", undefined],
      ["groq", "qwen/qwen3.8-27b", undefined],
      ["anthropic", "claude-haiku-4-5", undefined],
    ]);
    expect(route("embeddings").steps[0]).toEqual({ provider: "openrouter", model: "openai/text-embedding-3-small", configured: true });
    expect(route("chat_intent").steps[0]).toMatchObject({ provider: "openai", model: "gpt-4o-mini", configured: true });
  });

  it("follows env model overrides and LLM_PROVIDER, never the key values", () => {
    setKeys({ GROQ_API_KEY: "secret-groq", LLM_PROVIDER: "groq", GROQ_CHAT_MODEL: "openai/gpt-oss-120b", GROQ_RECEIPT_MODEL: "qwen/qwen3.9-32b" });
    expect(route("chat_reply").steps[0]).toEqual({ provider: "groq", model: "openai/gpt-oss-120b", configured: true });
    expect(route("receipt_scan").steps.find((s) => s.provider === "groq")!.model).toBe("qwen/qwen3.9-32b");
    expect(JSON.stringify(describeAiRoutes())).not.toContain("secret-groq");
  });
});

describe("precise prices", () => {
  it("prefers OpenRouter's live price, else the published rate", () => {
    const live = { "openai/gpt-oss-20b": { input_usd_per_m: 0.02, output_usd_per_m: 0.1 } };
    expect(resolvePrice("openrouter", "openai/gpt-oss-20b", live)).toEqual({ input_usd_per_m: 0.02, output_usd_per_m: 0.1, source: "openrouter-live" });
    expect(resolvePrice("openrouter", "openai/gpt-oss-20b", {})).toEqual({ input_usd_per_m: 0.018, output_usd_per_m: 0.09, source: "published" });
    expect(resolvePrice("groq", "openai/gpt-oss-20b", live)).toEqual({ input_usd_per_m: 0.075, output_usd_per_m: 0.3, source: "published" });
    expect(resolvePrice("groq", "qwen/qwen3.8-27b", {})).toMatchObject({ input_usd_per_m: 0.8, output_usd_per_m: 4 });
    expect(resolvePrice("openai", "mystery-model", {}).source).toBe("unknown");
  });

  it("stores the provider's billed cost when it reports one", () => {
    const base = { feature: "chat_reply", provider: "openrouter", model: "openai/gpt-oss-20b", tokensIn: 5000, tokensOut: 600, success: true };
    expect(buildAiUsageRow({ ...base, costUsd: 0.000123456 }, {}).cost_usd).toBe(0.00012346);
    expect(buildAiUsageRow({ ...base, costUsd: null }, {}).cost_usd).toBeCloseTo((5000 * 0.018 + 600 * 0.09) / 1e6, 8);
  });
});
