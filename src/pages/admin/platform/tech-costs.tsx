/**
 * /admin/platform/tech-costs
 *
 * What CateringMS costs to run, from real records only:
 *   - companies, plan revenue and the USD/ZAR rate from the database
 *   - emails, assistant questions, receipt scans and EFT proofs from the
 *     last 30 days
 *   - this month's AI spend, logged per call in ai_usage_events and
 *     refreshed every 30 seconds while the page is open
 *   - each AI feature's provider order, models and exact prices
 *     (src/components/admin/platform/AiModelPrices.tsx)
 *
 * Vendor prices and the math live in src/lib/techCosts/model.ts (shared
 * with the assistant); the data comes from GET /api/platform/tech-costs.
 */
import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile, PageWorkbench } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import {
  Calculator, Cloud, Database, Sparkles, Mail, MapPin, Package, CreditCard,
  Info, ExternalLink, RefreshCw, AlertTriangle, Activity,
} from "lucide-react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  ALL_PRICING_LINKS,
  PRICES_CHECKED,
  type CostCategoryKey,
  type PricingLink,
} from "@/lib/techCosts/model";
import type { LiveTechCostData } from "@/services/platformTechnologyCostService";
import type { AiRoute } from "@/server/ai/routes";
import type { LivePrices } from "@/lib/techCosts/model";
import { AiModelPrices } from "@/components/admin/platform/AiModelPrices";

type TechCostsResponse = LiveTechCostData & {
  aiRoutes: AiRoute[];
  openrouterPrices: LivePrices;
  openrouterPricesFetchedAt: string | null;
};

const REFRESH_MS = 30_000;

const CATEGORY_ICONS: Record<CostCategoryKey, typeof Cloud> = {
  hosting: Cloud,
  database: Database,
  ai: Sparkles,
  email: Mail,
  maps: MapPin,
  payments: CreditCard,
  fixed: Package,
};

const FEATURE_LABELS: Record<string, string> = {
  chat_reply: "Assistant replies",
  chat_intent: "Assistant question routing",
  embeddings: "Knowledge search",
  knowledge_review: "Knowledge upload review",
  column_matching: "Client import column matching",
  import_row_repair: "Import row repair",
  receipt_scan: "Receipt scans",
  eft_proof: "EFT proof checks",
  blog_draft: "Blog drafts",
  brand_palette: "Brand palettes",
};
const featureLabel = (key: string) => FEATURE_LABELS[key] ?? key.replace(/_/g, " ");

