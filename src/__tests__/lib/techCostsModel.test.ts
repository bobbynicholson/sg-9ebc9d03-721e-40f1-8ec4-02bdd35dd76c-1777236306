/**
 * @jest-environment node
 */
import {
  aiCallCostUsd,
  ALL_PRICING_LINKS,
  computeTechCosts,
  EMPTY_INPUTS,
  priceForModel,
  type TechCostInputs,
} from "@/lib/techCosts/model";
import { getLiveTechCostData, getPlatformTechnologyCostSummary } from "@/services/platformTechnologyCostService";
import { buildAiUsageRow } from "@/lib/ai/usageLog";

const today: TechCostInputs = {
  ...EMPTY_INPUTS,
  companies: 1, paying_companies: 0, revenue_zar: 0, users: 22, emails: 108, chat_messages: 105,
};
const category = (inputs: TechCostInputs, key: string) => computeTechCosts(inputs, 16.66).categories.find((c) => c.key === key)!;

describe("tech-cost model", () => {
  it("only models vendors the platform uses", () => {
    const r = computeTechCosts(today, 16.66);
    expect(r.categories.map((c) => c.key)).toEqual(["hosting", "database", "ai", "email", "maps", "payments", "fixed"]);
    expect(r.total_usd).toBeCloseTo(r.categories.reduce((s, c) => s + c.subtotal_usd, 0), 10);
    const text = JSON.stringify(r);
    for (const gone of ["Xero", "QuickBooks", "Sage", "Sentry", "WhatsApp", "Stripe", "Yoco"]) expect(text).not.toContain(gone);
  });

  it("prices today's platform from real records", () => {
    const r = computeTechCosts(today, 16.66);
    // Vercel US$20 seat (usage inside its credit) + Supabase US$25 + Small compute US$5 + domain US$1.50
    expect(category(today, "hosting").subtotal_usd).toBe(20);
    expect(category(today, "database").subtotal_usd).toBe(30);
    expect(category(today, "email").subtotal_usd).toBe(0);      // 108 emails, 3,000 free
    expect(category(today, "maps").subtotal_usd).toBe(0);       // inside every free allowance
    expect(category(today, "payments").subtotal_usd).toBe(0);   // no paying companies yet
    expect(r.ai_is_actual).toBe(false);
    expect(r.ai_usd).toBeGreaterThan(0);
    expect(r.ai_usd).toBeLessThan(1);
    expect(r.total_usd).toBeCloseTo(51.5 + r.ai_usd, 8);
  });

  it("uses tracked AI spend once the ledger exists", () => {
    const r = computeTechCosts({ ...today, ai_actual_usd: 0.4321, ai_actual_calls: 17 }, 16.66);
    expect(r.ai_is_actual).toBe(true);
    expect(r.ai_usd).toBe(0.4321);
    expect(category({ ...today, ai_actual_usd: 0.4321, ai_actual_calls: 17 }, "ai").lines[0].formula).toContain("17 AI calls");
  });

  it("charges PayFast fees on real subscription revenue", () => {
    const fees = category({ ...today, paying_companies: 2, revenue_zar: 3798 }, "payments");
    // 3.2% × 3798 + 2 × R2 = R125.536 → US$ at 16.66
    expect(fees.subtotal_usd).toBeCloseTo((3798 * 0.032 + 4) / 16.66, 8);
  });

  it("bills Resend Pro once emails pass the free tier", () => {
    expect(category({ ...today, emails: 3_001 }, "email").subtotal_usd).toBe(20);
    expect(category({ ...today, emails: 60_000 }, "email").subtotal_usd).toBeCloseTo(20 + 10 * 0.9, 8);
  });

  it("steps Supabase compute and Vercel usage with company count", () => {
    expect(category({ ...today, companies: 250 }, "database").lines[1].usd_per_mo).toBe(50);   // Medium 60 - 10 credit
    const vercel = category({ ...today, companies: 500 }, "hosting");
    expect(vercel.lines[1].usd_per_mo).toBeGreaterThan(0);                                     // usage beyond the US$20 credit
  });

  it("links every category except the domain to an official pricing page", () => {
    const r = computeTechCosts(today, 16.66);
    for (const c of r.categories) if (c.key !== "fixed") expect(c.links.length).toBeGreaterThan(0);
    const urls = ALL_PRICING_LINKS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
});

describe("AI call pricing", () => {
  it("prices each model the code calls", () => {
    expect(aiCallCostUsd("openai/gpt-oss-20b", 1_000_000, 1_000_000, "openrouter")).toBeCloseTo(0.018 + 0.09, 10);
    expect(aiCallCostUsd("openai/gpt-oss-20b", 1_000_000, 1_000_000, "groq")).toBeCloseTo(0.075 + 0.30, 10);
    expect(aiCallCostUsd("meta-llama/llama-4-scout", 4_000, 1_500)).toBeCloseTo(0.0004 + 0.00045, 10);
    expect(aiCallCostUsd("gpt-4.1-mini", 1_000_000, 0)).toBeCloseTo(0.4, 10);
    expect(aiCallCostUsd("claude-haiku-4-5", 0, 1_000_000, "anthropic")).toBeCloseTo(5, 10);
    expect(priceForModel("openai/text-embedding-3-small")).not.toBeNull();   // OpenRouter-prefixed embedding id
    expect(aiCallCostUsd("some/unknown-model", 1000, 1000)).toBe(0);
  });

  it("builds a ledger row with cost and safe ids", () => {
    const row = buildAiUsageRow(
      { feature: "chat_reply", provider: "openrouter", model: "openai/gpt-oss-20b", tokensIn: 5000, tokensOut: 600, success: true, latencyMs: 812.4 },
      { companyId: "11111111-1111-4111-8111-111111111111", userId: "not-a-uuid" },
    );
    expect(row).toMatchObject({ feature: "chat_reply", company_id: "11111111-1111-4111-8111-111111111111", user_id: null, tokens_in: 5000, tokens_out: 600, success: true, latency_ms: 812 });
    expect(row.cost_usd).toBeCloseTo((5000 * 0.018 + 600 * 0.09) / 1_000_000, 8);
  });
});

describe("live data from platform records", () => {
  function fakeDb(tables: Record<string, { data?: unknown; count?: number; error?: unknown }>) {
    return {
      from: (table: string) => {
        const t = tables[table] ?? { data: [], count: 0 };
        const q: Record<string, unknown> = {};
        for (const m of ["select", "is", "not", "eq", "gte", "in", "order", "limit"]) q[m] = () => q;
        q.maybeSingle = async () => ({ data: t.data, error: t.error ?? null });
        q.then = (resolve: (v: unknown) => void) => resolve({ data: t.data, count: t.count, error: t.error ?? null });
        return q;
      },
    };
  }

  const tables = {
    companies: { data: [
      { id: "c1", company_name: "Spit Braai Co", onboarding_completed_at: "2026-09-01", subscription_status: "active", subscription_plan: "pro" },
      { id: "c2", company_name: "Trial Co", onboarding_completed_at: "2026-09-02", subscription_status: "trial", subscription_plan: "pro" },
      { id: "c3", company_name: "Signup", onboarding_completed_at: null, subscription_status: "trial", subscription_plan: null },
    ] },
    platform_pricing_plans: { data: [{ slug: "pro", name: "Pro", zar_price: 1899 }] },
    exchange_rates: { data: { usd_to_zar_rate: 16.66, date: "2026-10-03" } },
    profiles: { count: 22 },
    outgoing_email_queue: { count: 108 },
    chat_messages: { count: 105 },
    payments: { count: 0 },
    import_jobs: { data: [] },
    ai_usage_events: { data: [
      { created_at: new Date().toISOString(), company_id: "c1", feature: "chat_reply", provider: "openrouter", model: "openai/gpt-oss-20b", tokens_in: 5000, tokens_out: 600, cost_usd: 0.000144, success: true },
      { created_at: new Date().toISOString(), company_id: "c1", feature: "chat_intent", provider: "openai", model: "gpt-4o-mini", tokens_in: 2500, tokens_out: 40, cost_usd: 0.000399, success: true },
      { created_at: new Date().toISOString(), company_id: null, feature: "chat_reply", provider: "openrouter", model: "openai/gpt-oss-20b", tokens_in: 0, tokens_out: 0, cost_usd: 0, success: false },
    ] },
  };

  it("reads real counts, revenue, FX and live AI spend", async () => {
    const live = (await getLiveTechCostData(fakeDb(tables)))!;
    expect(live.inputs).toMatchObject({ companies: 2, paying_companies: 1, revenue_zar: 1899, users: 22, emails: 108, chat_messages: 105, receipt_scans: 0, eft_proofs: 0 });
    expect(live.companiesTotal).toBe(3);
    expect(live.usdToZar).toBe(16.66);
    expect(live.ai).toMatchObject({ available: true, calls: 3, failed: 1 });
    expect(live.ai.cost_usd).toBeCloseTo(0.000543, 9);
    expect(live.ai.byFeature[0]).toMatchObject({ key: "chat_intent", calls: 1 });
    expect(live.ai.recent[0].company).toBe("Spit Braai Co");
    expect(live.costs.ai_is_actual).toBe(true);
  });

  it("falls back to an AI estimate when the ledger table is missing", async () => {
    const live = (await getLiveTechCostData(fakeDb({ ...tables, ai_usage_events: { data: null, error: { message: "relation does not exist" } } })))!;
    expect(live.ai.available).toBe(false);
    expect(live.costs.ai_is_actual).toBe(false);
  });

  it("feeds the assistant the same numbers", async () => {
    const summary = (await getPlatformTechnologyCostSummary(fakeDb(tables)))!;
    const live = (await getLiveTechCostData(fakeDb(tables)))!;
    expect(summary.monthlyCostUsd).toBeCloseTo(live.costs.total_usd, 10);
    expect(summary.subscriptionRevenueZar).toBe(1899);
    expect(summary.costByService.map((s) => s.service)).toContain("AI models");
  });
});
