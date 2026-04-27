import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { currencyMonitoringService } from "@/services/currencyMonitoringService";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  DollarSign,
  Calendar,
  Activity
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";

interface ExchangeRate {
  id: string;
  date: string;
  usd_to_zar_rate: number;
  created_at: string;
}

interface FluctuationAlert {
  id: string;
  check_date: string;
  start_rate: number;
  end_rate: number;
  percentage_change: number;
  days_period: number;
  alert_sent: boolean;
  resolved: boolean;
  created_at: string;
}

export default function PlatformCurrencyMonitoringPage() {
  const { user, loading: authLoading } = useAuth() as any;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentRate, setCurrentRate] = useState<number>(0);
  const [historicalRates, setHistoricalRates] = useState<ExchangeRate[]>([]);
  const [alerts, setAlerts] = useState<FluctuationAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    loadData();
  }, [authLoading, user, router]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rate, rates, unresolvedAlerts] = await Promise.all([
        currencyMonitoringService.getCurrentExchangeRate(),
        currencyMonitoringService.getHistoricalRates(90),
        currencyMonitoringService.getUnresolvedAlerts()
      ]);

      setCurrentRate(rate);
      setHistoricalRates(rates);
      setAlerts(unresolvedAlerts);
    } catch (error) {
      console.error("Error loading currency data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await currencyMonitoringService.runDailyCheck();
    await loadData();
    setRefreshing(false);
  };

  const handleResolveAlert = async (alertId: string) => {
    await currencyMonitoringService.resolveAlert(alertId);
    await loadData();
  };

  const calculateFluctuation = () => {
    if (historicalRates.length < 2) return { percentage: 0, trend: "stable" };
    
    const oldestRate = historicalRates[0].usd_to_zar_rate;
    const latestRate = historicalRates[historicalRates.length - 1].usd_to_zar_rate;
    const percentage = ((latestRate - oldestRate) / oldestRate) * 100;
    
    return {
      percentage,
      trend: percentage > 0 ? "weakening" : "strengthening"
    };
  };

  const fluctuation = calculateFluctuation();
  const hasSignificantFluctuation = Math.abs(fluctuation.percentage) >= 15;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <Head>
        <title>Currency Monitoring - CateringMS Platform</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Currency Monitoring
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Track USD/ZAR exchange rates and manage pricing adjustments
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Run Check Now
          </Button>
        </div>

        {hasSignificantFluctuation && (
          <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertTitle className="text-red-900 dark:text-red-100 font-bold">
              Critical: 15% Threshold Exceeded
            </AlertTitle>
            <AlertDescription className="text-red-800 dark:text-red-200">
              The ZAR has fluctuated by {fluctuation.percentage.toFixed(2)}% over the last 90 days.
              Please review and adjust pricing to maintain USD equivalency.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Current Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    R{currentRate.toFixed(2)}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">per USD</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                90-Day Change
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-3xl font-bold ${
                    fluctuation.percentage >= 0 ? "text-red-600" : "text-green-600"
                  }`}>
                    {fluctuation.percentage >= 0 ? "+" : ""}{fluctuation.percentage.toFixed(2)}%
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 capitalize">
                    ZAR {fluctuation.trend}
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                  fluctuation.percentage >= 0 
                    ? "bg-red-100 dark:bg-red-950" 
                    : "bg-green-100 dark:bg-green-950"
                }`}>
                  {fluctuation.percentage >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-red-600" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-green-600" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    {alerts.length}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Unresolved
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                  alerts.length > 0 
                    ? "bg-orange-100 dark:bg-orange-950" 
                    : "bg-green-100 dark:bg-green-950"
                }`}>
                  <AlertTriangle className={`h-6 w-6 ${
                    alerts.length > 0 ? "text-orange-600" : "text-green-600"
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Exchange Rate History (Last 90 Days)
            </CardTitle>
            <CardDescription>
              Track historical USD to ZAR exchange rates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {historicalRates.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No historical data available yet. Run the daily check to start collecting data.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {historicalRates.slice().reverse().slice(0, 30).map((rate) => (
                      <div
                        key={rate.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          <span className="text-sm font-medium">
                            {new Date(rate.date).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          R{rate.usd_to_zar_rate.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Fluctuation Alerts
            </CardTitle>
            <CardDescription>
              Manage currency fluctuation alerts and pricing adjustments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-slate-400">
                    No active alerts. Currency is within acceptable range.
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="border-2 border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50 dark:bg-orange-950"
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="destructive">
                            {alert.percentage_change.toFixed(2)}% Change
                          </Badge>
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {alert.days_period} days
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <p>
                            <span className="font-medium">Start Rate:</span> R{alert.start_rate.toFixed(2)}
                          </p>
                          <p>
                            <span className="font-medium">End Rate:</span> R{alert.end_rate.toFixed(2)}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            Detected on {new Date(alert.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleResolveAlert(alert.id)}
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark Resolved
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
          <CardHeader>
            <CardTitle>Currency Policy Reminder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4">
              <h4 className="font-semibold mb-2">Currency Display:</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prices shown in ZAR (South African Rand). USD, GBP, and EUR are approximate 
                conversions for reference only. All payments are processed in ZAR.
              </p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg p-4">
              <h4 className="font-semibold mb-2">USD-Pegged Pricing:</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR 
                prices to maintain USD equivalency if significant currency fluctuations occur 
                (exceeding 15% over 90 days). Customers will receive 30 days advance notice 
                of any price changes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
