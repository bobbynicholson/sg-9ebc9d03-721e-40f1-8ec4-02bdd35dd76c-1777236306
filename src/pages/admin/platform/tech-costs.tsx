/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/platform/tech-costs
 *
 * SaaS-owner unit-economics calculator. Predicts CateringMS's monthly
 * COGS as a function of tenant count + per-tenant usage assumptions,
 * across the actual tech stack:
 *
 *   - Vercel              (hosting + serverless functions)
 *   - Supabase            (Postgres + auth + storage + egress)
 *   - Anthropic API       (Sonnet 4-5 receipt scans, Haiku CSV mapping)
 *   - Resend              (transactional email)
 *   - Cloudflare DNS      (anycast nameservers for tenant sending domains)
 *   - Google Maps         (Places autocomplete + Distance Matrix)
 *   - Fixed (domain etc.) (small flat baseline)
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
 * Pricing data is hard-coded as named constants at the top of this
 * file - this is a calculator, not an integration. If a vendor's
 * pricing changes, edit the constant and the projection updates
 * everywhere it's used.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Calculator, Cloud, Database, Sparkles, Mail, MapPin, Package,
  TrendingUp, AlertTriangle, ArrowRight, Info, Globe,
} from "lucide-react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";

// ─── Vendor pricing (USD) ────────────────────────────────────────────
// Single source of truth. Update here when a vendor changes their card.

const VERCEL = {
  pro_base_usd_per_mo: 20,
  bandwidth_included_gb: 1024,        // 1 TB included on Pro
  bandwidth_overage_usd_per_100gb: 40,
  invocations_included_m: 1,          // 1 million function invocations
  invocations_overage_usd_per_m: 0.60,
};

const SUPABASE = {
  pro_base_usd_per_mo: 25,
  db_compute_usd_per_mo: 10,           // small instance baseline; scales with tenants
  storage_included_gb: 8,
  storage_usd_per_gb: 0.021,
  egress_included_gb: 250,
  egress_usd_per_gb: 0.09,
  mau_included: 100_000,               // 100k MAUs included
  mau_usd_each: 0.00325,
};

const ANTHROPIC = {
  // Sonnet 4-5 - held in reserve as the fallback model for receipt
  // scans where Haiku returns 0 lines. Empirically fires on ~10-15%
  // of slips (faded thermal, sideways shots, very dense text).
  sonnet_input_usd_per_m_tokens: 3,
  sonnet_output_usd_per_m_tokens: 15,
  // Haiku 4-5 - the workhorse. Default for receipt scans + CSV
  // column mapping. ~4x cheaper than Sonnet for the same structured-
  // vision task.
  haiku_input_usd_per_m_tokens: 0.80,
  haiku_output_usd_per_m_tokens: 4,
  // Sonnet fallback rate: how often we escalate to Sonnet when Haiku
  // returns 0 lines. Conservative estimate; tweak after observing real
  // production data.
  sonnet_fallback_rate: 0.12,
  // Per-call profile - empirical averages from production
  receipt_input_tokens_per_call: 4_000,   // image + system + tool schema
  receipt_output_tokens_per_call: 1_500,  // typical 10-line slip
  csv_input_tokens_per_call: 1_500,
  csv_output_tokens_per_call: 600,
  // Prompt caching: the system prompt + tax-rules table are identical
  // across calls within a 5-minute window. Anthropic charges 10% of
  // normal input rate for cached tokens. We assume ~80% of the input
  // tokens are cacheable (system + tax rules + tool schema); the
  // image is unique per call.
  cacheable_input_fraction: 0.80,
  cached_input_discount: 0.10, // cached tokens cost 10% of normal
};

const RESEND = {
  free_tier_emails: 3_000,
  paid_tier_usd_per_mo: 20,
  paid_tier_emails: 50_000,
  overage_usd_per_email: 0.001,
};

