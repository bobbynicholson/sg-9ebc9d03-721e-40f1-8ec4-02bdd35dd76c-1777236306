import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import Head from "next/head";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  // 🔧 DEV MODE: Show simplified dashboard
  const isDevMode = user?.email === "dev@cateringms.local";

  // Show loading only if we don't have a user yet
  if (!user || loading) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
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

  // 🔧 DEV MODE UI
  if (isDevMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Head>
          <title>Platform dashboard (dev mode) - CateringMS</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>

        <div className="p-6 max-w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                🔧 DEV MODE - Super Admin Dashboard
              </h1>
              <p className="text-slate-600">Full platform access - All companies & settings</p>
            </div>
            <div className="flex items-center gap-4">
              <CompanySwitcher />
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/auth/login")}
              >
                Exit DEV Mode
              </Button>
            </div>
          </div>

          {/* DEV MODE Quick Access Card */}
          <Card className="mb-8 border-2 border-yellow-500 bg-gradient-to-r from-yellow-50 to-orange-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-yellow-500 flex items-center justify-center">
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">🔧 Development Mode Active</h3>
                  <p className="text-sm text-slate-600">You have full super admin access to all features</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2 hover:border-purple-500 hover:bg-purple-50"
                  onClick={() => router.push("/admin/platform/company-database")}
                >
                  <Users className="w-6 h-6 text-purple-600" />
                  <div className="text-left">
                    <div className="font-semibold">Companies</div>
                    <div className="text-xs text-slate-500">View all companies</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2 hover:border-blue-500 hover:bg-blue-50"
                  onClick={() => router.push("/admin/platform/subscription-management")}
                >
                  <DollarSign className="w-6 h-6 text-blue-600" />
                  <div className="text-left">
                    <div className="font-semibold">Subscriptions</div>
                    <div className="text-xs text-slate-500">Manage billing</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2 hover:border-brand-primary hover:bg-brand-primary/10"
                  onClick={() => router.push("/admin/platform/user-management")}
                >
                  <Users className="w-6 h-6 text-brand-primary" />
                  <div className="text-left">
                    <div className="font-semibold">Users</div>
                    <div className="text-xs text-slate-500">Manage all users</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2 hover:border-orange-500 hover:bg-orange-50"
                  onClick={() => router.push("/admin/dashboard")}
                >
                  <Package className="w-6 h-6 text-orange-600" />
                  <div className="text-left">
                    <div className="font-semibold">Test Company</div>
                    <div className="text-xs text-slate-500">View as company admin</div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mock Stats */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <StatCard
              title="Total Revenue"
              value="ZAR 0.00"
              subtitle="No real data in DEV MODE"
              icon={DollarSign}
            />
            <StatCard
              title="Active Companies"
              value="0"
              subtitle="Create companies to see data"
              icon={Users}
            />
            <StatCard
              title="Monthly Recurring Revenue"
              value="ZAR 0.00"
              subtitle="MRR"
              icon={TrendingUp}
            />
            <StatCard
              title="Platform Status"
              value="DEV"
              subtitle="Development Mode"
              icon={Activity}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>🔧 DEV MODE Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm text-slate-600">
                <p>✅ <strong>You're logged in as DEV Super Admin</strong> - You have access to everything</p>
                <p>✅ <strong>No authentication required</strong> - Middleware bypasses all auth checks</p>
                <p>✅ <strong>Access all portals:</strong></p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>/admin/platform/*</strong> - Platform management (current)</li>
                  <li><strong>/admin/*</strong> - Company admin view (test any company)</li>
                  <li><strong>/[company-slug]/admin/*</strong> - Company-specific admin</li>
                  <li><strong>/team-portal/*</strong> - Staff views (driver, kitchen, etc.)</li>
                  <li><strong>/client-portal/*</strong> - Client views</li>
                </ul>
                <p className="mt-4 text-amber-600">
                  <strong>⚠️ Note:</strong> Real analytics data requires actual companies and subscriptions. Create test companies in the Company Database to populate this dashboard.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
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

        {/* Platform Health: compact horizontal strip */}
        <PortalCard className="mb-6 sm:mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-brand-primary ring-4 ring-brand-primary/20 animate-pulse" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                Platform Health
                <InfoTooltip content="A quick health snapshot of the platform.\n\nOnly the active companies number is live right now. The 98% score, response time, ticket count and uptime are placeholders until a monitoring service is connected." />
              </span>
              <span className="text-2xl font-bold text-brand-primary tabular-nums">98%</span>
            </div>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span><span className="font-semibold text-slate-900 dark:text-white">{metrics?.activeCompanies ?? metrics?.activeSubscriptions ?? 0}</span> active companies</span>
              <span><span className="font-semibold text-slate-900 dark:text-white">1.2s</span> avg response</span>
              <span><span className="font-semibold text-slate-900 dark:text-white">3</span> open tickets</span>
              <span><span className="font-semibold text-red-600">0</span> failed payments</span>
              <span>99.9% uptime</span>
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

                    <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-red-500 flex items-center justify-center">
                          <TrendingDown className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Cancelled</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {metrics?.cancelledSubscriptions || 0}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-red-500">
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
                          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-purple-100 text-purple-600 font-bold">
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
                            className="bg-purple-600 h-2 rounded-full transition-all"
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
                          <MapPin className="h-5 w-5 text-purple-600" />
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
