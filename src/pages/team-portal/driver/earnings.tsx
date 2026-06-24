/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /team-portal/driver/earnings - driver-side pay dashboard.
 *
 * Replaces the old read of staff_work_sessions (table never existed)
 * with the live driver_shifts + delivered-orders model we ship in
 * Stages 1-2. Calculation goes through driverPayService.getPaySummary
 * so this page sees exactly the same numbers the admin settlement
 * view uses.
 *
 * Default range is the last 30 days; the period picker swaps it for
 * "this week" / "last week" / "this month" / custom. Three pay
 * components: hourly (shift hours x effective hourly rate), distance
 * (delivered km x effective per-km rate), callout (flat per-delivery).
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Clock, TrendingUp, Wallet, Truck, Loader2, Route, MapPin, ExternalLink,
} from "lucide-react";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { DriverNav } from "@/components/navigation/DriverNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalISO } from "@/lib/localDate";
import {
  driverPayService,
  type DriverPaySummary,
} from "@/services/driverPayService";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

/**
 * Phase 10 #3: tenant-aware money formatter. Falls back to ZAR / R
 * when the row doesn't declare a currency so existing tenants
 * render identically. Pass a currency code (ZAR / USD / GBP / EUR
 * / AUD / NZD / NGN / KES); anything else falls through to the
 * Intl default for that code.
 */
const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE", AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE",
};
const buildFormatR = (code: string) => (n: number) => {
  const locale = CURRENCY_LOCALE[code] || "en-ZA";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
};

type Preset = "last_7" | "last_30" | "month_to_date" | "last_month" | "custom";

function todayIso() { return toLocalISO(new Date()); }
function daysAgoIso(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return toLocalISO(dt);
}
function startOfMonthIso() {
  const d = new Date();
  return toLocalISO(new Date(d.getFullYear(), d.getMonth(), 1));
}
function lastMonthRange(): { from: string; to: string } {
  const d = new Date();
  const firstOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 86400000);
  const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
  return {
    from: toLocalISO(firstOfPrev),
    to: toLocalISO(lastOfPrev),
  };
}