// Cloudflare DNS hosts every tenant's sending domain (free plan,
// anycast nameservers globally). We adopted it after Resend's verifier
// repeatedly stalled on tenants whose DNS sat at small SA-only hosts
// like za-dns - queries from us-east-1 to those nameservers were
// patchy, leaving Resend stuck on 'pending' for hours. Cloudflare's
// anycast NS resolves from a PoP in the same region as Resend's
// resolver, so verification flips inside 30 seconds.
//
// Free plan covers everything we need: unlimited DNS records, anycast,
// DNSSEC, no rate limits at our usage scale. Listed here at zero cost
// because we have a real chance of staying free for the life of the
// platform; the constant exists so the calculator can flag it if we
// ever migrate to Pro for advanced features.
const CLOUDFLARE = {
  free_plan_usd_per_mo: 0,
};

const GOOGLE_MAPS = {
  // SKU prices per Google's published rates
  autocomplete_usd_per_1k: 2.83,
  distance_matrix_usd_per_1k_elements: 5,
  monthly_credit_usd: 200,            // every account gets $200/month free
};

const FIXED = {
  domain_usd_per_mo: 1.5,              // amortised
  monitoring_usd_per_mo: 5,            // Sentry / log drains baseline
};

// ─── ZAR conversion ──────────────────────────────────────────────────
// USD -> ZAR for display. Editable on the page so a slide in the rand
// updates every cost projection live without a deploy.

const DEFAULT_USD_TO_ZAR = 18.5;

// ─── Defaults ────────────────────────────────────────────────────────

interface Assumptions {
  tenants: number;
  // Per-tenant per-month usage averages
  receipt_scans_per_tenant: number;
  csv_imports_per_tenant: number;
  emails_per_tenant: number;
  places_autocompletes_per_tenant: number;
  distance_matrix_calls_per_tenant: number;
  storage_gb_per_tenant: number;          // photos, PDFs, logos
  mau_per_tenant: number;                 // staff + active clients/mo
  // Per-tenant subscription pricing for margin calc
  subscription_zar_per_tenant: number;
  // Misc per-tenant load - drives function invocation + egress projection
  function_invocations_per_tenant_m: number;
  egress_gb_per_tenant: number;
}

/**
 * Hard cap from src/lib/receiptScanQuota.ts - a tenant cannot exceed
 * this no matter what (the API blocks the call). Keep in sync if
 * MONTHLY_SCAN_CAP changes there. Used here to (a) seed the default
 * input and (b) flag projections that exceed it as unrealistic.
 */
const RECEIPT_SCAN_QUOTA_CAP = 60;

const DEFAULTS: Assumptions = {
  tenants: 50,
  // Matches the per-tenant cap enforced in src/lib/receiptScanQuota.ts.
  // Use the cap as the calculator's default so projections show worst-
  // case (every tenant hits the ceiling), giving a defensible upper
  // bound on AI spend rather than an optimistic mid-point.
  receipt_scans_per_tenant: RECEIPT_SCAN_QUOTA_CAP,
  csv_imports_per_tenant: 1,
  emails_per_tenant: 200,
  places_autocompletes_per_tenant: 100,
  distance_matrix_calls_per_tenant: 200,
  storage_gb_per_tenant: 0.5,
  mau_per_tenant: 25,
  subscription_zar_per_tenant: 2_000,
  function_invocations_per_tenant_m: 0.05, // 50k invocations/mo per tenant
  egress_gb_per_tenant: 5,
};

// ─── Math ────────────────────────────────────────────────────────────

interface LineCost {
  label: string;
  formula: string;
  usd_per_mo: number;
}

interface CategoryCost {
  category: string;
  icon: any;
  lines: LineCost[];
  subtotal_usd: number;
}

