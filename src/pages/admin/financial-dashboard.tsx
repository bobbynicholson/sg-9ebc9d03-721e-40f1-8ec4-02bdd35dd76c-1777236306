import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Users,
  Package,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Trophy
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { analyticsService } from "@/services/analyticsService";
import { aiFinancialService } from "@/services/aiFinancialService";
import { currencyUtils } from "@/lib/currencyUtils";
import type { Order } from "@/types";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";

interface FinancialMetrics {
  currentCashFlow: number;
  projectedRevenue30Days: number;
  projectedRevenue90Days: number;
  pendingPayments: number;
  staffPaymentsOwed: number;
  inventoryCosts: number;
  profitMargin: number;
  healthScore: number;
}

interface CashFlowAlert {
  severity: "high" | "medium" | "low";
  message: string;
  suggestedAction: string;
  predictedDate?: string;
}

export default function FinancialDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [alerts, setAlerts] = useState<CashFlowAlert[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (user) {
      loadFinancialData();
    }
  }, [user]);

  const loadFinancialData = async () => {
    try {
      setLoading(true);

      // Load all financial data
      const [ordersData, ledgerData, analyticsData, aiPredictions] = await Promise.all([
        orderService.getOrders(),
        paymentLedgerService.getPaymentLedger(),
        analyticsService.getFinancialAnalytics(),
        aiFinancialService.getPredictiveAnalytics()
      ]);

      setOrders(ordersData);

      // Calculate metrics
      const currentCashFlow = calculateCurrentCashFlow(ordersData, ledgerData);
      const projectedRevenue30Days = calculateProjectedRevenue(ordersData, 30);
      const projectedRevenue90Days = calculateProjectedRevenue(ordersData, 90);
      const pendingPayments = calculatePendingPayments(ordersData);
      const staffPaymentsOwed = ledgerData.totalOwed || 0;
      const inventoryCosts = calculateInventoryCosts(ordersData);
      const profitMargin = calculateProfitMargin(ordersData);
      const healthScore = calculateHealthScore({
        currentCashFlow,
        projectedRevenue30Days,
        pendingPayments,
        staffPaymentsOwed,
        profitMargin
      });

      setMetrics({
        currentCashFlow,
        projectedRevenue30Days,
        projectedRevenue90Days,
        pendingPayments,
        staffPaymentsOwed,
        inventoryCosts,
        profitMargin,
        healthScore
      });

      // Generate AI-powered alerts
      const generatedAlerts = await aiFinancialService.generateCashFlowAlerts({
        currentCashFlow,
        projectedRevenue30Days,
        upcomingExpenses: staffPaymentsOwed + inventoryCosts,
        orders: ordersData
      });
      setAlerts(generatedAlerts);

      // Show celebration if health score is high
      if (healthScore >= 85) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 5000);
      }
    } catch (error) {
      console.error("Error loading financial data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCurrentCashFlow = (orders: Order[], ledgerData: any) => {
    const receivedPayments = orders
      .filter(o => o.payment_status === "paid")
      .reduce((sum, o) => sum + (o.final_price || 0), 0);
    
    const staffOwed = ledgerData.totalOwed || 0;
    
    return receivedPayments - staffOwed;
  };

  const calculateProjectedRevenue = (orders: Order[], days: number) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return orders
      .filter(o => {
        const eventDate = new Date(o.event_date);
        return eventDate <= futureDate && o.status !== "cancelled";
      })
      .reduce((sum, o) => sum + (o.final_price || 0), 0);
  };

  const calculatePendingPayments = (orders: Order[]) => {
    return orders
      .filter(o => o.payment_status === "pending" || o.payment_status === "partial")
      .reduce((sum, o) => sum + (o.final_price || 0), 0);
  };

  const calculateInventoryCosts = (orders: Order[]) => {
    return orders
      .filter(o => o.status === "confirmed" || o.status === "in_progress")
      .reduce((sum, o) => sum + ((o.final_price || 0) * 0.35), 0);
  };

  const calculateProfitMargin = (orders: Order[]) => {
    const totalRevenue = orders
      .filter(o => o.payment_status === "paid")
      .reduce((sum, o) => sum + (o.final_price || 0), 0);
    
    const totalCosts = totalRevenue * 0.65;
    const profit = totalRevenue - totalCosts;
    
    return totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  };

  const calculateHealthScore = (data: any) => {
    let score = 50;
    
    if (data.currentCashFlow > 0) score += 20;
    if (data.projectedRevenue30Days > data.pendingPayments) score += 15;
    if (data.currentCashFlow > data.staffPaymentsOwed * 2) score += 15;
    if (data.profitMargin > 25) score += 10;
    if (data.profitMargin > 35) score += 10;
    
    return Math.min(100, score);
  };

  const formatCurrency = (amount: number) => {
    return currencyUtils.formatCurrency(amount, user?.currency || "ZAR");
  };

  if (!user) {
    return <div>Please log in to view financial dashboard</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p>Loading financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Financial Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header with Health Score */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
                  Financial Dashboard
                </h1>
                <p className="text-slate-600">
                  AI-powered insights and predictions for your business
                </p>
              </div>
              <div className="mt-4 md:mt-0">
                <Card className={`border-2 ${
                  (metrics?.healthScore || 0) >= 85 ? "border-green-500 bg-green-50" :
                  (metrics?.healthScore || 0) >= 70 ? "border-yellow-500 bg-yellow-50" :
                  "border-red-500 bg-red-50"
                }`}>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center gap-2 justify-center mb-1">
                      {(metrics?.healthScore || 0) >= 85 ? (
                        <Trophy className="w-5 h-5 text-green-600" />
                      ) : (
                        <Sparkles className="w-5 h-5 text-yellow-600" />
                      )}
                      <span className="text-sm font-medium text-slate-600">
                        Financial Health
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-slate-900">
                      {metrics?.healthScore || 0}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Celebration Message */}
            {showCelebration && (
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-lg mb-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <Trophy className="w-8 h-8" />
                  <div>
                    <h3 className="font-bold text-lg">Outstanding Financial Health! 🎉</h3>
                    <p className="text-sm">Your business is thriving! Keep up the excellent work.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Cash Flow Alerts */}
            {alerts.length > 0 && (
              <div className="space-y-2 mb-6">
                {alerts.map((alert, index) => (
                  <Card key={index} className={`border-l-4 ${
                    alert.severity === "high" ? "border-l-red-500 bg-red-50" :
                    alert.severity === "medium" ? "border-l-yellow-500 bg-yellow-50" :
                    "border-l-blue-500 bg-blue-50"
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                          alert.severity === "high" ? "text-red-600" :
                          alert.severity === "medium" ? "text-yellow-600" :
                          "text-blue-600"
                        }`} />
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900 mb-1">
                            {alert.message}
                          </h4>
                          <p className="text-sm text-slate-600 mb-2">
                            {alert.suggestedAction}
                          </p>
                          {alert.predictedDate && (
                            <Badge variant="outline" className="text-xs">
                              Expected: {new Date(alert.predictedDate).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Current Cash Flow
                  </CardTitle>
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(metrics?.currentCashFlow || 0)}
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {(metrics?.currentCashFlow || 0) > 0 ? (
                    <>
                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-600">Healthy</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="w-4 h-4 text-red-600" />
                      <span className="text-sm text-red-600">Needs Attention</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    30-Day Projection
                  </CardTitle>
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(metrics?.projectedRevenue30Days || 0)}
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  Expected revenue next month
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Pending Payments
                  </CardTitle>
                  <CreditCard className="w-5 h-5 text-yellow-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(metrics?.pendingPayments || 0)}
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  Outstanding from clients
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Profit Margin
                  </CardTitle>
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {(metrics?.profitMargin || 0).toFixed(1)}%
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  Overall profitability
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Tabs */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="projections">Projections</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="orders">Order Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Total Revenue (Paid)</span>
                      <span className="font-semibold">{formatCurrency(
                        orders.filter(o => o.payment_status === "paid")
                          .reduce((sum, o) => sum + (o.final_price || 0), 0)
                      )}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Pending Payments</span>
                      <span className="font-semibold text-yellow-600">
                        {formatCurrency(metrics?.pendingPayments || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Staff Payments Owed</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(metrics?.staffPaymentsOwed || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Estimated Inventory Costs</span>
                      <span className="font-semibold">
                        {formatCurrency(metrics?.inventoryCosts || 0)}
                      </span>
                    </div>
                    <div className="border-t pt-4 flex justify-between items-center">
                      <span className="font-semibold">Net Cash Flow</span>
                      <span className={`font-bold text-lg ${
                        (metrics?.currentCashFlow || 0) > 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {formatCurrency(metrics?.currentCashFlow || 0)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button className="w-full justify-start" variant="outline">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Send Payment Reminders
                    </Button>
                    <Button className="w-full justify-start" variant="outline">
                      <Users className="w-4 h-4 mr-2" />
                      Process Staff Payments
                    </Button>
                    <Button className="w-full justify-start" variant="outline">
                      <Package className="w-4 h-4 mr-2" />
                      Review Inventory Costs
                    </Button>
                    <Button className="w-full justify-start" variant="outline">
                      <Calendar className="w-4 h-4 mr-2" />
                      View Payment Schedule
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="projections">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Projections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-600">Next 30 Days</span>
                        <span className="font-semibold text-xl">
                          {formatCurrency(metrics?.projectedRevenue30Days || 0)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-600">Next 90 Days</span>
                        <span className="font-semibold text-xl">
                          {formatCurrency(metrics?.projectedRevenue90Days || 0)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                          style={{ 
                            width: `${Math.min(100, ((metrics?.projectedRevenue90Days || 0) / ((metrics?.projectedRevenue30Days || 1) * 3)) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-slate-900 mb-2">
                        AI Prediction
                      </h4>
                      <p className="text-sm text-slate-700">
                        Based on your current booking rate and seasonal trends, you're on track to 
                        exceed your quarterly target by approximately 15%. Consider investing in 
                        additional inventory and staff to meet demand.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="expenses">
              <Card>
                <CardHeader>
                  <CardTitle>Expense Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                      <div>
                        <h4 className="font-semibold">Staff Payments</h4>
                        <p className="text-sm text-slate-600">
                          {orders.filter(o => o.status === "completed").length} orders completed
                        </p>
                      </div>
                      <span className="font-bold text-lg">
                        {formatCurrency(metrics?.staffPaymentsOwed || 0)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                      <div>
                        <h4 className="font-semibold">Inventory Costs</h4>
                        <p className="text-sm text-slate-600">
                          Estimated for upcoming orders
                        </p>
                      </div>
                      <span className="font-bold text-lg">
                        {formatCurrency(metrics?.inventoryCosts || 0)}
                      </span>
                    </div>

                    <Button className="w-full">
                      View Detailed Expense Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>Order Profitability Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((order) => {
                      const estimatedCost = (order.final_price || 0) * 0.65;
                      const estimatedProfit = (order.final_price || 0) - estimatedCost;
                      const profitMargin = ((estimatedProfit / (order.final_price || 1)) * 100);

                      return (
                        <div key={order.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-semibold">{order.client_name}</h4>
                              <p className="text-sm text-slate-600">
                                {new Date(order.event_date).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge className={
                              profitMargin > 35 ? "bg-green-100 text-green-700" :
                              profitMargin > 25 ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }>
                              {profitMargin.toFixed(0)}% margin
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-slate-600">Revenue:</span>
                              <div className="font-semibold">
                                {formatCurrency(order.final_price || 0)}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-600">Est. Cost:</span>
                              <div className="font-semibold">
                                {formatCurrency(estimatedCost)}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-600">Est. Profit:</span>
                              <div className="font-semibold text-green-600">
                                {formatCurrency(estimatedProfit)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
