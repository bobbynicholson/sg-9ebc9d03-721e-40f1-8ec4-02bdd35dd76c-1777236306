/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared OpenAI-compatible LLM access for every server-side AI feature.
 *
 * Cost policy (see /admin/platform/tech-costs):
 *   - Text tasks (client / CSV import column mapping, row repair, blog
 *     drafts, brand palettes) run on OpenAI's open-weight gpt-oss-20b.
 *     It is ~40x cheaper than Claude Haiku for the same structured-JSON
 *     work. Provider order: OpenRouter -> Groq -> OpenAI direct, with
 *     Claude Haiku as a last resort only, so a missing / failing cheap
 *     provider never breaks a feature.
 *   - Vision tasks (receipt scans, EFT proof screening) cannot use
 *     gpt-oss (text-only), so they run on Llama 4 Scout through OpenRouter,
 *     then OpenAI gpt-4.1-mini, then Groq Qwen 3.8. Anthropic is only a
 *     last-resort vision fallback.
 *
 * Every model id is env-overridable so a model swap needs no deploy.
 */

export type TextProvider = "openrouter" | "groq" | "openai" | "anthropic";
export type VisionProvider = "groq" | "openrouter" | "openai";

const OPENROUTER_BASE_URL = () => process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const GROQ_BASE_URL = () => process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Default text model on OpenRouter / Groq. */
export const GPT_OSS_20B_OPENROUTER = "openai/gpt-oss-20b";
export const GPT_OSS_20B_GROQ = "openai/gpt-oss-20b";

/**
 * Stronger open-weight model for tasks where a wrong answer costs the
 * operator real time (spreadsheet column mapping). Still one call per
 * file, so the price difference over gpt-oss-20b is a fraction of a cent.
 */
export const GPT_OSS_120B = "openai/gpt-oss-120b";

export type TextTier = "default" | "smart";

function textModel(provider: TextProvider, tier: TextTier = "default"): string {
  if (tier === "smart") {
    if (provider === "openrouter") return process.env.OPENROUTER_SMART_TEXT_MODEL || GPT_OSS_120B;
    if (provider === "groq") return process.env.GROQ_SMART_TEXT_MODEL || GPT_OSS_120B;
    if (provider === "openai") return process.env.OPENAI_SMART_TEXT_MODEL || "gpt-4.1-mini";
  }
  if (provider === "openrouter") {
    return process.env.OPENROUTER_TEXT_MODEL || process.env.OPENROUTER_MODEL || GPT_OSS_20B_OPENROUTER;
  }
  if (provider === "groq") return process.env.GROQ_TEXT_MODEL || GPT_OSS_20B_GROQ;
  if (provider === "anthropic") return process.env.ANTHROPIC_TEXT_MODEL || "claude-haiku-4-5";
  // gpt-oss is not served on OpenAI's own API; use its cheapest
  // structured-output model there.
  return process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
}

export function visionModels(provider: VisionProvider): { primary: string; fallback: string } {
  if (provider === "openrouter") {
    return {
      primary: process.env.OPENROUTER_VISION_MODEL || "meta-llama/llama-4-scout",
      fallback: process.env.OPENROUTER_VISION_FALLBACK_MODEL || "meta-llama/llama-4-maverick",
    };
  }
  if (provider === "groq") {
    // Groq shut down Llama 4 Scout (17 Jul 2026) and Maverick (9 Mar
    // 2026); Qwen 3.8 27B is its only vision model now, at US$0.80 / $4.00
    // per 1M tokens - pricier than gpt-4.1-mini, so Groq is the last
    // cheap-provider vision fallback. Same model as fallback = no retry.
    const groqVision = process.env.GROQ_RECEIPT_MODEL || "qwen/qwen3.8-27b";
    return { primary: groqVision, fallback: process.env.GROQ_RECEIPT_FALLBACK_MODEL || groqVision };
  }
  // OpenAI direct: gpt-4.1-mini bills images at normal token rates
  // (gpt-4o-mini inflates image tokens ~33x). Same model as fallback =
  // no retry on an empty read.
  const openaiVision = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
  return { primary: openaiVision, fallback: process.env.OPENAI_VISION_FALLBACK_MODEL || openaiVision };
}

