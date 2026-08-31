import { useState, useEffect } from "react";
import Head from "next/head";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { currencyMonitoringService, type LatestCurrencyRate, type SupportedCurrency } from "@/services/currencyMonitoringService";
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
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

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

// Wave 24: super_admin gate. The page reads exchange_rates +
// currency_fluctuation_alerts (platform-level forex tables) and
// surfaces a "Run Check Now" trigger that fires the daily cron via
// the currency-check.ts route. Both are super-admin surfaces; the
// route already requires super_admin or CRON_SECRET, but the UI
// shouldn't be reachable by tenant admins either way.
export default function ProtectedPlatformCurrencyMonitoringPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PlatformCurrencyMonitoringPage />
    </ProtectedRoute>
  );
}

function PlatformCurrencyMonitoringPage() {
  const { user, loading: authLoading } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentRate, setCurrentRate] = useState<number>(0);
  const [currentRateDate, setCurrentRateDate] = useState<string | null>(null);
  const [historicalRates, setHistoricalRates] = useState<ExchangeRate[]>([]);
  const [supportedCurrencies, setSupportedCurrencies] = useState<SupportedCurrency[]>([]);
  const [latestRates, setLatestRates] = useState<{ date: string | null; rates: LatestCurrencyRate[] }>({ date: null, rates: [] });
  const [alerts, setAlerts] = useState<FluctuationAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // ProtectedRoute handles the unauthenticated redirect; we only
  // wait for the session so the queries run with the right JWT.
  useEffect(() => {
    if (authLoading || !user) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // Tile 1, the history list and the 90-day calculation now all read
  // from the same exchange_rates table - so "Current Rate" matches
  // the most recent history row instead of disagreeing with it.
  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [latest, rates, unresolvedAlerts, currencies, storedRates] = await Promise.all([
        currencyMonitoringService.getLatestStoredRate(),
        currencyMonitoringService.getHistoricalRates(90),
        currencyMonitoringService.getUnresolvedAlerts(),
        currencyMonitoringService.getSupportedCurrencies(),
        currencyMonitoringService.getLatestRates(),
      ]);

      setCurrentRate(latest?.rate ?? 0);
      setCurrentRateDate(latest?.date ?? null);
      setHistoricalRates(rates);
      setSupportedCurrencies(currencies);
      setLatestRates(storedRates);
      setAlerts(unresolvedAlerts);
    } catch (error: any) {
      console.error("Error loading currency data:", error);
      // Silent-failure audit: a failed load previously rendered
      // "ZAR 0.00" and "No active alerts", which reads as healthy.
      // Surface the failure and hide the zeroed data instead.
      setLoadError(error?.message || "Couldn't load currency data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // "Run Check Now" hits the same endpoint Vercel cron uses, so the
  // path that runs daily and the path the admin triggers are
  // identical. No more browser-side runDailyCheck.
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const r = await fetch("/api/cron/currency-check", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      await loadData();
    } catch (e: any) {
      setRefreshError(e?.message || "Currency check failed");
    } finally {
      setRefreshing(false);
    }
  };

  // Resolve failures get their own banner - piping them into
  // refreshError produced a "Run Check Now failed" title for an
  // action that has nothing to do with the cron trigger.
  const handleResolveAlert = async (alertId: string) => {
    setResolveError(null);
    try {
      await currencyMonitoringService.resolveAlert(alertId);
      await loadData();
    } catch (e: any) {
      console.error("resolveAlert failed:", e);
      setResolveError(e?.message || "Could not resolve the alert. Please try again.");
    }
  };

  const calculateFluctuation = () => {
    if (historicalRates.length < 2) return { percentage: 0, trend: "stable" };

    // Don't trust the input array's order - the service currently
    // returns ascending by date but a future caller (or a stale
    // cache) could pass an unsorted list and flip the sign of the
    // trend. Sort defensively by date before reading the endpoints.
    const sorted = [...historicalRates].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    const oldestRate = sorted[0].usd_to_zar_rate;
    const latestRate = sorted[sorted.length - 1].usd_to_zar_rate;
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
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalCard className="flex items-center justify-center py-16">
            <div className="text-center text-slate-500 dark:text-slate-400">
              <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin" />
              <p>Loading currency data...</p>
            </div>
          </PortalCard>
        </PortalShell>
      </div>
    );
  }

  return (
    <div className="admin-page-shell">
      <PlatformNav />
      <Head>
        <title>Currency monitoring - CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          variant="hero"
          title="Currency monitoring"
          subtitle="Track USD/ZAR movement as a manual review trigger. Pricing pegs stay fixed until an admin changes them."
          icon={DollarSign}
          meta={
            loadError ? undefined : (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ZAR {currentRate.toFixed(2)} per USD
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {alerts.length} unresolved alert{alerts.length === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {fluctuation.percentage >= 0 ? "+" : ""}{fluctuation.percentage.toFixed(2)}% over 90 days
                </span>
              </>
            )
          }
          actions={
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Run Check Now
            </Button>
          }
        />
        <PageWorkbench />

        <div className="space-y-6">
        {/* Load-failure banner: without it a failed load renders
            "ZAR 0.00" and "No active alerts", indistinguishable from
            a healthy platform. */}
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={() => void loadData()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {refreshError && (
          <Alert className="border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <AlertTitle className="font-semibold text-rose-900 dark:text-rose-300">
              Run Check Now failed
            </AlertTitle>
            <AlertDescription className="text-sm text-rose-800 dark:text-rose-300/90">
              {refreshError}
            </AlertDescription>
          </Alert>
        )}

        {resolveError && (
          <Alert className="border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <AlertTitle className="font-semibold text-rose-900 dark:text-rose-300">
              Could not resolve alert
            </AlertTitle>
            <AlertDescription className="text-sm text-rose-800 dark:text-rose-300/90">
              {resolveError}
            </AlertDescription>
          </Alert>
        )}

        {!loadError && hasSignificantFluctuation && (
          <Alert className="border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <AlertTitle className="font-semibold text-rose-900 dark:text-rose-300">
              Critical: 15% threshold exceeded
            </AlertTitle>
            <AlertDescription className="text-sm text-rose-800 dark:text-rose-300/90">
              The ZAR has fluctuated by {fluctuation.percentage.toFixed(2)}% over the last 90 days.
              Review and adjust pricing to maintain USD equivalency.
            </AlertDescription>
          </Alert>
        )}

        {/* Zeroed tiles and empty alert lists after a failed load
            look healthy, so the data sections hide behind the error
            banner until a reload succeeds. */}
        {!loadError && (
        <>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatTile
            label="Current Rate"
            value={`ZAR ${currentRate.toFixed(2)}`}
            hint={`per USD${currentRateDate ? ` · as of ${new Date(currentRateDate).toLocaleDateString()}` : " · no rate stored yet"}`}
            icon={DollarSign}
          />
          <StatTile
            label="90-Day Change"
            value={
              <span className={fluctuation.percentage >= 0 ? "text-rose-600 dark:text-rose-500" : "text-brand-primary dark:text-brand-primary"}>
                {fluctuation.percentage >= 0 ? "+" : ""}{fluctuation.percentage.toFixed(2)}%
              </span>
            }
            hint={<span className="capitalize">ZAR {fluctuation.trend}</span>}
            icon={fluctuation.percentage >= 0 ? TrendingUp : TrendingDown}
          />
          <StatTile
            label="Active Alerts"
            value={
              <span className={alerts.length > 0 ? "text-amber-600 dark:text-amber-500" : undefined}>
                {alerts.length}
              </span>
            }
            hint="Unresolved"
            icon={AlertTriangle}
          />
        </div>

        <PortalCard>
          <PortalCardHeader
            title="Supported currencies"
          />
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Resolved from active region settings and the latest exchange-rate records.
          </p>
          {supportedCurrencies.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No supported currencies are configured yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {supportedCurrencies.map((currency) => (
                <div
                  key={currency.code}
                  className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {currency.code}
                    </span>
                    <Badge variant="outline">{currency.symbol}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {currency.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Latest exchange rates" />
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Latest stored rates from the platform currency monitor{latestRates.date ? ` · ${new Date(latestRates.date).toLocaleDateString()}` : ""}.
          </p>
          {latestRates.rates.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No exchange rates have been stored yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {latestRates.rates.map((rate) => (
                <div
                  key={`${rate.from}-${rate.to}`}
                  className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {rate.from} to {rate.to}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {rate.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard>
          <PortalCardHeader
            title={
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                Exchange rate history (last 90 days)
              </span>
            }
          />
            <div className="space-y-2">
              {historicalRates.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  No historical data available yet. Run the daily check to start collecting data.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {historicalRates.slice().reverse().slice(0, 30).map((rate) => (
                      <div
                        key={rate.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {new Date(rate.date).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          ZAR {rate.usd_to_zar_rate.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </PortalCard>

        <PortalCard id="currency-alerts" data-chat-section="platform.currency-monitoring.alerts">
          <PortalCardHeader
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                Fluctuation alerts
              </span>
            }
          />
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-brand-primary mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-slate-400">
                    No active alerts. Currency is within acceptable range.
                  </p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
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
                            <span className="font-medium">Start Rate:</span> ZAR {alert.start_rate.toFixed(2)}
                          </p>
                          <p>
                            <span className="font-medium">End Rate:</span> ZAR {alert.end_rate.toFixed(2)}
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
        </PortalCard>
        </>
        )}

        <PortalCard className="space-y-3">
          <PortalCardHeader title="Currency Policy Reminder" />
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-slate-900 dark:text-white">Currency display</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Prices shown in ZAR (South African Rand). USD, GBP, and EUR are approximate
                conversions for reference only. All payments are processed in ZAR.
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-slate-900 dark:text-white">USD-pegged pricing</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR
                prices to maintain USD equivalency if significant currency fluctuations occur
                (exceeding 15% over 90 days). Customers will receive 30 days advance notice
                of any price changes.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                The 15% threshold is a <strong>manual review trigger</strong>, not an automated re-peg.
                Pricing in /admin/platform/pricing-management uses fixed conversion rates and only
                changes when an admin updates them.
              </p>
            </div>
        </PortalCard>
        </div>
      </PortalShell>
    </div>
  );
}
