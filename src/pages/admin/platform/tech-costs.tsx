/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/platform/tech-costs
 *
 * SaaS-owner unit-economics calculator. Predicts CateringMS's monthly
 * COGS as a function of tenant count + per-tenant usage assumptions,
 * across the actual tech stack: Vercel, Supabase, AI models (gpt-oss-20b
 * for text, Llama 4 for vision, gpt-4o-mini intent routing, OpenAI
 * embeddings), Resend, Cloudflare, Google Maps, PayFast card fees and
 * fixed costs.
 *
 * The vendor prices and the math live in src/lib/techCosts/model.ts,
 * shared with the assistant's technology-cost answer.
 *
 * Sliders + numeric inputs drive a live recompute. The grid below shows
 * the per-line cost with the formula, the headline shows the monthly
 * total, the "if pricing is X, margin per tenant is Y" panel ties this
 * to Bobby's subscription pricing decision.
 *
 * Defaults: tenant count is loaded from companies (excluding pending
 * signups + super-admin records) so the initial scenario reflects the
 * platform's current state.
 *
 * Pricing data is hard-coded in the model - this is a calculator, not
 * an integration.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Calculator, Cloud, Database, Sparkles, Mail, MapPin, Package,
  TrendingUp, AlertTriangle, ArrowRight, Info, Globe, CreditCard, TrendingDown,
  BookOpen, Activity, Users, ExternalLink,
} from "lucide-react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  computeTechCosts,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_USD_TO_ZAR,
  ALL_PRICING_LINKS,
  PAYMENT_GATEWAYS,
  PRICES_CHECKED,
  RECEIPT_SCAN_QUOTA_CAP,
  SENTRY_PLANS,
  TEXT_MODELS,
  VISION_MODELS,
  type CostCategoryKey,
  type PaymentGatewayKey,
  type PricingLink,
  type SentryPlanKey,
  type TechCostAssumptions,
} from "@/lib/techCosts/model";

type Assumptions = TechCostAssumptions;
const DEFAULTS: Assumptions = DEFAULT_ASSUMPTIONS;

/** What to pull when a category dominates the monthly spend. */
const LEVER_TIPS: Record<CostCategoryKey, string> = {
  hosting: "Cut function invocations: batch automations and cache heavy API routes.",
  database: "Move to a right-sized compute instance and keep large files out of the database.",
  ai: "Keep text on gpt-oss and vision on Llama 4 Scout, and keep the receipt-scan cap in place.",
  email: "Batch notifications into digests and trim automation emails nobody opens.",
  maps: "Cache distances per venue and use session tokens on address search.",
  payments: "Offer annual billing or debit orders / EFT, which carry lower fees than per-charge card payments.",
  accounting: "Watch the Xero connection count: the next tier starts above 50 and above 1,000 connected companies.",
  monitoring: "Drop to the free Sentry Developer plan if errors stay under 5,000 a month.",
  free: "These are free; keep usage inside each provider's fair-use limits.",
  fixed: "Review the domain renewal once a year.",
  passthrough: "Billed to each company directly.",
};

const CATEGORY_ICONS: Record<CostCategoryKey, any> = {
  hosting: Cloud,
  database: Database,
  ai: Sparkles,
  email: Mail,
  maps: MapPin,
  payments: CreditCard,
  accounting: BookOpen,
  monitoring: Activity,
  free: Globe,
  fixed: Package,
  passthrough: Users,
};

// ─── Page ────────────────────────────────────────────────────────────