export function textProviderOrder(): TextProvider[] {
  const order: TextProvider[] = [];
  if (process.env.OPENROUTER_API_KEY) order.push("openrouter");
  if (process.env.GROQ_API_KEY) order.push("groq");
  if (process.env.OPENAI_API_KEY) order.push("openai");
  // Last resort only - keeps features working on a server that has
  // nothing but the Anthropic key, without making Claude the default.
  if (process.env.ANTHROPIC_API_KEY) order.push("anthropic");
  return order;
}

export function visionProviderOrder(): VisionProvider[] {
  // Cheapest first: OpenRouter Llama 4 Scout, OpenAI gpt-4.1-mini, Groq Qwen 3.8.
  const order: VisionProvider[] = [];
  if (process.env.OPENROUTER_API_KEY) order.push("openrouter");
  if (process.env.OPENAI_API_KEY) order.push("openai");
  if (process.env.GROQ_API_KEY) order.push("groq");
  return order;
}

export function isTextAiConfigured(): boolean {
  return textProviderOrder().length > 0;
}

/** Vision works through OpenRouter / OpenAI / Groq, or Anthropic as last resort. */
export function isVisionAiConfigured(): boolean {
  return visionProviderOrder().length > 0 || !!process.env.ANTHROPIC_API_KEY;
}

export const TEXT_AI_KEYS_HINT = "set OPENROUTER_API_KEY, GROQ_API_KEY or OPENAI_API_KEY on the server";
export const VISION_AI_KEYS_HINT = "set OPENROUTER_API_KEY, OPENAI_API_KEY or GROQ_API_KEY on the server";

function endpoint(provider: Exclude<TextProvider, "anthropic"> | VisionProvider): { url: string; key: string; headers: Record<string, string> } {
  if (provider === "openrouter") {
    return {
      url: `${OPENROUTER_BASE_URL()}/chat/completions`,
      key: process.env.OPENROUTER_API_KEY || "",
      headers: {
        ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
      },
    };
  }
  if (provider === "groq") {
    return { url: `${GROQ_BASE_URL()}/chat/completions`, key: process.env.GROQ_API_KEY || "", headers: {} };
  }
  return { url: `${OPENAI_BASE_URL}/chat/completions`, key: process.env.OPENAI_API_KEY || "", headers: {} };
}

const isGptOss = (model: string) => /gpt-oss/i.test(model);

/** Strip markdown fences / surrounding prose and JSON.parse. Null when nothing parses. */
export function parseJsonLoose(text: string): any | null {
  if (!text) return null;
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* fall through to slice */ }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(t.slice(first, last + 1)); } catch { /* give up */ }
  }
  return null;
}

export class AiHttpError extends Error {
  status: number;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} API ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

export interface ChatCallResult {
  content: string;
  finishReason: string | null;
  tokens_in: number;
  tokens_out: number;
  provider: string;
  model: string;
}

/**
 * One OpenAI-compatible /chat/completions call. Adds the reasoning knob
 * gpt-oss needs (lowest effort, so the budget goes to the answer) and
 * JSON mode when asked.
 */
