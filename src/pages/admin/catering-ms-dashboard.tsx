import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import Head from "next/head";
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
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  FileText,
  BookOpen
} from "lucide-react";
import { analyticsService } from "@/services/analyticsService";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function CateringMSDashboard() {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <NoIndexMeta />
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-600" />
          <p className="text-slate-600">Loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  const StatCard = ({ 
    title, 
    value, 
    change, 
    changeType, 
    icon: Icon, 
    subtitle 
  }: { 
    title: string; 
    value: string; 
    change?: string; 
    changeType?: "positive" | "negative"; 
    icon: any; 
    subtitle?: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
        <Icon className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        {change && (
          <div className={`flex items-center gap-1 text-xs mt-2 ${
            changeType === "positive" ? "text-green-600" : "text-red-600"
          }`}>
            {changeType === "positive" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {change}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <NoIndexMeta />
      <Head>
        <title>CateringMS Analytics Dashboard - Internal Sales & Metrics</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">CateringMS Analytics</h1>
            <p className="text-slate-600">Internal sales dashboard and business metrics</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
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
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            title="Total Revenue"
            value={analyticsService.formatCurrency(metrics?.totalRevenue || 0)}
            subtitle="All-time earnings"
            icon={DollarSign}
            change="+12.5% from last month"
            changeType="positive"
          />
          <StatCard
            title="Active Customers"
            value={analyticsService.formatNumber(metrics?.activeSubscriptions || 0)}
            subtitle={`${metrics?.totalCustomers || 0} total signups`}
            icon={Users}
            change="+8.2% from last month"
            changeType="positive"
          />
          <StatCard
            title="Monthly Recurring Revenue"
            value={analyticsService.formatCurrency(metrics?.monthlyRecurringRevenue || 0)}
            subtitle="MRR"
            icon={TrendingUp}
            change="+15.3% from last month"
            changeType="positive"
          />
          <StatCard
            title="Churn Rate"
            value={analyticsService.formatPercentage(metrics?.churnRate || 0)}
            subtitle="Last 30 days"
            icon={Activity}
            change="-2.1% from last month"
            changeType="positive"
          />
        </div>

        {/* CMS Management Quick Access */}
        <Card className="mb-8 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              CateringMS Website Content Management
            </CardTitle>
            <CardDescription>
              Manage blog posts and static pages for the CateringMS marketing website
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto p-4 justify-start hover:bg-white hover:border-purple-300"
                onClick={() => router.push("/admin/cms-blog")}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-slate-900 mb-1">Blog Management</p>
                    <p className="text-sm text-slate-600">
                      Create and edit blog posts for cateringms.com
                    </p>
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto p-4 justify-start hover:bg-white hover:border-purple-300"
                onClick={() => router.push("/admin/cms-pages")}
              >
                <div className="flex items-start gap-3 w-full">
                  <div className="h-10 w-10 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-pink-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-slate-900 mb-1">Page Management</p>
                    <p className="text-sm text-slate-600">
                      Create and edit static pages for cateringms.com
                    </p>
                  </div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <StatCard
            title="Average Revenue Per User"
            value={analyticsService.formatCurrency(metrics?.averageRevenuePerUser || 0)}
            subtitle="Per active subscription"
            icon={DollarSign}
          />
          <StatCard
            title="Conversion Rate"
            value={analyticsService.formatPercentage(metrics?.conversionRate || 0)}
            subtitle="Trial to paid"
            icon={TrendingUp}
          />
          <StatCard
            title="Lifetime Value"
            value={analyticsService.formatCurrency(metrics?.lifetimeValue || 0)}
            subtitle="Estimated LTV"
            icon={Package}
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
              <Card>
                <CardHeader>
                  <CardTitle>Customer Growth</CardTitle>
                  <CardDescription>New customers and cumulative total over time</CardDescription>
                </CardHeader>
                <CardContent>
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
                            <p className="font-bold text-green-600">
                              {analyticsService.formatCurrency(item.revenue)}
                            </p>
                            <p className="text-xs text-slate-500">revenue</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Subscription Status</CardTitle>
                  <CardDescription>Current subscription distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center">
                          <Users className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Active</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {metrics?.activeSubscriptions || 0}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-500">
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
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Customers by Revenue</CardTitle>
                <CardDescription>Highest spending customers on the platform</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plan Distribution</CardTitle>
                <CardDescription>Revenue and customer breakdown by subscription plan</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geography" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Geographic Distribution</CardTitle>
                <CardDescription>Customers and revenue by location</CardDescription>
              </CardHeader>
              <CardContent>
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
                          <p className="text-sm text-green-600">
                            {analyticsService.formatCurrency(location.revenue)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