function TechCostsDashboard() {
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULTS);
  const [usdToZar, setUsdToZar] = useState<number>(DEFAULT_USD_TO_ZAR);
  const [actualTenants, setActualTenants] = useState<number | null>(null);

  // Pull current tenant count so the operator's initial scenario is
  // anchored on reality. Excludes pending signups (no admin yet) and
  // anything obviously test (slug starts with "test-").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from("companies")
        .select("id", { head: true, count: "exact" })
        .not("onboarding_completed_at", "is", null);
      if (cancelled) return;
      if (error) {
        // Non-fatal: the calculator falls back to the DEFAULTS tenant
        // count, but never swallow the failure silently.
        console.warn("[tech-costs] tenant count query failed, using default assumptions:", error);
      }
      const c = count ?? 0;
      setActualTenants(c);
      // Seed the calculator with reality if there's at least one tenant.
      if (c > 0) {
        setAssumptions((a) => ({ ...a, tenants: c }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { categories, total_usd, ai_usd, ai_previous_claude_usd } = useMemo(
    () => computeTechCosts(assumptions, usdToZar),
    [assumptions, usdToZar],
  );
  const ai_saving_usd = Math.max(0, ai_previous_claude_usd - ai_usd);

  const total_zar = total_usd * usdToZar;
  const cost_per_tenant_zar = assumptions.tenants > 0 ? total_zar / assumptions.tenants : 0;
  const margin_per_tenant_zar = assumptions.subscription_zar_per_tenant - cost_per_tenant_zar;
  const margin_pct =
    assumptions.subscription_zar_per_tenant > 0
      ? (margin_per_tenant_zar / assumptions.subscription_zar_per_tenant) * 100
      : 0;
  const platform_revenue_zar = assumptions.tenants * assumptions.subscription_zar_per_tenant;
  const platform_margin_zar = platform_revenue_zar - total_zar;

  // Scaling scenarios - the question is "how does cost-per-tenant
  // change as I grow?" Hold per-tenant assumptions constant, vary
  // the tenant count, recompute cost/tenant.
  const scaleScenarios = useMemo(() => {
    const counts = [10, 50, 100, 250, 500, 1000];
    return counts.map((n) => {
      const sim = computeTechCosts({ ...assumptions, tenants: n }, usdToZar);
      const monthly_zar = sim.total_usd * usdToZar;
      return {
        tenants: n,
        monthly_zar,
        per_tenant_zar: n > 0 ? monthly_zar / n : 0,
      };
    });
  }, [assumptions, usdToZar]);

  // Largest cost line as % of total - drives the "biggest lever"
  // recommendation strip below.
  const biggestCategory = useMemo(() => {
    if (total_usd <= 0) return null;
    return categories.reduce(
      (best, c) => (c.subtotal_usd > best.subtotal_usd ? c : best),
      categories[0],
    );
  }, [categories, total_usd]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Tech-stack costs - CateringMS</title></Head>

      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title={
              <span className="flex items-center gap-2">
                Tech-stack costs
                <InfoTooltip content={"Predict CateringMS's monthly COGS as a function of tenant count and per-tenant usage. Sliders update the projection live, showing where each rand goes, your margin per tenant, and where you cross the next vendor tier."} />
              </span>
            }
            subtitle="Unit economics calculator. How much does the platform cost to run, and where does the money go?"
            icon={Calculator}
            meta={
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {assumptions.tenants.toLocaleString()} {assumptions.tenants === 1 ? "company" : "companies"} modelled
                  {actualTenants !== null && actualTenants !== assumptions.tenants ? ` (actual ${actualTenants})` : ""}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  ZAR {total_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })} / month
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className={`h-1.5 w-1.5 rounded-full ${margin_per_tenant_zar > 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                  ZAR {margin_per_tenant_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })} margin / company
                </span>
              </>
            }
            actions={
              <Button asChild variant="outline" className="gap-1">
                <Link href="/admin/platform/pricing-management">
                  Pricing tiers <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            }
          />
          <PageWorkbench />

          {/* Headline numbers */}
          <div id="tenant-cost" data-chat-section="platform.tech-costs.tenant-cost" data-chat-section-label="Cost per company" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <StatTile
              label="Monthly platform cost"
              value={`ZAR ${total_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`}
              hint={`US$${total_usd.toFixed(2)} at ZAR ${usdToZar.toFixed(2)}/USD`}
            />
            <StatTile
              label="Cost per company"
              value={`ZAR ${cost_per_tenant_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`}
              hint={
                <>
                  At {assumptions.tenants.toLocaleString()} {assumptions.tenants === 1 ? "company" : "companies"}
                  {actualTenants !== null && actualTenants !== assumptions.tenants && (
                    <span className="ml-1 text-slate-400">(actual: {actualTenants})</span>
                  )}
                </>
              }
            />
            <StatTile
              label="Margin per company"
              value={
                <span className={margin_per_tenant_zar > 0 ? "text-amber-600 dark:text-amber-500" : "text-rose-600 dark:text-rose-500"}>
                  ZAR {margin_per_tenant_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </span>
              }
              hint={`${margin_pct.toFixed(0)}% of ZAR ${assumptions.subscription_zar_per_tenant.toLocaleString()} sub`}
            />
          </div>

          {/* Total revenue + total margin row */}
          <PortalCard id="margin-analysis" data-chat-section="platform.tech-costs.margin" data-chat-section-label="Margin analysis" className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center sm:text-left p-4">
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500 dark:text-slate-400">Companies</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{assumptions.tenants.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500 dark:text-slate-400">Monthly revenue</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  ZAR {platform_revenue_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500 dark:text-slate-400">Monthly costs</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  ZAR {total_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500 dark:text-slate-400">Platform margin</p>
                <p className={`text-xl font-bold ${platform_margin_zar > 0 ? "text-brand-primary" : "text-rose-700 dark:text-rose-400"}`}>
                  ZAR {platform_margin_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
              </div>
          </PortalCard>

          {/* AI routing savings vs the previous Claude setup */}
          <PortalCard id="ai-savings" data-chat-section="platform.tech-costs.ai-savings" data-chat-section-label="AI model savings" className="mb-6 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">AI spend on the selected models</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Same usage on the previous Claude setup (Haiku text, Haiku + Sonnet vision) would cost
                {" "}ZAR {(ai_previous_claude_usd * usdToZar).toLocaleString("en-ZA", { maximumFractionDigits: 0 })} / month.
                Claude now runs only as a last-resort fallback.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:text-right flex-shrink-0">
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500 dark:text-slate-400">AI / month</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  ZAR {(ai_usd * usdToZar).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500 dark:text-slate-400">Saved / month</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  ZAR {(ai_saving_usd * usdToZar).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                  {ai_previous_claude_usd > 0 && (
                    <span className="ml-1 text-xs font-semibold">({((ai_saving_usd / ai_previous_claude_usd) * 100).toFixed(0)}%)</span>
                  )}
                </p>
              </div>
            </div>
          </PortalCard>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Assumptions panel */}
            <PortalCard className="lg:col-span-1 space-y-5">
                <div>
                  <PortalCardHeader title="Assumptions" className="mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Adjust these to see how cost changes.</p>
                </div>

                <Section title="Scale">
                  <NumField
                    label="Number of companies"
                    value={assumptions.tenants}
                    onChange={(v) => setAssumptions({ ...assumptions, tenants: v })}
                    min={1}
                    step={1}
                    tooltip="Active catering companies on the platform. Pulled from companies.onboarding_completed_at IS NOT NULL on first load."
                  />
                  <NumField
                    label="Subscription per company (ZAR/mo)"
                    value={assumptions.subscription_zar_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, subscription_zar_per_tenant: v })}
                    min={0}
                    step={100}
                    tooltip="What you charge each tenant per month. Drives margin calculation, not cost."
                  />
                </Section>

                <Section title="AI models">
                  <ModelSelect
                    label="Text model"
                    value={assumptions.text_model}
                    options={Object.entries(TEXT_MODELS).map(([key, m]) => ({ key, label: m.label }))}
                    onChange={(v) => setAssumptions({ ...assumptions, text_model: v })}
                    tooltip="Runs client / CSV import column matching, row repair, assistant replies, knowledge review, brand palettes and blog drafts. Production routes to gpt-oss-20b (OpenRouter, then Groq), then OpenAI gpt-4o-mini; Claude is only a last-resort fallback. Pick another model to compare its cost."
                  />
                  <ModelSelect
                    label="Vision model"
                    value={assumptions.vision_model}
                    options={Object.entries(VISION_MODELS).map(([key, m]) => ({ key, label: `${m.primary.label}${m.fallback.id !== m.primary.id ? ` + ${m.fallback.label.split(" · ")[0]} retry` : ""}` }))}
                    onChange={(v) => setAssumptions({ ...assumptions, vision_model: v })}
                    tooltip="Reads receipt photos and EFT proofs. gpt-oss is text-only, so vision runs on Llama 4 Scout with a Maverick retry when the first pass finds no lines."
                  />
                </Section>

                <Section title="AI usage per company / month">
                  <NumField
                    label="Receipt scans"
                    value={assumptions.receipt_scans_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, receipt_scans_per_tenant: v })}
                    min={0}
                    tooltip={`Slips run through the AI receipt scanner. CAPPED at ${RECEIPT_SCAN_QUOTA_CAP} per company server-side (src/lib/receiptScanQuota.ts); the default uses the cap as a worst case. Each scan ≈ 4k input + 1.5k output tokens.`}
                  />
                  {/* Loud warning when the input exceeds what the
                      quota will actually allow. */}
                  {assumptions.receipt_scans_per_tenant > RECEIPT_SCAN_QUOTA_CAP && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 -mt-2 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                      <strong>Above the quota cap.</strong> The server hard-caps each company at
                       {" "}{RECEIPT_SCAN_QUOTA_CAP} receipt scans / month. Extra scans get a
                       {" "}<em>quota exceeded</em> response and the AI call never happens, so real
                      spend is bounded by the cap × companies. Drop to {RECEIPT_SCAN_QUOTA_CAP} for a defensible projection.
                    </div>
                  )}
                  <NumField
                    label="EFT proofs screened"
                    value={assumptions.eft_proofs_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, eft_proofs_per_tenant: v })}
                    min={0}
                    tooltip="Bank-transfer proofs uploaded by clients and screened by the vision model before an admin confirms payment."
                  />
                  <NumField
                    label="Client / CSV imports"
                    value={assumptions.csv_imports_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, csv_imports_per_tenant: v })}
                    min={0}
                    tooltip="Spreadsheet imports through the AI column matcher (client import and onboarding importer). One model call per sheet: headers + 3 sample rows."
                  />
                  <NumField
                    label="Import row repairs"
                    value={assumptions.row_repairs_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, row_repairs_per_tenant: v })}
                    min={0}
                    tooltip="Times an operator presses AI repair on a flagged import row."
                  />
                  <NumField
                    label="Assistant messages"
                    value={assumptions.chat_messages_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, chat_messages_per_tenant: v })}
                    min={0}
                    tooltip="Messages sent to the in-app assistant. Every message is routed by gpt-4o-mini; about 60% then need a model reply (the rest are answered straight from company records)."
                  />
                  <NumField
                    label="Knowledge uploads"
                    value={assumptions.knowledge_uploads_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, knowledge_uploads_per_tenant: v })}
                    min={0}
                    tooltip="Documents added to the assistant's knowledge base. Each one gets an AI safety review and is embedded for search."
                  />
                  <NumField
                    label="Brand palette suggestions"
                    value={assumptions.brand_palettes_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, brand_palettes_per_tenant: v })}
                    min={0}
                    step={0.1}
                    tooltip="AI colour palette suggestions on the branding screen. Usually a one-off at setup."
                  />
                </Section>

                <Section title="Platform AI / month">
                  <NumField
                    label="Marketing blog drafts"
                    value={assumptions.blog_drafts_per_month}
                    onChange={(v) => setAssumptions({ ...assumptions, blog_drafts_per_month: v })}
                    min={0}
                    tooltip="AI drafts for the cateringms.com blog. Platform-wide, not per company."
                  />
                </Section>

                <Section title="Other usage per company / month">
                  <NumField
                    label="Emails"
                    value={assumptions.emails_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, emails_per_tenant: v })}
                    min={0}
                    tooltip="Transactional emails per company (quotes, invoices, automation, password resets)."
                  />
                  <NumField
                    label="Map loads"
                    value={assumptions.map_loads_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, map_loads_per_tenant: v })}
                    min={0}
                    tooltip="Google map views (live tracking, regions, driver screens)."
                  />
                  <NumField
                    label="Places autocompletes"
                    value={assumptions.places_autocompletes_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, places_autocompletes_per_tenant: v })}
                    min={0}
                    tooltip="Address search requests against Google Places."
                  />
                  <NumField
                    label="Place details"
                    value={assumptions.place_details_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, place_details_per_tenant: v })}
                    min={0}
                    tooltip="Address selections that fetch the full place (coordinates, components)."
                  />
                  <NumField
                    label="Distance Matrix elements"
                    value={assumptions.distance_matrix_calls_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, distance_matrix_calls_per_tenant: v })}
                    min={0}
                    tooltip="Delivery-distance lookups on quotes and lead forms."
                  />
                  <NumField
                    label="Directions requests"
                    value={assumptions.directions_calls_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, directions_calls_per_tenant: v })}
                    min={0}
                    tooltip="Driver route calculations."
                  />
                </Section>

                <Section title="Hosting + database per company / month">
                  <NumField
                    label="Function invocations (M)"
                    value={assumptions.function_invocations_per_tenant_m}
                    onChange={(v) => setAssumptions({ ...assumptions, function_invocations_per_tenant_m: v })}
                    min={0}
                    step={0.01}
                    tooltip="Vercel serverless invocations. 0.05M = 50,000, a busy company with realtime + a few automations. 1M a month is included on Pro."
                  />
                  <NumField
                    label="Active CPU hours"
                    value={assumptions.cpu_hours_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, cpu_hours_per_tenant: v })}
                    min={0}
                    step={0.1}
                    tooltip="Vercel bills Active CPU at US$0.128 per CPU-hour with no included amount. 0.7 h is about 50,000 invocations at ~50 ms CPU each."
                  />
                  <NumField
                    label="Vercel bandwidth GB"
                    value={assumptions.bandwidth_gb_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, bandwidth_gb_per_tenant: v })}
                    min={0}
                    step={0.5}
                    tooltip="Fast Data Transfer from Vercel (pages, scripts, images). 1 TB a month is included on Pro."
                  />
                  <NumField
                    label="Database GB"
                    value={assumptions.db_gb_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, db_gb_per_tenant: v })}
                    min={0}
                    step={0.05}
                    tooltip="Postgres data per company. 8 GB is included on Supabase Pro, then US$0.125/GB."
                  />
                  <NumField
                    label="File storage GB"
                    value={assumptions.storage_gb_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, storage_gb_per_tenant: v })}
                    min={0}
                    step={0.1}
                    tooltip="Avatars, logos, receipt photos, generated PDFs in Supabase Storage. 100 GB included."
                  />
                  <NumField
                    label="Supabase egress GB"
                    value={assumptions.egress_gb_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, egress_gb_per_tenant: v })}
                    min={0}
                    step={0.5}
                    tooltip="Outbound bandwidth from Supabase (client portal page loads + image fetches). 250 GB included."
                  />
                  <NumField
                    label="Monthly active users"
                    value={assumptions.mau_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, mau_per_tenant: v })}
                    min={0}
                    tooltip="Staff + active clients that sign in. Supabase MAU billing starts above 100k across the platform."
                  />
                </Section>

                <Section title="Platform setup">
                  <NumField
                    label="Vercel Pro seats"
                    value={assumptions.vercel_seats}
                    onChange={(v) => setAssumptions({ ...assumptions, vercel_seats: v })}
                    min={0}
                    tooltip="Developer seats on the Vercel team. Each is US$20/mo and includes US$20 of usage credit."
                  />
                  <NumField
                    label="Share connected to Xero (0-1)"
                    value={assumptions.xero_connected_share}
                    onChange={(v) => setAssumptions({ ...assumptions, xero_connected_share: v })}
                    min={0}
                    step={0.1}
                    tooltip="Share of companies that connect Xero. Xero charges the app by connection count: free up to 5, Core ~US$22 up to 50, Plus ~US$152 up to 1,000."
                  />
                  <ModelSelect
                    label="Subscription card gateway"
                    value={assumptions.payment_gateway}
                    options={Object.entries(PAYMENT_GATEWAYS).map(([key, g]) => ({ key, label: `${g.label} · ${g.note}` }))}
                    onChange={(v) => setAssumptions({ ...assumptions, payment_gateway: v as PaymentGatewayKey })}
                    tooltip="Gateway the platform uses to collect company subscriptions by card."
                  />
                  <NumField
                    label="Share paying by card (0-1)"
                    value={assumptions.card_paying_share}
                    onChange={(v) => setAssumptions({ ...assumptions, card_paying_share: v })}
                    min={0}
                    step={0.1}
                    tooltip="Share of companies whose subscription is charged by card. 1 = all."
                  />
                  <ModelSelect
                    label="Sentry plan"
                    value={assumptions.sentry_plan}
                    options={Object.entries(SENTRY_PLANS).map(([key, p]) => ({ key, label: p.label }))}
                    onChange={(v) => setAssumptions({ ...assumptions, sentry_plan: v as SentryPlanKey })}
                    tooltip="Error monitoring plan. Developer is free up to 5,000 errors a month."
                  />
                </Section>

                <Section title="FX">
                  <NumField
                    label="USD → ZAR rate"
                    value={usdToZar}
                    onChange={setUsdToZar}
                    min={1}
                    step={0.1}
                    tooltip="Updates every cost projection. Vendors bill in USD; you spend ZAR."
                  />
                </Section>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setAssumptions({ ...DEFAULTS, tenants: actualTenants ?? DEFAULTS.tenants });
                    setUsdToZar(DEFAULT_USD_TO_ZAR);
                  }}
                >
                  Reset to defaults
                </Button>
            </PortalCard>

            {/* Cost breakdown */}
            <PortalCard className="lg:col-span-2 space-y-5">
                <div>
                  <PortalCardHeader title="Cost breakdown" className="mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Where each rand of monthly spend goes. Click a category for line-by-line
                    formulas.
                  </p>
                </div>

                <div className="space-y-3">
                  {categories.map((cat) => {
                    const Icon = CATEGORY_ICONS[cat.key];
                    const pct = total_usd > 0 && !cat.informational ? (cat.subtotal_usd / total_usd) * 100 : 0;
                    return (
                      <details
                        key={cat.category}
                        className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      >
                        <summary className="cursor-pointer p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg">
                          <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-brand-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{cat.category}</p>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1.5">
                              <div
                                className="h-full bg-brand-primary"
                                style={{ width: `${pct.toFixed(1)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              ZAR {(cat.subtotal_usd * usdToZar).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{cat.informational ? "not in total" : `${pct.toFixed(0)}%`}</p>
                          </div>
                        </summary>
                        <div className="px-3 pb-3 border-t border-slate-100 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800">
                          {cat.lines.map((line, i) => (
                            <div key={i} className="py-2 flex items-start gap-3 text-xs">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700 dark:text-slate-300">{line.label}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{line.formula}</p>
                                {line.link && <PriceLink link={line.link} className="mt-0.5" />}
                              </div>
                              <p className="font-mono text-slate-900 dark:text-white font-semibold flex-shrink-0">
                                ZAR {(line.usd_per_mo * usdToZar).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                          ))}
                          {cat.links.length > 0 && (
                            <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Official pricing:</span>
                              {cat.links.map((l) => <PriceLink key={l.url} link={l} />)}
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>

                {/* Biggest lever */}
                {biggestCategory && (biggestCategory.subtotal_usd / total_usd) > 0.4 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      <strong>{biggestCategory.category}</strong> is{" "}
                      {((biggestCategory.subtotal_usd / total_usd) * 100).toFixed(0)}%
                      {" "}of your monthly spend. That&apos;s where the lever is. {LEVER_TIPS[biggestCategory.key]}
                    </div>
                  </div>
                )}
            </PortalCard>
          </div>

          {/* Scaling table */}
          <PortalCard id="cost-trend" data-chat-section="platform.tech-costs.trend" data-chat-section-label="Cost trend and scale scenarios" className="mb-6">
              <PortalCardHeader
                title={
                  <>
                    <TrendingUp className="w-4 h-4 text-brand-primary" />
                    Cost at scale
                    <InfoTooltip content={"Holds your per-tenant assumptions constant and varies the tenant count. Watch the per-tenant cost drop as fixed costs (Vercel + Supabase base + DB compute) get spread thinner."} />
                  </>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2">Companies</th>
                      <th className="py-2">Monthly platform cost</th>
                      <th className="py-2">Cost per company</th>
                      <th className="py-2">Margin per company (at ZAR {assumptions.subscription_zar_per_tenant})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {scaleScenarios.map((s) => {
                      const margin = assumptions.subscription_zar_per_tenant - s.per_tenant_zar;
                      return (
                        <tr key={s.tenants} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-2 font-semibold text-slate-900 dark:text-white">
                            {s.tenants.toLocaleString()}
                            {s.tenants === assumptions.tenants && (
                              <Badge variant="outline" className="ml-2 text-[10px]">current</Badge>
                            )}
                          </td>
                          <td className="py-2 font-mono text-slate-700 dark:text-slate-300">
                            ZAR {s.monthly_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-2 font-mono text-slate-700 dark:text-slate-300">
                            ZAR {s.per_tenant_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </td>
                          <td className={`py-2 font-mono font-semibold ${margin > 0 ? "text-brand-primary" : "text-rose-700 dark:text-rose-400"}`}>
                            ZAR {margin.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </PortalCard>

          {/* Every vendor's official pricing page */}
          <PortalCard id="pricing-sources" data-chat-section="platform.tech-costs.pricing-sources" data-chat-section-label="Vendor pricing pages" className="mb-6">
            <PortalCardHeader
              title={
                <>
                  <ExternalLink className="w-4 h-4 text-brand-primary" />
                  Vendor pricing pages
                  <InfoTooltip content={"The official pricing page behind every number on this page. Open one to check a rate before a pricing decision."} />
                </>
              }
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Prices checked {PRICES_CHECKED}. Vendors bill in USD, ex VAT (Xero bills in AUD; PayFast and Yoco in ZAR).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
              {ALL_PRICING_LINKS.map((l) => <PriceLink key={l.url} link={l} />)}
            </div>
          </PortalCard>

          {/* Footnote on assumptions */}
          <PortalCard className="p-4 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Vendor prices (checked {PRICES_CHECKED}) are fixed in src/lib/techCosts/model.ts and need a
              developer to update when a vendor changes them; the projection, recommendations and margin per company then recompute. This is a
              calculator, not a live feed: it doesn&apos;t pull real billing from any vendor.
            </p>
          </PortalCard>
        </PortalShell>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase font-bold tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function NumField({
  label, value, onChange, min, step = 1, tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  tooltip?: string;
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const v = e.target.value === "" ? 0 : Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        min={min}
        step={step}
        className="h-9 mt-1"
      />
    </div>
  );
}

function PriceLink({ link, className = "" }: { link: PricingLink; className?: string }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary hover:underline break-all ${className}`}
    >
      {link.label}
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
    </a>
  );
}

function ModelSelect({
  label, value, options, onChange, tooltip,
}: {
  label: string;
  value: string;
  options: Array<{ key: string; label: string }>;
  onChange: (v: string) => void;
  tooltip?: string;
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 mt-1 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ProtectedTechCosts() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <TechCostsDashboard />
    </ProtectedRoute>
  );
}
