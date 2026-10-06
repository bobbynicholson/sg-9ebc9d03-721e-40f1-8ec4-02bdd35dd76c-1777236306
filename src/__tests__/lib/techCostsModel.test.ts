import {
  ALL_PRICING_LINKS,
  computeTechCosts,
  DEFAULT_ASSUMPTIONS,
  GOOGLE_MAPS,
} from "@/lib/techCosts/model";
import { getPlatformTechnologyCostSummary } from "@/services/platformTechnologyCostService";

const category = (r: ReturnType<typeof computeTechCosts>, key: string) => r.categories.find((c) => c.key === key)!;

describe("tech-cost model", () => {
  it("covers every vendor the platform uses", () => {
    const r = computeTechCosts(DEFAULT_ASSUMPTIONS);
    expect(r.categories.map((c) => c.key)).toEqual(["hosting", "database", "ai", "email", "maps", "payments", "accounting", "monitoring", "free", "fixed", "passthrough"]);
    const total = r.categories.filter((c) => !c.informational).reduce((s, c) => s + c.subtotal_usd, 0);
    expect(r.total_usd).toBeCloseTo(total, 8);
  });

  it("links every paid line and every category to an official pricing page", () => {
    const r = computeTechCosts(DEFAULT_ASSUMPTIONS);
    for (const c of r.categories) {
      for (const l of c.lines) {
        if (l.usd_per_mo !== 0 && c.key !== "fixed") expect(l.link?.url).toMatch(/^https:\/\//);
      }
      if (c.key !== "fixed") expect(c.links.length).toBeGreaterThan(0);
    }
    const urls = ALL_PRICING_LINKS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("nets the Vercel usage credit against metered usage only", () => {
    const small = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 5 });
    expect(small.categories[0].subtotal_usd).toBeCloseTo(20, 8); // usage below the US$20 credit
    const big = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 500 });
    const metered = big.categories[0].lines.slice(1, 4).reduce((s, l) => s + l.usd_per_mo, 0);
    expect(metered).toBeGreaterThan(20);
    expect(big.categories[0].subtotal_usd).toBeCloseTo(20 + metered - 20, 8);
  });

  it("steps Supabase compute and Xero tiers with company count", () => {
    const line = (n: number, key: string, prefix: string) =>
      computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: n }).categories.find((c) => c.key === key)!.lines.find((l) => l.label.startsWith(prefix))!;
    expect(line(50, "database", "Database compute").usd_per_mo).toBe(5);    // Small 15 - 10 credit
    expect(line(250, "database", "Database compute").usd_per_mo).toBe(50);  // Medium 60 - 10
    expect(line(10, "accounting", "Xero").usd_per_mo).toBe(0);              // 3 connections: Starter
    expect(line(100, "accounting", "Xero").usd_per_mo).toBe(22);            // 30: Core
    expect(line(500, "accounting", "Xero").usd_per_mo).toBe(152);           // 150: Plus
  });

  it("keeps company-paid services out of the platform total", () => {
    const r = computeTechCosts(DEFAULT_ASSUMPTIONS);
    const pass = r.categories.find((c) => c.key === "passthrough")!;
    expect(pass.informational).toBe(true);
    expect(pass.lines.map((l) => l.label).join(" ")).toContain("WhatsApp");
  });

  it("lists every AI feature on gpt-oss-20b / Llama 4 by default", () => {
    const ai = category(computeTechCosts(DEFAULT_ASSUMPTIONS), "ai");
    const labels = ai.lines.map((l) => l.label).join("\n");
    for (const feature of ["Receipt scans", "EFT proof", "Client / CSV import", "Import row repair", "Assistant replies", "Assistant intent routing", "Knowledge safety review", "embeddings", "Brand palette", "blog drafts"]) {
      expect(labels).toContain(feature);
    }
    expect(labels).toContain("gpt-oss-20b");
    expect(labels).toContain("Llama 4 Scout");
    expect(labels).not.toContain("Claude");
  });

  it("is much cheaper than the previous Claude routing", () => {
    const r = computeTechCosts(DEFAULT_ASSUMPTIONS);
    expect(r.ai_usd).toBeGreaterThan(0);
    expect(r.ai_previous_claude_usd).toBeGreaterThan(r.ai_usd * 4);
  });

  it("re-prices AI when Claude is picked in the selectors", () => {
    const claude = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, text_model: "claude-haiku-4-5", vision_model: "claude-haiku-sonnet" });
    expect(claude.ai_usd).toBeCloseTo(claude.ai_previous_claude_usd, 8);
  });

  it("falls back to the default models on an unknown selector value", () => {
    const a = computeTechCosts(DEFAULT_ASSUMPTIONS);
    const b = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, text_model: "nope", vision_model: "nope" });
    expect(b.ai_usd).toBeCloseTo(a.ai_usd, 10);
  });

  it("applies the per-SKU Google Maps free caps", () => {
    const small = category(computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 10 }), "maps");
    expect(small.subtotal_usd).toBe(0);
    const big = category(computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 100 }), "maps");
    const matrix = big.lines.find((l) => l.label.startsWith("Distance Matrix"))!;
    expect(matrix.usd_per_mo).toBeCloseTo(((100 * 200 - GOOGLE_MAPS.free_calls_per_sku) / 1000) * 5, 8);
  });

  it("charges PayFast card fees on subscription revenue", () => {
    const r = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 10, subscription_zar_per_tenant: 1000, card_paying_share: 1 }, 20);
    // 10 × (3.2% × 1000 + 2) = ZAR 340 = US$17 at 20
    expect(category(r, "payments").subtotal_usd).toBeCloseTo(17, 8);
    const stripe = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 10, subscription_zar_per_tenant: 1000, payment_gateway: "stripe" }, 20);
    // 10 × (2.9% × 1000 / 20 + 0.30) = US$17.5
    expect(category(stripe, "payments").subtotal_usd).toBeCloseTo(17.5, 8);
  });

  it("has no NaN with zero companies", () => {
    const r = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 0 });
    expect(Number.isFinite(r.total_usd)).toBe(true);
  });
});

describe("assistant tech-cost summary uses the same model", () => {
  function fakeDb(companies: unknown[], plans: unknown[], rate: number) {
    const chain = (data: unknown) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "is", "not", "eq", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data, error: null });
      q.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
      return q;
    };
    return {
      from: (table: string) => table === "companies" ? chain(companies) : table === "platform_pricing_plans" ? chain(plans) : chain({ usd_to_zar_rate: rate }),
    };
  }

  it("matches computeTechCosts for the live company count", async () => {
    const companies = [
      { id: "1", subscription_status: "active", subscription_plan: "pro" },
      { id: "2", subscription_status: "active", subscription_plan: "pro" },
      { id: "3", subscription_status: "trial", subscription_plan: "pro" },
    ];
    const summary = await getPlatformTechnologyCostSummary(fakeDb(companies, [{ slug: "pro", name: "Pro", zar_price: 2000 }], 18));
    expect(summary).not.toBeNull();
    const expected = computeTechCosts({ ...DEFAULT_ASSUMPTIONS, tenants: 3, subscription_zar_per_tenant: 2000, card_paying_share: 2 / 3 }, 18);
    expect(summary!.monthlyCostUsd).toBeCloseTo(expected.total_usd, 8);
    expect(summary!.subscriptionRevenueZar).toBe(4000);
    expect(summary!.costByService.map((s) => s.service)).toContain("AI models");
  });
});
