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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  MapPin,
  Package,
  Calendar,
  RefreshCw
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

function PlatformDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("all");
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
              <p>Loading analytics dashboard...</p>
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
          title="Platform Analytics"
          subtitle="System-wide sales and business metrics"
          icon={Activity}
          actions={
            <>
              <CompanySwitcher />
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px] sm:w-[170px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
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

        {/* Live platform snapshot: only real, live figures (no placeholder metrics). */}
        <PortalCard className="mb-6 sm:mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-brand-primary ring-4 ring-brand-primary/20 animate-pulse" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Live platform snapshot</span>
            </div>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span><span className="font-semibold text-slate-900 dark:text-white tabular-nums">{metrics?.activeCompanies ?? metrics?.activeSubscriptions ?? 0}</span> active companies</span>
              <span><span className="font-semibold text-slate-900 dark:text-white tabular-nums">{metrics?.totalCompanies ?? 0}</span> total tenants</span>
            </div>
        </PortalCard>

        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4 mb-4 sm:mb-6">
          <StatCard
            title="SaaS Revenue (active)"
            value={analyticsService.formatCurrency(metrics?.totalRevenue || 0)}
            subtitle="Sum across active subscriptions"
            icon={DollarSign}
            tooltip="Total recurring revenue from every paying customer, monthly and annual combined.\n\nTrial accounts are excluded since they aren't paying yet."
          />
          <StatCard
            title="Active Customers"
            value={analyticsService.formatNumber(metrics?.activeSubscriptions || 0)}
            subtitle={`${metrics?.totalCustomers || 0} total signups`}
            icon={Users}
            tooltip="Companies on a paid plan today. Trials, cancelled and paused accounts are not counted here.\n\nTotal signups underneath includes everyone who has ever created a tenant."
          />
          <StatCard
            title="Monthly Recurring Revenue"
            value={analyticsService.formatCurrency(metrics?.monthlyRecurringRevenue || 0)}
            subtitle="MRR"
            icon={TrendingUp}
            tooltip="Predictable monthly income from active subscriptions billed each month.\n\nAnnual plans are not included here, they roll into ARR instead."
          />
          <StatCard
            title="Churn Rate"
            value={analyticsService.formatPercentage(metrics?.churnRate || 0)}
            subtitle="Last 30 days"
            icon={Activity}
            tooltip="Share of paying customers who cancelled in the last 30 days.\n\nExpect this number to swing while the customer base is small. One cancellation can move it noticeably."
          />
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 mb-6 sm:mb-8">
          <StatCard
            title="Avg Revenue Per User"
            value={analyticsService.formatCurrency(metrics?.averageRevenuePerUser || 0)}
            subtitle="Per active subscription"
            icon={DollarSign}
            tooltip="Average revenue earned per signed-up tenant, including trials and cancelled accounts.\n\nThis number runs low while trials dominate and rises as more accounts convert to paid."
          />
          <StatCard
            title="Conversion Rate"
            value={analyticsService.formatPercentage(metrics?.conversionRate || 0)}
            subtitle="Trial to paid"
            icon={TrendingUp}
            tooltip="Share of all signups that have turned into a paying subscription.\n\nA healthy target is 30% or more once trials start converting reliably."
          />
          <StatCard
            title="Lifetime Value"
            value={analyticsService.formatCurrency(metrics?.lifetimeValue || 0)}
            subtitle="Estimated LTV"
            icon={Package}
            tooltip="A rough estimate of how much revenue a customer brings in over their lifetime, based on a two-year average tenure.\n\nWorth replacing with a proper cohort-based figure once there's six months of churn history to work with."
          />
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="geography">Geography</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <PortalCard>
                <PortalCardHeader
                  title={
                    <span className="flex items-center gap-2">
                      Customer Growth
                      <InfoTooltip content="New tenant signups each month next to the running platform total, with monthly revenue overlaid.\n\nGrouped by signup month from the companies table." />
                    </span>
                  }
                />
                <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">New customers and cumulative total over time</p>
                  {customerGrowth.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No growth data available yet</p>
                  ) : (
                    <div className="space-y-4">
                      {customerGrowth.slice(-6).map((item) => (
                        <div key={item.month} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{item.month}</p>
                            <p className="text-sm text-slate-600">
                              {item.newCustomers} new • {item.totalCustomers} total
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-brand-primary">
                              {analyticsService.formatCurrency(item.revenue)}
                            </p>
                            <p className="text-xs text-slate-500">revenue</p>
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
                      Subscription Status
                      <InfoTooltip content="A breakdown of every tenant by subscription state, active, trial and cancelled.\n\nPercentages show each bucket as a share of the total customer base." />
                    </span>
                  }
                />
                <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Current subscription distribution</p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-brand-primary/10 rounded-lg border border-brand-primary/20">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-brand-primary flex items-center justify-center">
                          <Users className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Active</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {metrics?.activeSubscriptions || 0}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-brand-primary">
                        {analyticsService.formatPercentage(
                          metrics?.totalCustomers > 0
                            ? (metrics.activeSubscriptions / metrics.totalCustomers) * 100
                            : 0
                        )}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                          <Calendar className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Trial</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {metrics?.trialSubscriptions || 0}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-blue-500">
                        {analyticsService.formatPercentage(
                          metrics?.totalCustomers > 0
                            ? (metrics.trialSubscriptions / metrics.totalCustomers) * 100
                            : 0
                        )}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-rose-50 rounded-lg border border-rose-200">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-rose-500 flex items-center justify-center">
                          <TrendingDown className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Cancelled</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {metrics?.cancelledSubscriptions || 0}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-rose-500">
                        {analyticsService.formatPercentage(
                          metrics?.totalCustomers > 0
                            ? (metrics.cancelledSubscriptions / metrics.totalCustomers) * 100
                            : 0
                        )}
                      </Badge>
                    </div>
                  </div>
              </PortalCard>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Top Customers by Revenue
                    <InfoTooltip content="The ten highest-spending tenants on the platform, ranked by lifetime payments.\n\nUseful for spotting who to look after and where to focus account management." />
                  </span>
                }
              />
              <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Highest spending customers on the platform</p>
                {topCustomers.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No customer data available yet</p>
                ) : (
                  <div className="space-y-3">
                    {topCustomers.map((customer, index) => (
                      <div
                        key={customer.customerId}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-slate-100 text-slate-700 font-bold">
                            #{index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{customer.customerName}</p>
                            <p className="text-sm text-slate-600">{customer.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">
                            {analyticsService.formatCurrency(customer.totalSpent)}
                          </p>
                          <p className="text-xs text-slate-500">{customer.planName}</p>
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
                    Plan Distribution
                    <InfoTooltip content="How tenants and revenue are spread across each subscription plan, Starter, Growth, Scale and Enterprise.\n\nHelpful for seeing which tier is pulling its weight." />
                  </span>
                }
              />
              <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Revenue and customer breakdown by subscription plan</p>
                {planDistribution.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No plan data available yet</p>
                ) : (
                  <div className="space-y-4">
                    {planDistribution.map((plan) => (
                      <div key={plan.planName} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-900">{plan.planName}</p>
                            <p className="text-sm text-slate-600">
                              {plan.count} customers • {analyticsService.formatCurrency(plan.revenue)} revenue
                            </p>
                          </div>
                          <Badge variant="outline">{analyticsService.formatPercentage(plan.percentage)}</Badge>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
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
                    Geographic Distribution
                    <InfoTooltip content="Tenant count and revenue grouped by country and region.\n\nPulled from the country and state set on each company's profile." />
                  </span>
                }
              />
              <p className="-mt-2 mb-3 text-sm text-slate-500 dark:text-slate-400">Customers and revenue by location</p>
                {geoDistribution.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No geographic data available yet</p>
                ) : (
                  <div className="space-y-3">
                    {geoDistribution.map((location) => (
                      <div
                        key={location.country}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="h-5 w-5 text-slate-600" />
                          <div>
                            <p className="font-medium text-slate-900">{location.country}</p>
                            <p className="text-sm text-slate-600">{location.region}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">
                            {location.customerCount} customers
                          </p>
                          <p className="text-sm text-brand-primary">
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

        {/* Audit Logs Section */}
        <div className="mt-12">
          <AuditLogsViewer />
        </div>
      </PortalShell>
    </div>
  );
}
