/**
 * Live AI usage ledger.
 *
 * Every AI call the server makes is written to public.ai_usage_events
 * with its feature, provider, model, tokens and cost (priced from
 * src/lib/techCosts/model.ts). /admin/platform/tech-costs reads it to
 * show real AI spend as it happens.
 *
 * Logging must never break or slow the feature that made the call:
 * inserts are fire-and-forget, every error is swallowed, and when the
 * table doesn't exist yet (migration not run) logging switches itself
 * off for the life of the process.
 *
 * Company / user scope comes from setAiUsageContext(), called once in
 * the API route; it rides along the request's async context, so the AI
 * helpers don't need the ids threaded through every function.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { aiCallCostUsd } from "@/lib/techCosts/model";

export interface AiUsageContext {
  companyId?: string | null;
  userId?: string | null;
}

export interface AiUsageEvent {
  feature: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  success: boolean;
  error?: string | null;
  latencyMs?: number | null;
}

const storage = new AsyncLocalStorage<AiUsageContext>();
let tableMissing = false;

/** Tag every AI call for the rest of this request with the caller's company / user. */
export function setAiUsageContext(ctx: AiUsageContext): void {
  try {
    storage.enterWith({ ...storage.getStore(), ...ctx });
  } catch {
    /* context is optional */
  }
}

export function getAiUsageContext(): AiUsageContext {
  return storage.getStore() ?? {};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build the row; exported for tests. */
export function buildAiUsageRow(event: AiUsageEvent, ctx: AiUsageContext = getAiUsageContext()) {
  const tokensIn = Math.max(0, Math.round(Number(event.tokensIn) || 0));
  const tokensOut = Math.max(0, Math.round(Number(event.tokensOut) || 0));
  return {
    company_id: ctx.companyId && UUID.test(ctx.companyId) ? ctx.companyId : null,
    user_id: ctx.userId && UUID.test(ctx.userId) ? ctx.userId : null,
    feature: String(event.feature || "unknown").slice(0, 80),
    provider: String(event.provider || "unknown").slice(0, 40),
    model: String(event.model || "unknown").slice(0, 120),
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: Number(aiCallCostUsd(event.model, tokensIn, tokensOut, event.provider).toFixed(8)),
    success: event.success,
    error: event.error ? String(event.error).slice(0, 300) : null,
    latency_ms: event.latencyMs == null ? null : Math.max(0, Math.round(event.latencyMs)),
  };
}

/** Record one AI call. Never throws, never awaits the database for the caller. */
export function recordAiUsage(event: AiUsageEvent): void {
  // Tests load .env.local (live keys) - never write test calls to the real ledger.
  if (tableMissing || typeof window !== "undefined" || process.env.NODE_ENV === "test") return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY)) return;
  let row: ReturnType<typeof buildAiUsageRow>;
  try {
    row = buildAiUsageRow(event);
  } catch {
    return;
  }
  void (async () => {
    try {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const { error } = await getServiceSupabase().from("ai_usage_events").insert(row);
      if (error) {
        if (/ai_usage_events|does not exist|schema cache/i.test(error.message || "")) tableMissing = true;
        else console.warn("[ai-usage] could not record AI call:", error.message);
      }
    } catch (e) {
      console.warn("[ai-usage] could not record AI call:", e instanceof Error ? e.message : e);
    }
  })();
}
