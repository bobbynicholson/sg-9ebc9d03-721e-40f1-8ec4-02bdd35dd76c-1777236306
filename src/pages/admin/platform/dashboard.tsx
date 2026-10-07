import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import Head from "next/head";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  MapPin,
  Calendar,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Hourglass,
} from "lucide-react";
import { analyticsService } from "@/services/analyticsService";
import { CompanySwitcher } from "@/components/admin/CompanySwitcher";
import { AuditLogsViewer } from "@/components/admin/platform/AuditLogsViewer";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

const StatCard = ({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative";
  icon: any;
  subtitle?: string;
  tooltip?: string;
}) => (
  <StatTile
    label={title}
    value={value}
    hint={subtitle}
    icon={Icon}
    trend={change ? { label: change, dir: changeType === "negative" ? "down" : "up" } : undefined}
  />
);

// Wave 24: super_admin gate. The platform dashboard reads tenant-
// wide aggregates (companies, MRR, plan distribution, geo). RLS on
// companies + platform_pricing_plans should restrict per-tenant
// reads, but the page also embeds CompanySwitcher + AuditLogsViewer
// which are super-admin-only surfaces. Wrapping at the page level
// matches the pattern used by audit-logs.tsx, financial-dashboard.tsx
// and the rest of the platform/* tree.
export default function ProtectedPlatformDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PlatformDashboard />
    </ProtectedRoute>
  );
}

// "2026-04" -> "Apr 2026"; anything else is shown as-is.
const monthLabel = (m: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(m || "");
  if (!match) return m;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
};

interface AttentionCounts {
  stuckSetup: number;
  noPayments: number;
  trialsEnding: number;
  overdue: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Read-only counts for the "Needs attention" card, using the same rules
// as Company health, Payment issues, Trials and Subscriptions.
async function loadAttentionCounts(): Promise<AttentionCounts> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, created_at, onboarding_completed_at, subscription_status, trial_ends_at")
    .is("deleted_at", null);
  if (error) throw error;
  const companies = (data || []) as Array<{
    id: string;
    created_at: string | null;
    onboarding_completed_at: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
  }>;
  const onboardedIds = companies.filter((c) => c.onboarding_completed_at).map((c) => c.id);
  const { data: gateways, error: gatewayError } = onboardedIds.length
    ? await supabase
        .from("payment_gateways")
        .select("company_id, is_active")
        .in("company_id", onboardedIds)
        .is("deleted_at", null)
    : { data: [], error: null };
  if (gatewayError) throw gatewayError;
  const connected = new Set(
    ((gateways || []) as Array<{ company_id: string; is_active: boolean | null }>)
      .filter((g) => g.is_active)
      .map((g) => g.company_id),
  );
  const now = Date.now();
  return {
    stuckSetup: companies.filter(
      (c) => !c.onboarding_completed_at && c.created_at && now - new Date(c.created_at).getTime() > 7 * DAY_MS,
    ).length,
    noPayments: onboardedIds.filter((id) => !connected.has(id)).length,
    trialsEnding: companies.filter(
      (c) => c.subscription_status === "trial" && c.trial_ends_at && new Date(c.trial_ends_at).getTime() - now <= 7 * DAY_MS,
    ).length,
    overdue: companies.filter((c) => c.subscription_status === "past_due").length,
  };
}

function PlatformDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attention, setAttention] = useState<AttentionCounts | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [customerGrowth, setCustomerGrowth] = useState<any[]>([]);
  const [planDistribution, setPlanDistribution] = useState<any[]>([]);
  const [geoDistribution, setGeoDistribution] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [
        metricsData,
        growthData,
        plansData,
        geoData,
        customersData
      ] = await Promise.all([
        analyticsService.getDashboardMetrics(),
        analyticsService.getCustomerGrowth(),
        analyticsService.getPlanDistribution(),
        analyticsService.getGeographicDistribution(),
        analyticsService.getTopCustomers(10)
      ]);

      setMetrics(metricsData);
      setCustomerGrowth(growthData);
      setPlanDistribution(plansData);
      setGeoDistribution(geoData);
      setTopCustomers(customersData);
      // The attention card is a helper: if it fails, the card stays
      // hidden and the rest of the dashboard still shows.
      loadAttentionCounts().then(setAttention).catch((attentionError) => {
        console.error("Error loading attention counts:", attentionError);
        setAttention(null);
      });
    } catch (error: any) {
      console.error("Error loading dashboard data:", error);
      // Silent-failure audit: a failed load used to render an all-zero
      // dashboard that looked like an empty platform. Flag it instead.
      setLoadError(
        error?.message || "Couldn't load the platform analytics. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  // Show loading only if we don't have a user yet
  if (!user || loading) {
    return (
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalCard className="flex items-center justify-center py-16">
            <div className="text-center text-slate-500 dark:text-slate-400">
              <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin" />
              <p>Loading dashboard...</p>
            </div>
          </PortalCard>
        </PortalShell>
      </div>
    );
  }

  return (
    <div className="admin-page-shell">
      <Head>
        <title>Platform dashboard - CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <PlatformNav />

      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          variant="hero"
          title="Dashboard"
          subtitle="How the platform is doing today, and which companies need you."
          icon={Activity}
          meta={
            metrics ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {metrics?.activeCompanies ?? metrics?.activeSubscriptions ?? 0} active companies
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {metrics?.totalCompanies ?? 0} companies in total
                </span>
              </>
            ) : undefined
          }
          actions={
            <>
              <CompanySwitcher />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </>
          }
        />
        <PageWorkbench />

        {/* Load-failure banner: without it a failed fetch rendered
            zeroed tiles indistinguishable from an empty platform. */}
        {loadError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={loadDashboardData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {attention && (() => {
          const items = [
            { key: "overdue", count: attention.overdue, label: "Overdue payments", hint: "Subscription failed or late", href: "/admin/platform/subscription-management", icon: AlertTriangle, urgent: true },
            { key: "trials", count: attention.trialsEnding, label: "Trials ending", hint: "Within 7 days: convert or extend", href: "/admin/platform/trial-management", icon: Hourglass, urgent: false },
            { key: "payments", count: attention.noPayments, label: "No card payments", hint: "Online payments not connected", href: "/admin/platform/payment-issues", icon: CreditCard, urgent: false },
            { key: "setup", count: attention.stuckSetup, label: "Stuck in setup", hint: "Signed up 7+ days ago", href: "/admin/platform/tenant-health", icon: Users, urgent: false },
          ];
          const openCount = items.filter((item) => item.count > 0).length;
          return (
            <PortalCard id="platform-attention" className="mb-4">
              <PortalCardHeader
                title="Needs attention"
                description={openCount ? `${openCount} ${openCount === 1 ? "thing" : "things"} to look at` : undefined}
              />
              {openCount === 0 ? (
                <div className="flex items-center gap-3 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  All clear: no overdue payments, ending trials, payment setup gaps or stuck sign-ups.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = item.count > 0;
                    const tone = !active
                      ? "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      : item.urgent
                        ? "border-rose-200 bg-rose-50/70 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                        : "border-amber-200 bg-amber-50/70 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10";
                    const iconTone = !active ? "text-slate-400" : item.urgent ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`group flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${tone}`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${iconTone}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900 dark:text-white">{item.label}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{active ? item.hint : "None right now"}</span>
                        </span>
                        <span className={`text-lg font-semibold tabular-nums ${active ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>{item.count}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </PortalCard>
          );
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard
            title="Monthly revenue"
            value={analyticsService.formatCurrency(metrics?.monthlyRecurringRevenue || 0)}
            subtitle="Recurring, from monthly plans"
            icon={TrendingUp}
          />
          <StatCard
            title="Paying companies"
            value={analyticsService.formatNumber(metrics?.activeSubscriptions || 0)}
            subtitle={`${metrics?.totalCustomers || 0} signed up in total`}
            icon={Users}
          />
          <StatCard
            title="Trial to paid"
            value={analyticsService.formatPercentage(metrics?.conversionRate || 0)}
            subtitle="Share of sign-ups now paying"
            icon={CheckCircle2}
          />
          <StatCard
            title="Cancelled (30 days)"
            value={analyticsService.formatPercentage(metrics?.churnRate || 0)}
            subtitle="Share of paying companies lost"
            icon={TrendingDown}
          />
        </div>

        {/* Secondary numbers: one quiet strip instead of three more tiles. */}
        <div className="mb-6 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/95">
          {[
            { label: "Revenue from active plans", value: analyticsService.formatCurrency(metrics?.totalRevenue || 0), tip: "Total recurring revenue from every paying company, monthly and annual combined. Trials are excluded." },
            { label: "Average per company", value: analyticsService.formatCurrency(metrics?.averageRevenuePerUser || 0), tip: "Average revenue per signed-up company, including trials and cancelled accounts." },
            { label: "Lifetime value (estimate)", value: analyticsService.formatCurrency(metrics?.lifetimeValue || 0), tip: "Rough revenue per company over its lifetime, based on a two-year average stay." },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                {row.label}
                <InfoTooltip content={row.tip} />
              </span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{row.value}</span>
            </div>
          ))}
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger id="platform-overview" data-chat-section="platform.dashboard.overview" data-chat-section-label="Platform overview" value="overview">Overview</TabsTrigger>
            <TabsTrigger id="platform-customers" data-chat-section="platform.dashboard.customers" data-chat-section-label="Platform customers" value="customers">Top companies</TabsTrigger>
            <TabsTrigger id="platform-plans" data-chat-section="platform.dashboard.plans" data-chat-section-label="Platform plans" value="plans">Plans</TabsTrigger>
            <TabsTrigger id="platform-geography" data-chat-section="platform.dashboard.geography" data-chat-section-label="Platform geography" value="geography">Geography</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <PortalCard>
                <PortalCardHeader
                  title={
                    <span className="flex items-center gap-2">
                      Sign-ups by month
                      <InfoTooltip content="New tenant signups each month next to the running platform total, with monthly revenue overlaid.\n\nGrouped by signup month from the companies table." />
                    </span>
                  }
                />
                <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">New companies each month and the running total</p>
                  {customerGrowth.length === 0 ? (
                    <p className="text-center text-slate-500 dark:text-slate-400 py-8">No growth data available yet</p>
                  ) : (
                    <div className="space-y-4">
                      {customerGrowth.slice(-6).map((item) => (
                        <div key={item.month} className="flex items-center justify-between rounded-lg -mx-2 px-2 py-1.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{monthLabel(item.month)}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              {item.newCustomers} new • {item.totalCustomers} total
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold tabular-nums text-slate-900 dark:text-white">
                              {analyticsService.formatCurrency(item.revenue)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">revenue</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </PortalCard>

              <PortalCard>
                <PortalCardHeader
                  title={
                    <span className="flex items-center gap-2">
                      Subscription mix
                      <InfoTooltip content="A breakdown of every tenant by subscription state, active, trial and cancelled.\n\nPercentages show each bucket as a share of the total customer base." />
                    </span>
                  }
                />
                <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Where every company stands today</p>
                  {(() => {
                    const total = Number(metrics?.totalCustomers || 0);
                    const rows = [
                      { label: "Active", count: Number(metrics?.activeSubscriptions || 0), dot: "bg-emerald-500", icon: Users },
                      { label: "Trial", count: Number(metrics?.trialSubscriptions || 0), dot: "bg-sky-500", icon: Calendar },
                      { label: "Cancelled", count: Number(metrics?.cancelledSubscriptions || 0), dot: "bg-slate-400", icon: TrendingDown },
                    ];
                    const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);
                    return (
                      <div className="space-y-4">
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          {rows.map((row) => (
                            <div key={row.label} className={row.dot} style={{ width: `${share(row.count)}%` }} />
                          ))}
                        </div>
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          {rows.map((row) => {
                            const Icon = row.icon;
                            return (
                              <li key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                                <span className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                                  <span className={`h-2.5 w-2.5 rounded-full ${row.dot}`} />
                                  <Icon className="h-4 w-4 text-slate-400" />
                                  {row.label}
                                </span>
                                <span className="flex items-baseline gap-2">
                                  <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{row.count}</span>
                                  <span className="w-12 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                    {analyticsService.formatPercentage(share(row.count))}
                                  </span>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}
              </PortalCard>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Top companies by revenue
                    <InfoTooltip content="The ten highest-spending tenants on the platform, ranked by lifetime payments.\n\nUseful for spotting who to look after and where to focus account management." />
                  </span>
                }
              />
              <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Companies that have paid the most</p>
                {topCustomers.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-8">No customer data available yet</p>
                ) : (
                  <div className="space-y-3">
                    {topCustomers.map((customer, index) => (
                      <div
                        key={customer.customerId}
                        className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold">
                            #{index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{customer.customerName}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{customer.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {analyticsService.formatCurrency(customer.totalSpent)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{customer.planName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </PortalCard>
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Plans
                    <InfoTooltip content="How tenants and revenue are spread across each subscription plan, Starter, Growth, Scale and Enterprise.\n\nHelpful for seeing which tier is pulling its weight." />
                  </span>
                }
              />
              <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Companies and revenue on each plan</p>
                {planDistribution.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-8">No plan data available yet</p>
                ) : (
                  <div className="space-y-4">
                    {planDistribution.map((plan) => (
                      <div key={plan.planName} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{plan.planName}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              {plan.count} {plan.count === 1 ? "company" : "companies"} • {analyticsService.formatCurrency(plan.revenue)} revenue
                            </p>
                          </div>
                          <Badge variant="outline">{analyticsService.formatPercentage(plan.percentage)}</Badge>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                          <div
                            className="bg-brand-primary h-2 rounded-full transition-all"
                            style={{ width: `${plan.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </PortalCard>
          </TabsContent>

          <TabsContent value="geography" className="space-y-6">
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Where companies are
                    <InfoTooltip content="Tenant count and revenue grouped by country and region.\n\nPulled from the country and state set on each company's profile." />
                  </span>
                }
              />
              <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Companies and revenue by country</p>
                {geoDistribution.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-8">No geographic data available yet</p>
                ) : (
                  <div className="space-y-3">
                    {geoDistribution.map((location) => (
                      <div
                        key={location.country}
                        className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{location.country}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{location.region}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {location.customerCount} {location.customerCount === 1 ? "company" : "companies"}
                          </p>
                          <p className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
                            {analyticsService.formatCurrency(location.revenue)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </PortalCard>
          </TabsContent>
        </Tabs>

        {/* Audit log folds away: 100 rows used to make this page 6,500px tall. */}
        <details className="group mt-8 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-base font-semibold text-slate-900 dark:text-white">Recent activity</span>
              <span className="block text-xs text-slate-500">Latest 100 platform events. Open to view, or use Activity log to search and filter.</span>
            </span>
            <span className="text-xs font-medium text-slate-600 group-open:hidden">Show</span>
            <span className="hidden text-xs font-medium text-slate-600 group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-slate-100 p-2 dark:border-slate-800">
            <AuditLogsViewer />
          </div>
        </details>
      </PortalShell>
    </div>
  );
}
