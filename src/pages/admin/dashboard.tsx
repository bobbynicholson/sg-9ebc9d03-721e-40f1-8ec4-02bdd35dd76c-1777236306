import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown,
  Users, 
  FileText, 
  DollarSign,
  Package,
  Award,
  Target,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Filter,
  Download,
  ArrowLeft,
  Search,
  Gamepad2
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CateringDashGame } from "@/components/games/CateringDashGame";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { UserRole } from "@/types";

function AdminDashboardPage() {
  const [dateRange, setDateRange] = useState("last_30_days");
  const [mounted, setMounted] = useState(false);
  const [showGame, setShowGame] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (!mounted) {
      return `R ${amount.toLocaleString()}`;
    }
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
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Analytics Dashboard | CateringMS Admin</title>
      </Head>
      
      <AdminNav />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8 max-w-7xl">
          <Link href="/">
            <Button variant="ghost" className="mb-4" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>

          {/* Header - Mobile Optimized */}
          <div className="mb-4 sm:mb-6 md:mb-8">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-2.5 md:p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg flex-shrink-0">
                  <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent truncate">
                    Analytics Dashboard
                  </h1>
                  <p className="text-xs sm:text-sm md:text-base text-slate-600 mt-0.5 sm:mt-1">Business insights and metrics</p>
                </div>
              </div>
              <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 flex-1 xs:flex-initial">
                  <Filter className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="border-0 focus:outline-none text-xs sm:text-sm bg-transparent w-full"
                  >
                    {dateRanges.map((range) => (
                      <option key={range.value} value={range.value}>
                        {range.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => setShowGame(true)} className="bg-gradient-to-r from-orange-500 to-pink-500 w-full xs:w-auto" size="sm">
                  <Gamepad2 className="w-4 h-4 mr-2" />
                  <span className="text-xs sm:text-sm">Play Game</span>
                </Button>
                <Button onClick={exportData} className="bg-gradient-to-r from-purple-500 to-pink-500 w-full xs:w-auto" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  <span className="text-xs sm:text-sm">Export</span>
                </Button>
                <Link href="/admin/client-search" passHref>
                  <Button variant="outline" className="w-full xs:w-auto" size="sm">
                    <Search className="w-4 h-4 mr-2" />
                    <span className="text-xs sm:text-sm">Client Search</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Stats Cards - Mobile Optimized Grid */}
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 hover:shadow-xl transition-shadow">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-3 sm:px-4 md:px-6 pb-3 sm:pb-4">
                <div className="flex items-center justify-between">
                  <div className="text-white min-w-0 flex-1 mr-2">
                    <p className="text-blue-100 text-xs sm:text-sm mb-0.5 sm:mb-1">Total Leads</p>
                    <p className="text-2xl sm:text-3xl md:text-4xl font-bold">{leadMetrics.total}</p>
                    <div className="flex items-center gap-1 mt-1 sm:mt-2">
                      <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm truncate">+15% vs last</span>
                    </div>
                  </div>
                  <Users className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-blue-200 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600 hover:shadow-xl transition-shadow">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-3 sm:px-4 md:px-6 pb-3 sm:pb-4">
                <div className="flex items-center justify-between">
                  <div className="text-white min-w-0 flex-1 mr-2">
                    <p className="text-green-100 text-xs sm:text-sm mb-0.5 sm:mb-1">Conversion</p>
                    <p className="text-2xl sm:text-3xl md:text-4xl font-bold">{leadMetrics.conversionRate}%</p>
                    <div className="flex items-center gap-1 mt-1 sm:mt-2">
                      <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm truncate">+3.2% up</span>
                    </div>
                  </div>
                  <Target className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-green-200 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-600 hover:shadow-xl transition-shadow">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-3 sm:px-4 md:px-6 pb-3 sm:pb-4">
                <div className="flex items-center justify-between">
                  <div className="text-white min-w-0 flex-1 mr-2">
                    <p className="text-purple-100 text-xs sm:text-sm mb-0.5 sm:mb-1">Revenue</p>
                    <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold truncate">{formatCurrency(revenueMetrics.total)}</p>
                    <div className="flex items-center gap-1 mt-1 sm:mt-2">
                      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm truncate">+{revenueMetrics.growth}%</span>
                    </div>
                  </div>
                  <DollarSign className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-purple-200 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-orange-600 hover:shadow-xl transition-shadow">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-3 sm:px-4 md:px-6 pb-3 sm:pb-4">
                <div className="flex items-center justify-between">
                  <div className="text-white min-w-0 flex-1 mr-2">
                    <p className="text-orange-100 text-xs sm:text-sm mb-0.5 sm:mb-1">Avg Order</p>
                    <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold truncate">{formatCurrency(revenueMetrics.avgOrderValue)}</p>
                    <div className="flex items-center gap-1 mt-1 sm:mt-2">
                      <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="text-xs sm:text-sm truncate">+8.5% up</span>
                    </div>
                  </div>
                  <BarChart3 className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-orange-200 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Products and Clients - Mobile Optimized */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mb-4 sm:mb-6 md:mb-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 flex-shrink-0" />
                  <span className="truncate">Popular Products</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
                <div className="space-y-2 sm:space-y-3">
                  {topProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-2 sm:p-3 md:p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 text-xs flex-shrink-0">
                          #{index + 1}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs sm:text-sm md:text-base text-slate-900 truncate">{product.name}</p>
                          <p className="text-xs text-slate-600">{product.orders} orders</p>
                        </div>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <p className="font-bold text-xs sm:text-sm md:text-base text-slate-900 truncate">{formatCurrency(product.revenue)}</p>
                        <p className="text-xs text-green-600">{product.margin}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 flex-shrink-0" />
                  <span className="truncate">Top Clients</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
                <div className="space-y-2 sm:space-y-3">
                  {topClients.map((client, index) => (
                    <div key={index} className="flex items-center justify-between p-2 sm:p-3 md:p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 text-xs flex-shrink-0">
                          #{index + 1}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs sm:text-sm md:text-base text-slate-900 truncate">{client.name}</p>
                          <p className="text-xs text-slate-600">{client.orders} orders</p>
                        </div>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <p className="font-bold text-xs sm:text-sm md:text-base text-slate-900 truncate">{formatCurrency(client.totalSpend)}</p>
                        <p className="text-xs text-slate-600 truncate">Avg: {formatCurrency(client.avgOrder)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Margin Analysis - Mobile Optimized */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mb-4 sm:mb-6 md:mb-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                  <span className="truncate">Highest Margin</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
                <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-slate-900 mb-1 break-words">{marginAnalysis.highest.name}</p>
                      <p className="text-xs sm:text-sm md:text-base text-slate-600">Best margin product</p>
                    </div>
                    <Award className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-green-600 flex-shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs sm:text-sm text-slate-600 mb-1">Margin</p>
                      <p className="text-xl sm:text-2xl md:text-3xl font-bold text-green-600">{marginAnalysis.highest.margin}%</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-slate-600 mb-1">Revenue</p>
                      <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-slate-900 truncate">{formatCurrency(marginAnalysis.highest.revenue)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-5">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                  <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" />
                  <span className="truncate">Lowest Margin</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6">
                <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border-2 border-orange-200">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-slate-900 mb-1 break-words">{marginAnalysis.lowest.name}</p>
                      <p className="text-xs sm:text-sm md:text-base text-slate-600">Needs optimization</p>
                    </div>
                    <TrendingDown className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-orange-600 flex-shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs sm:text-sm text-slate-600 mb-1">Margin</p>
                      <p className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-600">{marginAnalysis.lowest.margin}%</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-slate-600 mb-1">Revenue</p>
                      <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-slate-900 truncate">{formatCurrency(marginAnalysis.lowest.revenue)}</p>
                    </div>
                  </div>
                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-orange-200">
                    <p className="text-xs sm:text-sm text-orange-700">
                      <strong>Tip:</strong> Consider increasing pricing 10-15% or optimizing costs
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lead Conversion Insights - Mobile Optimized */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
            <CardContent className="pt-4 sm:pt-6 md:pt-8 pb-4 sm:pb-6 md:pb-8 px-3 sm:px-4 md:px-6">
              <div className="text-center space-y-3 sm:space-y-4">
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">Lead Conversion Insights</h3>
                <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 sm:gap-4 md:gap-6 max-w-4xl mx-auto">
                  <div className="bg-white rounded-xl p-3 sm:p-4 md:p-6 shadow-md hover:shadow-lg transition-shadow">
                    <FileText className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-blue-600 mx-auto mb-2 sm:mb-3" />
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{leadMetrics.total}</p>
                    <p className="text-xs sm:text-sm text-slate-600">Total Leads</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 sm:p-4 md:p-6 shadow-md hover:shadow-lg transition-shadow">
                    <Target className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-green-600 mx-auto mb-2 sm:mb-3" />
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{leadMetrics.converted}</p>
                    <p className="text-xs sm:text-sm text-slate-600">Conversions</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 sm:p-4 md:p-6 shadow-md hover:shadow-lg transition-shadow xs:col-span-3 lg:col-span-1">
                    <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-purple-600 mx-auto mb-2 sm:mb-3" />
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 mb-0.5 sm:mb-1">{formatCurrency(leadMetrics.avgLeadValue)}</p>
                    <p className="text-xs sm:text-sm text-slate-600">Avg Lead Value</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}
    </>
  );
}

export default function ProtectedAdminDashboard() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AdminDashboardPage />
    </ProtectedRoute>
  );
}