function computeCosts(a: Assumptions): { categories: CategoryCost[]; total_usd: number } {
  const categories: CategoryCost[] = [];

  // Vercel
  const vercelInvocationsM = a.tenants * a.function_invocations_per_tenant_m;
  const vercelInvocationOverageM = Math.max(0, vercelInvocationsM - VERCEL.invocations_included_m);
  const vercelLines: LineCost[] = [
    {
      label: "Pro plan base",
      formula: `Flat US$${VERCEL.pro_base_usd_per_mo}/mo`,
      usd_per_mo: VERCEL.pro_base_usd_per_mo,
    },
    {
      label: "Function invocations",
      formula: `${vercelInvocationsM.toFixed(2)}M used, ${VERCEL.invocations_included_m}M included; overage ${vercelInvocationOverageM.toFixed(2)}M × US$${VERCEL.invocations_overage_usd_per_m}`,
      usd_per_mo: vercelInvocationOverageM * VERCEL.invocations_overage_usd_per_m,
    },
  ];
  categories.push({
    category: "Vercel (hosting)",
    icon: Cloud,
    lines: vercelLines,
    subtotal_usd: vercelLines.reduce((s, l) => s + l.usd_per_mo, 0),
  });

  // Supabase
  const supabaseStorageGb = a.tenants * a.storage_gb_per_tenant;
  const supabaseStorageOverage = Math.max(0, supabaseStorageGb - SUPABASE.storage_included_gb);
  const supabaseEgressGb = a.tenants * a.egress_gb_per_tenant;
  const supabaseEgressOverage = Math.max(0, supabaseEgressGb - SUPABASE.egress_included_gb);
  const supabaseMau = a.tenants * a.mau_per_tenant;
  const supabaseMauOverage = Math.max(0, supabaseMau - SUPABASE.mau_included);
  const supabaseLines: LineCost[] = [
    {
      label: "Pro plan base",
      formula: `Flat US$${SUPABASE.pro_base_usd_per_mo}/mo`,
      usd_per_mo: SUPABASE.pro_base_usd_per_mo,
    },
    {
      label: "Database compute",
      formula: `Small instance baseline US$${SUPABASE.db_compute_usd_per_mo}/mo (scale up at ~250 tenants)`,
      usd_per_mo: SUPABASE.db_compute_usd_per_mo,
    },
    {
      label: "Storage",
      formula: `${supabaseStorageGb.toFixed(1)}GB used, ${SUPABASE.storage_included_gb}GB included; overage ${supabaseStorageOverage.toFixed(1)}GB × US$${SUPABASE.storage_usd_per_gb}/GB`,
      usd_per_mo: supabaseStorageOverage * SUPABASE.storage_usd_per_gb,
    },
    {
      label: "Egress (bandwidth)",
      formula: `${supabaseEgressGb.toFixed(0)}GB egress, ${SUPABASE.egress_included_gb}GB included; overage ${supabaseEgressOverage.toFixed(0)}GB × US$${SUPABASE.egress_usd_per_gb}/GB`,
      usd_per_mo: supabaseEgressOverage * SUPABASE.egress_usd_per_gb,
    },
    {
      label: "Monthly active users",
      formula: `${supabaseMau.toLocaleString()} MAU, ${SUPABASE.mau_included.toLocaleString()} included; overage ${supabaseMauOverage.toLocaleString()} × US$${SUPABASE.mau_usd_each}`,
      usd_per_mo: supabaseMauOverage * SUPABASE.mau_usd_each,
    },
  ];
  categories.push({
    category: "Supabase (database, auth, storage)",
    icon: Database,
    lines: supabaseLines,
    subtotal_usd: supabaseLines.reduce((s, l) => s + l.usd_per_mo, 0),
  });

  // Anthropic - now reflects the post-optimisation runtime:
  //   1. Haiku is primary; Sonnet only fires as a fallback on the
  //      ~12% of slips Haiku can't crack.
  //   2. Prompt caching: ~80% of input tokens are the cacheable system
  //      prompt + tax rules. Cached tokens bill at 10% of normal rate.
  //   3. Image compression cuts input tokens for the image portion
  //      (already baked into the 4_000 input estimate).
  const totalReceiptScans = a.tenants * a.receipt_scans_per_tenant;
  const totalCsvImports = a.tenants * a.csv_imports_per_tenant;

  // Per-scan input cost factoring prompt caching: cached portion bills
  // at the discounted rate, uncached portion at full rate.
  const cachedFraction = ANTHROPIC.cacheable_input_fraction;
  const uncachedFraction = 1 - cachedFraction;
  const haikuInputCostPerCallUsd =
    (ANTHROPIC.receipt_input_tokens_per_call / 1_000_000) *
    ANTHROPIC.haiku_input_usd_per_m_tokens *
    (cachedFraction * ANTHROPIC.cached_input_discount + uncachedFraction);
  const haikuOutputCostPerCallUsd =
    (ANTHROPIC.receipt_output_tokens_per_call / 1_000_000) *
    ANTHROPIC.haiku_output_usd_per_m_tokens;
  const sonnetInputCostPerCallUsd =
    (ANTHROPIC.receipt_input_tokens_per_call / 1_000_000) *
    ANTHROPIC.sonnet_input_usd_per_m_tokens *
    (cachedFraction * ANTHROPIC.cached_input_discount + uncachedFraction);
  const sonnetOutputCostPerCallUsd =
    (ANTHROPIC.receipt_output_tokens_per_call / 1_000_000) *
    ANTHROPIC.sonnet_output_usd_per_m_tokens;

  const fallbackRate = ANTHROPIC.sonnet_fallback_rate;
  const haikuScans = totalReceiptScans; // every scan starts on Haiku
  const sonnetScans = totalReceiptScans * fallbackRate; // ~12% retry
  const haikuReceiptCost =
    haikuScans * (haikuInputCostPerCallUsd + haikuOutputCostPerCallUsd);
  const sonnetReceiptCost =
    sonnetScans * (sonnetInputCostPerCallUsd + sonnetOutputCostPerCallUsd);

  const haikuCsvCost =
    (totalCsvImports * ANTHROPIC.csv_input_tokens_per_call / 1_000_000) *
      ANTHROPIC.haiku_input_usd_per_m_tokens +
    (totalCsvImports * ANTHROPIC.csv_output_tokens_per_call / 1_000_000) *
      ANTHROPIC.haiku_output_usd_per_m_tokens;

  const aiLines: LineCost[] = [
    {
      label: "Receipt scans · Haiku 4-5 primary",
      formula: `${haikuScans.toLocaleString()} scans @ Haiku rate. Per-scan: US$${(haikuInputCostPerCallUsd + haikuOutputCostPerCallUsd).toFixed(4)} (with ${(cachedFraction * 100).toFixed(0)}% prompt caching)`,
      usd_per_mo: haikuReceiptCost,
    },
    {
      label: "Receipt scans · Sonnet fallback",
      formula: `~${(fallbackRate * 100).toFixed(0)}% of slips retry on Sonnet (Haiku returned 0 lines). ${sonnetScans.toLocaleString("en-ZA", { maximumFractionDigits: 0 })} scans @ Sonnet rate.`,
      usd_per_mo: sonnetReceiptCost,
    },
    {
      label: "CSV imports (Haiku 4-5)",
      formula: `${totalCsvImports.toLocaleString()} imports × ${ANTHROPIC.csv_input_tokens_per_call.toLocaleString()} in + ${ANTHROPIC.csv_output_tokens_per_call.toLocaleString()} out tokens at Haiku rate`,
      usd_per_mo: haikuCsvCost,
    },
  ];
  categories.push({
    category: "Anthropic (AI)",
    icon: Sparkles,
    lines: aiLines,
    subtotal_usd: aiLines.reduce((s, l) => s + l.usd_per_mo, 0),
  });

  // Email (Resend)
  const totalEmails = a.tenants * a.emails_per_tenant;
  let resendCost = 0;
  let resendFormula = "";
  if (totalEmails <= RESEND.free_tier_emails) {
    resendFormula = `${totalEmails.toLocaleString()} ≤ ${RESEND.free_tier_emails.toLocaleString()} (free tier)`;
    resendCost = 0;
  } else if (totalEmails <= RESEND.paid_tier_emails) {
    resendFormula = `${totalEmails.toLocaleString()} on Pro tier (US$${RESEND.paid_tier_usd_per_mo}/mo flat up to ${RESEND.paid_tier_emails.toLocaleString()})`;
    resendCost = RESEND.paid_tier_usd_per_mo;
  } else {
    const overage = totalEmails - RESEND.paid_tier_emails;
    resendFormula = `${totalEmails.toLocaleString()} (Pro US$${RESEND.paid_tier_usd_per_mo} + ${overage.toLocaleString()} overage × US$${RESEND.overage_usd_per_email})`;
    resendCost = RESEND.paid_tier_usd_per_mo + overage * RESEND.overage_usd_per_email;
  }
  const emailLines: LineCost[] = [
    { label: "Transactional email", formula: resendFormula, usd_per_mo: resendCost },
  ];
  categories.push({
    category: "Resend (email)",
    icon: Mail,
    lines: emailLines,
    subtotal_usd: resendCost,
  });

  // Cloudflare DNS - anycast nameservers for every tenant's sending
  // domain. Free plan covers our usage so this is informational; if
  // we ever upgrade for analytics or advanced rules, change the
  // constant and the line updates here.
  const cloudflareLines: LineCost[] = [
    {
      label: "Anycast DNS for tenant sending domains",
      formula: `Free plan, unlimited records, no rate limits at our scale. Adopted to keep Resend domain verification reliable globally.`,
      usd_per_mo: CLOUDFLARE.free_plan_usd_per_mo,
    },
  ];
  categories.push({
    category: "Cloudflare (DNS)",
    icon: Globe,
    lines: cloudflareLines,
    subtotal_usd: cloudflareLines.reduce((s, l) => s + l.usd_per_mo, 0),
  });

  // Google Maps
  const totalAutocompletes = a.tenants * a.places_autocompletes_per_tenant;
  const totalDistanceMatrix = a.tenants * a.distance_matrix_calls_per_tenant;
  const mapsRawCost =
    (totalAutocompletes / 1000) * GOOGLE_MAPS.autocomplete_usd_per_1k +
    (totalDistanceMatrix / 1000) * GOOGLE_MAPS.distance_matrix_usd_per_1k_elements;
  const mapsAfterCredit = Math.max(0, mapsRawCost - GOOGLE_MAPS.monthly_credit_usd);
  const mapsLines: LineCost[] = [
    {
      label: "Places autocomplete + Distance Matrix",
      formula: `Raw US$${mapsRawCost.toFixed(2)} (${totalAutocompletes.toLocaleString()} autocompletes + ${totalDistanceMatrix.toLocaleString()} matrix elements); US$${GOOGLE_MAPS.monthly_credit_usd} monthly credit applied`,
      usd_per_mo: mapsAfterCredit,
    },
  ];
  categories.push({
    category: "Google Maps",
    icon: MapPin,
    lines: mapsLines,
    subtotal_usd: mapsAfterCredit,
  });

  // Fixed
  const fixedLines: LineCost[] = [
    {
      label: "Domain + monitoring",
      formula: `Flat US$${(FIXED.domain_usd_per_mo + FIXED.monitoring_usd_per_mo).toFixed(2)}/mo (domain amortised + Sentry baseline)`,
      usd_per_mo: FIXED.domain_usd_per_mo + FIXED.monitoring_usd_per_mo,
    },
  ];
  categories.push({
    category: "Fixed costs",
    icon: Package,
    lines: fixedLines,
    subtotal_usd: fixedLines.reduce((s, l) => s + l.usd_per_mo, 0),
  });

  const total_usd = categories.reduce((s, c) => s + c.subtotal_usd, 0);
  return { categories, total_usd };
}

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
      const { count } = await supabase
        .from("companies")
        .select("id", { head: true, count: "exact" })
        .not("onboarding_completed_at", "is", null);
      if (cancelled) return;
      const c = count ?? 0;
      setActualTenants(c);
      // Seed the calculator with reality if there's at least one tenant.
      if (c > 0) {
        setAssumptions((a) => ({ ...a, tenants: c }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { categories, total_usd } = useMemo(
    () => computeCosts(assumptions),
    [assumptions],
  );

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
      const sim = computeCosts({ ...assumptions, tenants: n });
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
      <PlatformNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-12 max-w-full">

          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                  Tech-stack costs
                  <InfoTooltip content={"Predict CateringMS's monthly COGS as a function of tenant count and per-tenant usage. Sliders update the projection live, showing where each rand goes, your margin per tenant, and where you cross the next vendor tier."} />
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Unit economics calculator. How much does the platform cost to run, and where does the money go?
                </p>
              </div>
            </div>
            <Link
              href="/admin/platform/pricing-management"
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              Pricing tiers <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Headline numbers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-0 shadow-md bg-gradient-to-br from-emerald-50 to-teal-50">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Monthly platform cost
                </p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  ZAR {total_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  US${total_usd.toFixed(2)} at ZAR {usdToZar.toFixed(2)}/USD
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Cost per tenant
                </p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  ZAR {cost_per_tenant_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  At {assumptions.tenants.toLocaleString()} tenants
                  {actualTenants !== null && actualTenants !== assumptions.tenants && (
                    <span className="ml-1 text-slate-400">(actual: {actualTenants})</span>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card
              className={`border-0 shadow-md ${
                margin_per_tenant_zar > 0
                  ? "bg-gradient-to-br from-amber-50 to-orange-50"
                  : "bg-gradient-to-br from-rose-50 to-red-50"
              }`}
            >
              <CardContent className="p-5">
                <p className={`text-xs font-semibold uppercase tracking-wide ${
                  margin_per_tenant_zar > 0 ? "text-amber-700" : "text-rose-700"
                }`}>
                  Margin per tenant
                </p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  ZAR {margin_per_tenant_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {margin_pct.toFixed(0)}% of ZAR {assumptions.subscription_zar_per_tenant.toLocaleString()} sub
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Total revenue + total margin row */}
          <Card className="border-0 shadow-sm mb-6">
            <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center sm:text-left">
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Tenants</p>
                <p className="text-xl font-bold text-slate-900">{assumptions.tenants.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Monthly revenue</p>
                <p className="text-xl font-bold text-slate-900">
                  ZAR {platform_revenue_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Monthly costs</p>
                <p className="text-xl font-bold text-slate-900">
                  ZAR {total_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-slate-500">Platform margin</p>
                <p className={`text-xl font-bold ${platform_margin_zar > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  ZAR {platform_margin_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Assumptions panel */}
            <Card className="lg:col-span-1 border-0 shadow-md">
              <CardContent className="p-5 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900 mb-1">Assumptions</h2>
                  <p className="text-xs text-slate-500">Adjust these to see how cost changes.</p>
                </div>

                <Section title="Scale">
                  <NumField
                    label="Number of tenants"
                    value={assumptions.tenants}
                    onChange={(v) => setAssumptions({ ...assumptions, tenants: v })}
                    min={1}
                    step={1}
                    tooltip="Active catering companies on the platform. Pulled from companies.onboarding_completed_at IS NOT NULL on first load."
                  />
                  <NumField
                    label="Subscription per tenant (ZAR/mo)"
                    value={assumptions.subscription_zar_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, subscription_zar_per_tenant: v })}
                    min={0}
                    step={100}
                    tooltip="What you charge each tenant per month. Drives margin calculation, not cost."
                  />
                </Section>

                <Section title="Per-tenant usage">
                  <NumField
                    label="Receipt scans / month"
                    value={assumptions.receipt_scans_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, receipt_scans_per_tenant: v })}
                    min={0}
                    tooltip="Slips run through the AI receipt scanner per tenant per month. CAPPED at 60 server-side (src/lib/receiptScanQuota.ts). Default scenario uses the cap as a defensible upper bound. Each call ≈ 4k input + 1.5k output tokens on Haiku 4-5 primary, with a Sonnet fallback for the ~12% of slips Haiku can't crack."
                  />
                  {/* Loud warning when the input exceeds what the
                      quota will actually allow. Without this it's easy
                      to type a stress-test number, see R250k AI spend,
                      and panic - the real number is bounded by the
                      server-side cap, not by what's in this field. */}
                  {assumptions.receipt_scans_per_tenant > RECEIPT_SCAN_QUOTA_CAP && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 -mt-2">
                      <strong>Above the quota cap.</strong> The server hard-caps each tenant at
                       {" "}{RECEIPT_SCAN_QUOTA_CAP} receipt scans / month
                       {" "}(src/lib/receiptScanQuota.ts). A tenant typing more than that gets a
                       {" "}<em>quota exceeded</em> response. The AI call never happens. Real-
                      world spend is bounded by the cap × tenants, regardless of what's in
                      this field. Drop to {RECEIPT_SCAN_QUOTA_CAP} for a defensible projection.
                    </div>
                  )}
                  <NumField
                    label="CSV imports / month"
                    value={assumptions.csv_imports_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, csv_imports_per_tenant: v })}
                    min={0}
                    tooltip="Spreadsheet imports through the AI mapper per tenant per month. Uses Haiku 4-5 (10× cheaper than Sonnet)."
                  />
                  <NumField
                    label="Emails / month"
                    value={assumptions.emails_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, emails_per_tenant: v })}
                    min={0}
                    tooltip="Transactional emails per tenant per month (quotes, invoices, automation, password resets)."
                  />
                  <NumField
                    label="Places autocompletes / month"
                    value={assumptions.places_autocompletes_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, places_autocompletes_per_tenant: v })}
                    min={0}
                    tooltip="Address autocomplete keystrokes against Google Places per tenant per month."
                  />
                  <NumField
                    label="Distance matrix calls / month"
                    value={assumptions.distance_matrix_calls_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, distance_matrix_calls_per_tenant: v })}
                    min={0}
                    tooltip="Delivery-distance lookups per tenant per month. Each quote rendered with venue + kitchen lat/lng counts."
                  />
                  <NumField
                    label="Storage GB / tenant"
                    value={assumptions.storage_gb_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, storage_gb_per_tenant: v })}
                    min={0}
                    step={0.1}
                    tooltip="Avatars, logos, receipt photos, generated PDFs in Supabase Storage per tenant."
                  />
                  <NumField
                    label="Egress GB / tenant"
                    value={assumptions.egress_gb_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, egress_gb_per_tenant: v })}
                    min={0}
                    step={0.5}
                    tooltip="Outbound bandwidth from Supabase per tenant per month, driven by client portal page loads + image fetches."
                  />
                  <NumField
                    label="MAU per tenant"
                    value={assumptions.mau_per_tenant}
                    onChange={(v) => setAssumptions({ ...assumptions, mau_per_tenant: v })}
                    min={0}
                    tooltip="Monthly active users that touch auth (staff + active clients). Supabase MAU billing kicks in at 100k cumulative."
                  />
                  <NumField
                    label="Function invocations (M) / tenant"
                    value={assumptions.function_invocations_per_tenant_m}
                    onChange={(v) => setAssumptions({ ...assumptions, function_invocations_per_tenant_m: v })}
                    min={0}
                    step={0.01}
                    tooltip="Vercel serverless invocations per tenant per month. 0.05M = 50,000, a busy tenant with realtime + a few automations."
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
              </CardContent>
            </Card>

            {/* Cost breakdown */}
            <Card className="lg:col-span-2 border-0 shadow-md">
              <CardContent className="p-5 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900 mb-1">Cost breakdown</h2>
                  <p className="text-xs text-slate-500">
                    Where each rand of monthly spend goes. Click a category for line-by-line
                    formulas.
                  </p>
                </div>

                <div className="space-y-3">
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    const pct = total_usd > 0 ? (cat.subtotal_usd / total_usd) * 100 : 0;
                    return (
                      <details
                        key={cat.category}
                        className="rounded-lg border border-slate-200 bg-white"
                      >
                        <summary className="cursor-pointer p-3 flex items-center gap-3 hover:bg-slate-50 rounded-lg">
                          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-emerald-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{cat.category}</p>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                                style={{ width: `${pct.toFixed(1)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-slate-900">
                              ZAR {(cat.subtotal_usd * usdToZar).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                            </p>
                            <p className="text-[10px] text-slate-500">{pct.toFixed(0)}%</p>
                          </div>
                        </summary>
                        <div className="px-3 pb-3 border-t border-slate-100 divide-y divide-slate-100">
                          {cat.lines.map((line, i) => (
                            <div key={i} className="py-2 flex items-start gap-3 text-xs">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700">{line.label}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{line.formula}</p>
                              </div>
                              <p className="font-mono text-slate-900 font-semibold flex-shrink-0">
                                ZAR {(line.usd_per_mo * usdToZar).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>

                {/* Biggest lever */}
                {biggestCategory && (biggestCategory.subtotal_usd / total_usd) > 0.4 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900">
                      <strong>{biggestCategory.category}</strong> is{" "}
                      {((biggestCategory.subtotal_usd / total_usd) * 100).toFixed(0)}%
                      {" "}of your monthly spend. That&apos;s where the lever is. Caps on free-trial
                      AI scans, image-size limits before storage, or per-tenant rate-limits will
                      move the dial more than anywhere else.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Scaling table */}
          <Card className="mt-6 border-0 shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Cost at scale</h2>
                <InfoTooltip content={"Holds your per-tenant assumptions constant and varies the tenant count. Watch the per-tenant cost drop as fixed costs (Vercel + Supabase base + DB compute) get spread thinner."} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="py-2">Tenants</th>
                      <th className="py-2">Monthly platform cost</th>
                      <th className="py-2">Per-tenant cost</th>
                      <th className="py-2">Per-tenant margin (at ZAR {assumptions.subscription_zar_per_tenant})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scaleScenarios.map((s) => {
                      const margin = assumptions.subscription_zar_per_tenant - s.per_tenant_zar;
                      return (
                        <tr key={s.tenants}>
                          <td className="py-2 font-semibold text-slate-900">
                            {s.tenants.toLocaleString()}
                            {s.tenants === assumptions.tenants && (
                              <Badge variant="outline" className="ml-2 text-[10px]">current</Badge>
                            )}
                          </td>
                          <td className="py-2 font-mono text-slate-700">
                            ZAR {s.monthly_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-2 font-mono text-slate-700">
                            ZAR {s.per_tenant_zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </td>
                          <td className={`py-2 font-mono font-semibold ${margin > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            ZAR {margin.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Footnote on assumptions */}
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              All vendor pricing is captured in named constants at the top of{" "}
              <code className="bg-slate-100 px-1 rounded">src/pages/admin/platform/tech-costs.tsx</code>.
              Update those when a vendor changes their card and the projection here, the recommendations,
              and the per-tenant margin all recompute on the next page load. This is a calculator, not an
              integration. It doesn&apos;t pull live billing from any vendor.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase font-bold tracking-wide text-slate-500">{title}</p>
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
      <Label className="text-xs font-medium text-slate-700 inline-flex items-center gap-1">
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

export default function ProtectedTechCosts() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <TechCostsDashboard />
    </ProtectedRoute>
  );
}