/** Claude Messages API call for the last-resort text path. */
async function anthropicCompletion(args: {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: any }>;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<ChatCallResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("anthropic is not configured");
  const system = args.messages.filter((m) => m.role === "system").map((m) => String(m.content)).join("\n\n");
  const messages = args.messages.filter((m) => m.role !== "system");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 25_000);
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: args.model, max_tokens: args.maxTokens, temperature: args.temperature ?? 0, system, messages }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new AiHttpError("anthropic", res.status, t || res.statusText);
    }
    const json: any = await res.json();
    const content = (Array.isArray(json?.content) ? json.content : [])
      .filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").trim();
    return {
      content,
      finishReason: json?.stop_reason === "max_tokens" ? "length" : (json?.stop_reason ?? null),
      tokens_in: json?.usage?.input_tokens ?? 0,
      tokens_out: json?.usage?.output_tokens ?? 0,
      provider: "anthropic",
      model: args.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion(args: {
  provider: TextProvider | VisionProvider;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: any }>;
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  /** gpt-oss reasoning effort; "low" unless a task needs more thought. */
  reasoningEffort?: "low" | "medium" | "high";
  /** OpenRouter: route to the highest-throughput host (someone is waiting). */
  preferFast?: boolean;
}): Promise<ChatCallResult> {
  if (args.provider === "anthropic") return anthropicCompletion(args);
  const { url, key, headers } = endpoint(args.provider);
  if (!key) throw new Error(`${args.provider} is not configured`);
  const oss = isGptOss(args.model);
  const body: Record<string, any> = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature ?? 0,
    // gpt-oss spends part of the completion budget on reasoning tokens;
    // give it headroom so the JSON answer is never cut off.
    max_tokens: oss ? args.maxTokens + ((args.reasoningEffort ?? "low") === "low" ? 1024 : 4096) : args.maxTokens,
  };
  if (args.json) body.response_format = { type: "json_object" };
  if (oss && args.provider === "openrouter") {
    body.reasoning = { effort: args.reasoningEffort ?? "low", exclude: true };
    // Only route to hosts that honour JSON mode.
    if (args.json) body.provider = { require_parameters: true };
    if (args.preferFast) body.provider = { ...(body.provider || {}), sort: "throughput" };
  }
  if (oss && args.provider === "groq") body.reasoning_effort = args.reasoningEffort ?? "low";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 25_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new AiHttpError(args.provider, res.status, t || res.statusText);
    }
    const json: any = await res.json();
    const choice = json?.choices?.[0];
    const raw = choice?.message?.content;
    const content = typeof raw === "string"
      ? raw
      : Array.isArray(raw) ? raw.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("") : "";
    return {
      content: content.trim(),
      finishReason: choice?.finish_reason ?? null,
      tokens_in: json?.usage?.prompt_tokens ?? 0,
      tokens_out: json?.usage?.completion_tokens ?? 0,
      provider: args.provider,
      model: args.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a JSON text task across the configured providers (gpt-oss-20b
 * first). `accept` validates the parsed object; returning false moves on
 * to the next provider. Throws the last error when every provider fails.
 */
export async function callTextJson<T = any>(args: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  accept?: (data: any) => boolean;
  label?: string;
  /** "smart" picks the stronger model per provider (see textModel). */
  tier?: TextTier;
}): Promise<{ data: T; tokens_in: number; tokens_out: number; provider: TextProvider; model: string }> {
  const providers = textProviderOrder();
  if (providers.length === 0) throw new Error(`No AI key configured - ${TEXT_AI_KEYS_HINT}.`);
  let lastErr: unknown = null;
  for (const provider of providers) {
    const model = textModel(provider, args.tier);
    // A reply cut off at the token limit (reasoning ate the budget) gets
    // one retry on the same provider with double the budget, so a
    // single-provider server doesn't lose the whole answer.
    let budget = args.maxTokens ?? 2048;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let truncated = false;
      try {
        const r = await chatCompletion({
          provider,
          model,
          reasoningEffort: args.tier === "smart" ? ((process.env.SMART_TEXT_REASONING as "low" | "medium" | "high") || "low") : "low",
          preferFast: args.tier === "smart",
          maxTokens: budget,
          temperature: args.temperature ?? 0,
          timeoutMs: args.timeoutMs,
          json: true,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user },
          ],
        });
        const data = parseJsonLoose(r.content);
        if (data && typeof data === "object" && (!args.accept || args.accept(data))) {
          return { data, tokens_in: r.tokens_in, tokens_out: r.tokens_out, provider, model };
        }
        truncated = r.finishReason === "length";
        lastErr = new Error(`${provider} (${model}) returned no usable JSON${r.finishReason ? ` (${r.finishReason})` : ""}`);
      } catch (e) {
        lastErr = e;
      }
      console.warn(`[ai${args.label ? `:${args.label}` : ""}] provider ${provider} failed:`, lastErr instanceof Error ? lastErr.message : lastErr);
      if (!truncated) break;
      budget *= 2;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI request failed");
}