const zar = (usd: number, fx: number) => `ZAR ${(usd * fx).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const zarWhole = (amount: number) => `ZAR ${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
const usd = (n: number) => `US$${n < 1 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;

function TechCostsDashboard() {
  const [data, setData] = useState<TechCostsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/platform/tech-costs", { credentials: "include", cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
      setData(body as TechCostsResponse);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load costs");
    } finally {
      setLoading(false);
    }
  }, []);

  // Live refresh while the tab is visible, so new AI calls show up.
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const fx = data?.usdToZar ?? 0;
  const totalUsd = data?.costs.total_usd ?? 0;
  const revenue = data?.inputs.revenue_zar ?? 0;
  const costZar = totalUsd * fx;
  const margin = revenue - costZar;
  const companies = data?.inputs.companies ?? 0;
  const ai = data?.ai;

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
                <InfoTooltip content={"What the platform costs to run this month, worked out from real records and each vendor's published prices. AI spend is logged per call and refreshes every 30 seconds."} />
              </span>
            }
            subtitle="Real numbers from platform records. AI spend updates live."
            icon={Calculator}
            meta={data ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {companies} onboarded {companies === 1 ? "company" : "companies"} ({data.companiesTotal} total)
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {zarWhole(costZar)} / month
                </span>
                {updatedAt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Updated {updatedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </>
            ) : undefined}
            actions={
              <Button variant="outline" className="gap-1" onClick={() => { setLoading(true); void load(); }} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            }
          />
          <PageWorkbench />

          {error && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </div>
          )}

          {!data && loading && (
            <PortalCard className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading platform costs…</PortalCard>
          )}

          {data && (
            <>
              {/* Headline numbers */}
              <div id="tenant-cost" data-chat-section="platform.tech-costs.tenant-cost" data-chat-section-label="Cost per company" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile
                  label="Monthly platform cost"
                  value={zarWhole(costZar)}
                  hint={`${usd(totalUsd)} at ZAR ${fx.toFixed(2)}/USD${data.fxDate ? ` (${data.fxDate})` : " (default rate)"}`}
                />
                <StatTile
                  label="Subscription revenue"
                  value={zarWhole(revenue)}
                  hint={`${data.inputs.paying_companies} paying ${data.inputs.paying_companies === 1 ? "company" : "companies"} on a priced plan`}
                />
                <StatTile
                  label="Margin"
                  value={<span className={margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{zarWhole(margin)}</span>}
                  hint={revenue > 0 ? `${((margin / revenue) * 100).toFixed(0)}% of revenue` : "No subscription revenue yet"}
                />
                <StatTile
                  label="Cost per company"
                  value={companies > 0 ? zarWhole(costZar / companies) : "-"}
                  hint={`${companies} onboarded ${companies === 1 ? "company" : "companies"}`}
                />
              </div>

              {/* Live AI spend */}
              <PortalCard id="ai-spend" data-chat-section="platform.tech-costs.trend" data-chat-section-label="Live AI spend" className="mb-6">
                <PortalCardHeader
                  title={
                    <>
                      <Activity className="w-4 h-4 text-brand-primary" />
                      AI spend this month (live)
                      <InfoTooltip content={"Every AI call - assistant, imports, receipt scans, EFT proof checks - is logged with its model and tokens and priced from the vendor rates below. Refreshes every 30 seconds."} />
                    </>
                  }
                />
                {!ai?.available ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Live AI tracking is not switched on yet.</strong> Run
                      {" "}<code className="font-mono break-all">supabase/migrations/20261007090000_ai_usage_events.sql</code> in the
                      Supabase SQL editor. Every AI call is logged from then on. Until then the AI line below is an
                      estimate from the last 30 days of usage.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <Metric label="This month" value={zar(ai.cost_usd, fx)} hint={usd(ai.cost_usd)} />
                      <Metric label="Today" value={zar(ai.today_cost_usd, fx)} hint={usd(ai.today_cost_usd)} />
                      <Metric label="AI calls" value={ai.calls.toLocaleString()} hint={`${ai.failed} failed`} />
                      <Metric label="Tokens" value={(ai.tokens_in + ai.tokens_out).toLocaleString()} hint={`${ai.tokens_in.toLocaleString()} in · ${ai.tokens_out.toLocaleString()} out`} />
                    </div>
                    {ai.calls === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">No AI calls yet this month. They appear here as soon as someone uses an AI feature.</p>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <UsageTable title="By feature" rows={ai.byFeature.map((r) => ({ ...r, label: featureLabel(r.key) }))} fx={fx} />
                        <UsageTable title="By model" rows={ai.byModel.map((r) => ({ ...r, label: r.key }))} fx={fx} />
                        <div className="lg:col-span-2">
                          <p className="text-[10px] uppercase font-bold tracking-wide text-slate-500 dark:text-slate-400 mb-2">Latest calls</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                  <th className="py-1.5 pr-3">Time</th>
                                  <th className="py-1.5 pr-3">Feature</th>
                                  <th className="py-1.5 pr-3">Company</th>
                                  <th className="py-1.5 pr-3">Model</th>
                                  <th className="py-1.5 pr-3 text-right">Tokens</th>
                                  <th className="py-1.5 text-right">Cost</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {ai.recent.map((r, i) => (
                                  <tr key={i} className={r.success ? "" : "text-rose-700 dark:text-rose-400"}>
                                    <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                                    <td className="py-1.5 pr-3">{featureLabel(r.feature)}{r.success ? "" : " (failed)"}</td>
                                    <td className="py-1.5 pr-3">{r.company ?? "Platform"}</td>
                                    <td className="py-1.5 pr-3 font-mono">{r.model}</td>
                                    <td className="py-1.5 pr-3 text-right font-mono">{(r.tokens_in + r.tokens_out).toLocaleString()}</td>
                                    <td className="py-1.5 text-right font-mono">{zar(r.cost_usd, fx)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </PortalCard>

              <div id="ai-models" data-chat-section="platform.tech-costs.ai-models" data-chat-section-label="AI models and prices">
                <AiModelPrices
                  routes={data.aiRoutes ?? []}
                  livePrices={data.openrouterPrices ?? {}}
                  liveFetchedAt={data.openrouterPricesFetchedAt ?? null}
                  featureLabel={featureLabel}
                  usdToZar={fx}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Cost breakdown */}
                <PortalCard id="margin-analysis" data-chat-section="platform.tech-costs.margin" data-chat-section-label="Cost breakdown" className="lg:col-span-2 space-y-4">
                  <div>
                    <PortalCardHeader title="Cost breakdown" className="mb-1" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Each vendor the platform runs on. Open one for the working and its official pricing page.</p>
                  </div>
                  <div className="space-y-3">
                    {data.costs.categories.map((cat) => {
                      const Icon = CATEGORY_ICONS[cat.key];
                      const pct = totalUsd > 0 ? (cat.subtotal_usd / totalUsd) * 100 : 0;
                      return (
                        <details key={cat.key} className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                          <summary className="cursor-pointer p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg">
                            <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-5 h-5 text-brand-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {cat.category}
                                {cat.key === "ai" && (
                                  <span className="ml-2 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{data.costs.ai_is_actual ? "tracked" : "estimate"}</span>
                                )}
                              </p>
                              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1.5">
                                <div className="h-full bg-brand-primary" style={{ width: `${pct.toFixed(1)}%` }} />
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{zar(cat.subtotal_usd, fx)}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">{pct.toFixed(0)}%</p>
                            </div>
                          </summary>
                          <div className="px-3 pb-3 border-t border-slate-100 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800">
                            {cat.lines.map((line, i) => (
                              <div key={i} className="py-2 flex items-start gap-3 text-xs">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-slate-700 dark:text-slate-300">{line.label}</p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{line.formula}</p>
                                </div>
                                <p className="font-mono text-slate-900 dark:text-white font-semibold flex-shrink-0">{zar(line.usd_per_mo, fx)}</p>
                              </div>
                            ))}
                            {cat.links.length > 0 && (
                              <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Official pricing:</span>
                                {cat.links.map((l) => <PriceLink key={l.url} link={l} />)}
                              </div>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </PortalCard>

                {/* Where the numbers come from */}
                <PortalCard className="space-y-3">
                  <PortalCardHeader title="From platform records" className="mb-0" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">The usage these costs are worked out from. Counts cover the last 30 days.</p>
                  <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    <Fact label="Onboarded companies" value={`${companies} of ${data.companiesTotal}`} />
                    <Fact label="Active / on trial" value={`${data.activeCompanies} / ${data.trialCompanies}`} />
                    <Fact label="Paying companies" value={String(data.inputs.paying_companies)} />
                    <Fact label="User accounts" value={data.inputs.users.toLocaleString()} />
                    <Fact label="Emails sent" value={data.inputs.emails.toLocaleString()} />
                    <Fact label="Assistant questions" value={data.inputs.chat_messages.toLocaleString()} />
                    <Fact label="Receipt scans" value={data.inputs.receipt_scans.toLocaleString()} />
                    <Fact label="EFT proofs checked" value={data.inputs.eft_proofs.toLocaleString()} />
                    <Fact label="USD → ZAR" value={`${fx.toFixed(2)}${data.fxDate ? ` (${data.fxDate})` : ""}`} />
                  </dl>
                </PortalCard>
              </div>

              {/* Vendor pricing pages */}
              <PortalCard id="pricing-sources" data-chat-section="platform.tech-costs.pricing-sources" data-chat-section-label="Vendor pricing pages" className="mb-6">
                <PortalCardHeader
                  title={
                    <>
                      <ExternalLink className="w-4 h-4 text-brand-primary" />
                      Vendor pricing pages
                    </>
                  }
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Prices checked {PRICES_CHECKED}. Vendors bill in USD, ex VAT; PayFast bills in ZAR.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                  {ALL_PRICING_LINKS.map((l) => <PriceLink key={l.url} link={l} />)}
                </div>
              </PortalCard>

              <PortalCard className="p-4 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Vendor bills are not connected. AI spend is tracked per call; hosting, database, email, maps and
                  card fees are worked out from the records above and each vendor&apos;s published prices
                  (src/lib/techCosts/model.ts).
                </p>
              </PortalCard>
            </>
          )}
        </PortalShell>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-[11px] uppercase font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

function UsageTable({ title, rows, fx }: { title: string; rows: Array<{ label: string; calls: number; failed: number; tokens_in: number; tokens_out: number; cost_usd: number }>; fx: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold tracking-wide text-slate-500 dark:text-slate-400 mb-2">{title}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <th className="py-1.5 pr-3"> </th>
            <th className="py-1.5 pr-3 text-right">Calls</th>
            <th className="py-1.5 pr-3 text-right">Tokens</th>
            <th className="py-1.5 text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300 break-all">{r.label}</td>
              <td className="py-1.5 pr-3 text-right font-mono">{r.calls.toLocaleString()}{r.failed ? <span className="text-rose-600"> ({r.failed} failed)</span> : null}</td>
              <td className="py-1.5 pr-3 text-right font-mono">{(r.tokens_in + r.tokens_out).toLocaleString()}</td>
              <td className="py-1.5 text-right font-mono">{zar(r.cost_usd, fx)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

function PriceLink({ link }: { link: PricingLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary hover:underline break-all"
    >
      {link.label}
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
    </a>
  );
}

export default function ProtectedTechCosts() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <TechCostsDashboard />
    </ProtectedRoute>
  );
}