export default function DriverEarningsPage() {
  const { user, profile } = useAuth() as any;
  const companyId: string | null = profile?.company_id ?? user?.company_id ?? null;
  // Phase 10 #3: bind the formatter to the tenant's currency code
  // so a UK / US driver sees their own currency instead of R.
  const tenantCurrency = useTenantCurrency(companyId);
  const formatR = buildFormatR(tenantCurrency.code);
  const { withSlug } = useTenantHref();

  const [preset, setPreset] = useState<Preset>("last_30");
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [summary, setSummary] = useState<DriverPaySummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply preset -> from/to. Custom keeps whatever the user typed.
  useEffect(() => {
    if (preset === "last_7") { setFrom(daysAgoIso(7)); setTo(todayIso()); }
    else if (preset === "last_30") { setFrom(daysAgoIso(30)); setTo(todayIso()); }
    else if (preset === "month_to_date") { setFrom(startOfMonthIso()); setTo(todayIso()); }
    else if (preset === "last_month") { const r = lastMonthRange(); setFrom(r.from); setTo(r.to); }
  }, [preset]);

  useEffect(() => {
    if (!user?.id || !companyId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await driverPayService.getPaySummary({
        companyId,
        driverId: user.id,
        range: { from, to },
      });
      if (!cancelled) {
        setSummary(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, companyId, from, to]);

  const stats = useMemo(() => {
    if (!summary) return null;
    return {
      hoursTotal: summary.totals.hours_total,
      hourlyPay: summary.totals.hourly_pay,
      distanceKm: summary.totals.distance_total_km,
      distancePay: summary.totals.distance_pay,
      calloutPay: summary.totals.callout_pay,
      grandTotal: summary.totals.grand_total,
      shiftCount: summary.shifts.length,
      deliveryCount: summary.deliveries.length,
      rates: summary.rates,
    };
  }, [summary]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>My earnings - CateringMS</title></Head>
      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="My earnings"
            subtitle="Hours, distance and callout pay for the period below."
            icon={Wallet}
          />

          {/* Period picker */}
          <PortalCard className="mb-6">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-slate-500 dark:text-slate-400">Period</Label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as Preset)}
                  className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="last_7">Last 7 days</option>
                  <option value="last_30">Last 30 days</option>
                  <option value="month_to_date">This month</option>
                  <option value="last_month">Last month</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 dark:text-slate-400">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
                  className="mt-1 w-44 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500 dark:text-slate-400">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
                  className="mt-1 w-44 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </PortalCard>

          {loading || !stats ? (
            <PortalCard>
              <div className="flex items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading earnings...
              </div>
            </PortalCard>
          ) : (
            <>
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  label="Total earned"
                  value={formatR(stats.grandTotal)}
                  icon={TrendingUp}
                  hint={`${stats.hoursTotal.toFixed(1)}h + ${stats.distanceKm.toFixed(1)}km + ${stats.deliveryCount} callouts`}
                />
                <StatTile
                  label="Hourly pay"
                  value={formatR(stats.hourlyPay)}
                  icon={Clock}
                  hint={`${stats.shiftCount} shift${stats.shiftCount === 1 ? "" : "s"} @ ${formatR(stats.rates.hourly_rate)}/hr`}
                />
                <StatTile
                  label="Distance pay"
                  value={formatR(stats.distancePay)}
                  icon={Route}
                  hint={`${stats.distanceKm.toFixed(1)} km (round-trip) @ ${formatR(stats.rates.distance_rate_per_km)}/km`}
                />
                <StatTile
                  label="Callout pay"
                  value={formatR(stats.calloutPay)}
                  icon={MapPin}
                  hint={`${stats.deliveryCount} dispatch${stats.deliveryCount === 1 ? "" : "es"} @ ${formatR(stats.rates.base_callout_fee)} flat`}
                />
              </div>

              <PortalCard>
                <PortalCardHeader title="Pay breakdown" />
                <p className="-mt-2 mb-4 text-xs text-slate-500 dark:text-slate-400">
                  Every shift and delivery in this period
                </p>
                <Tabs defaultValue="shifts">
                  <TabsList className="mb-4">
                    <TabsTrigger value="shifts" className="data-[state=active]:bg-brand-accent data-[state=active]:text-white">Shifts ({stats.shiftCount})</TabsTrigger>
                    <TabsTrigger value="deliveries" className="data-[state=active]:bg-brand-accent data-[state=active]:text-white">Deliveries ({stats.deliveryCount})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="shifts">
                    <ShiftTable summary={summary} formatR={formatR} />
                  </TabsContent>
                  <TabsContent value="deliveries">
                    <DeliveryTable summary={summary} formatR={formatR} withSlug={withSlug} />
                  </TabsContent>
                </Tabs>
              </PortalCard>
            </>
          )}
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}

function ShiftTable({ summary, formatR }: { summary: DriverPaySummary | null; formatR: (n: number) => string }) {
  if (!summary || summary.shifts.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          <Clock className="h-6 w-6 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">No shifts in this period.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Hours</th>
            <th className="text-left px-4 py-2 font-medium">Multiplier</th>
            <th className="text-right px-4 py-2 font-medium">Rate</th>
            <th className="text-right px-4 py-2 font-medium">Pay</th>
          </tr>
        </thead>
        <tbody>
          {summary.shifts.map((s) => (
            <tr key={s.shift_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{s.hours.toFixed(2)}h</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{s.multiplier === 1 ? "Standard" : `${s.multiplier}x`}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatR(s.hourly_rate)}/hr</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums dark:text-white">{formatR(s.pay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryTable({ summary, formatR, withSlug }: { summary: DriverPaySummary | null; formatR: (n: number) => string; withSlug: (href: string) => string }) {
  if (!summary || summary.deliveries.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          <Truck className="h-6 w-6 text-slate-400 dark:text-slate-500" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">No completed deliveries in this period.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Order</th>
            <th className="text-right px-4 py-2 font-medium">Distance</th>
            <th className="text-right px-4 py-2 font-medium">Distance pay</th>
            <th className="text-right px-4 py-2 font-medium">Callout</th>
            <th className="text-right px-4 py-2 font-medium">Total</th>
            <th className="text-right px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {summary.deliveries.map((d) => (
            <tr key={d.order_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2 font-mono text-xs text-slate-600 truncate max-w-[140px] dark:text-slate-400">{d.order_id.slice(0, 8)}...</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{d.distance_km.toFixed(1)} km</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatR(d.distance_pay)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatR(d.callout_fee)}</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums dark:text-white">{formatR(d.total)}</td>
              <td className="px-4 py-2 text-right">
                <Link
                  href={withSlug(staffOrderHref(d.order_id, "driver"))}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-accent/30 bg-brand-accent/5 hover:bg-brand-accent/10 text-brand-accent font-semibold min-h-[32px] dark:border-brand-accent/30 dark:bg-brand-accent/10 dark:text-brand-accent dark:hover:bg-brand-accent/20"
                  title="Open the driver brief for this order"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open brief
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
