import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown,
  Users, 
  FileText, 
  DollarSign,
  Calendar,
  Package,
  Award,
  Target,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Filter,
  Download
} from "lucide-react";

export default function AdminDashboardPage() {
  const [dateRange, setDateRange] = useState("last_30_days");

  // Mock data - would come from Supabase in production
  const leadMetrics = {
    total: 142,
    converted: 67,
    conversionRate: 47.2,
    avgLeadValue: 8450,
    trending: "up"
  };

  const revenueMetrics = {
    total: 456780,
    avgOrderValue: 6814,
    projectedMonth: 520000,
    growth: 12.4
  };

  const topProducts = [
    { name: "Lamb Spit Braai", orders: 45, revenue: 135000, margin: 28.5 },
    { name: "Chicken Spit Braai", orders: 38, revenue: 95000, margin: 32.1 },
    { name: "Pork Spit Braai", orders: 32, revenue: 96000, margin: 30.2 },
    { name: "Traditional Potjie", orders: 28, revenue: 84000, margin: 35.4 },
    { name: "Vegetarian Platter", orders: 24, revenue: 48000, margin: 38.2 }
  ];

  const marginAnalysis = {
    highest: { name: "Vegetarian Platter", margin: 38.2, revenue: 48000 },
    lowest: { name: "Beef Rib Braai", margin: 18.5, revenue: 74000 }
  };

  const topClients = [
    { name: "Sandton Convention Centre", orders: 12, totalSpend: 145800, avgOrder: 12150 },
    { name: "Cape Town Corporate Events", orders: 9, totalSpend: 98500, avgOrder: 10944 },
    { name: "Johannesburg Weddings Ltd", orders: 11, totalSpend: 92400, avgOrder: 8400 },
    { name: "Durban Functions Co", orders: 7, totalSpend: 78900, avgOrder: 11271 },
    { name: "Pretoria Event Planners", orders: 8, totalSpend: 72600, avgOrder: 9075 }
  ];

  const dateRanges = [
    { value: "today", label: "Today" },
    { value: "last_7_days", label: "Last 7 Days" },
    { value: "last_30_days", label: "Last 30 Days" },
    { value: "last_90_days", label: "Last 90 Days" },
    { value: "this_year", label: "This Year" }
  ];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 0
    }).format(amount);
  };

  const exportData = () => {
    alert("Export functionality would download CSV/Excel file with all dashboard data");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Analytics Dashboard
              </h1>
              <p className="text-slate-600 mt-1">Comprehensive insights into your catering business</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2">
                <Filter className="w-4 h-4 text-slate-600" />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="border-0 focus:outline-none text-sm bg-transparent"
                >
                  {dateRanges.map((range) => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={exportData} className="bg-gradient-to-r from-purple-500 to-pink-500">
                <Download className="w-4 h-4 mr-2" />
                Export Data
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <p className="text-blue-100 text-sm mb-1">Total Leads</p>
                  <p className="text-4xl font-bold">{leadMetrics.total}</p>
                  <div className="flex items-center gap-1 mt-2">
                    {leadMetrics.trending === "up" ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : (
                      <ArrowDown className="w-4 h-4" />
                    )}
                    <span className="text-sm">+15% vs last period</span>
                  </div>
                </div>
                <Users className="w-12 h-12 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <p className="text-green-100 text-sm mb-1">Conversion Rate</p>
                  <p className="text-4xl font-bold">{leadMetrics.conversionRate}%</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUp className="w-4 h-4" />
                    <span className="text-sm">+3.2% improvement</span>
                  </div>
                </div>
                <Target className="w-12 h-12 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <p className="text-purple-100 text-sm mb-1">Total Revenue</p>
                  <p className="text-4xl font-bold">{formatCurrency(revenueMetrics.total)}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm">+{revenueMetrics.growth}% growth</span>
                  </div>
                </div>
                <DollarSign className="w-12 h-12 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-orange-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <p className="text-orange-100 text-sm mb-1">Avg Order Value</p>
                  <p className="text-4xl font-bold">{formatCurrency(revenueMetrics.avgOrderValue)}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUp className="w-4 h-4" />
                    <span className="text-sm">+8.5% increase</span>
                  </div>
                </div>
                <BarChart3 className="w-12 h-12 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                Popular Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 px-3 py-1">
                        #{index + 1}
                      </Badge>
                      <div>
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <p className="text-sm text-slate-600">{product.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">{formatCurrency(product.revenue)}</p>
                      <p className="text-sm text-green-600">{product.margin}% margin</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-600" />
                Top Clients by Spend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topClients.map((client, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-3 py-1">
                        #{index + 1}
                      </Badge>
                      <div>
                        <p className="font-semibold text-slate-900">{client.name}</p>
                        <p className="text-sm text-slate-600">{client.orders} orders</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">{formatCurrency(client.totalSpend)}</p>
                      <p className="text-sm text-slate-600">Avg: {formatCurrency(client.avgOrder)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Highest Margin Product
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 mb-1">{marginAnalysis.highest.name}</p>
                    <p className="text-slate-600">Best performing product by margin</p>
                  </div>
                  <Award className="w-12 h-12 text-green-600" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Profit Margin</p>
                    <p className="text-3xl font-bold text-green-600">{marginAnalysis.highest.margin}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Revenue</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(marginAnalysis.highest.revenue)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-orange-600" />
                Lowest Margin Product
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-6 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border-2 border-orange-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 mb-1">{marginAnalysis.lowest.name}</p>
                    <p className="text-slate-600">Needs pricing optimization</p>
                  </div>
                  <TrendingDown className="w-12 h-12 text-orange-600" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Profit Margin</p>
                    <p className="text-3xl font-bold text-orange-600">{marginAnalysis.lowest.margin}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Revenue</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(marginAnalysis.lowest.revenue)}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-orange-200">
                  <p className="text-sm text-orange-700">
                    <strong>Recommendation:</strong> Consider increasing pricing by 10-15% or optimizing ingredient costs
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-4">
              <h3 className="text-2xl font-bold text-slate-900">Lead Conversion Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <FileText className="w-10 h-10 text-blue-600 mx-auto mb-3" />
                  <p className="text-3xl font-bold text-slate-900 mb-1">{leadMetrics.total}</p>
                  <p className="text-sm text-slate-600">Total Leads</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <Target className="w-10 h-10 text-green-600 mx-auto mb-3" />
                  <p className="text-3xl font-bold text-slate-900 mb-1">{leadMetrics.converted}</p>
                  <p className="text-sm text-slate-600">Converted to Sales</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <DollarSign className="w-10 h-10 text-purple-600 mx-auto mb-3" />
                  <p className="text-3xl font-bold text-slate-900 mb-1">{formatCurrency(leadMetrics.avgLeadValue)}</p>
                  <p className="text-sm text-slate-600">Avg Lead Value</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}