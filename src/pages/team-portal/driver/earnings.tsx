/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /team-portal/driver/earnings - driver-side pay dashboard.
 *
 * Command-centre restructure: the page now rides DriverPageShell
 * (hero band in tenant brand, meta chips, header actions) instead of
 * hand-rolling its own nav + gutter + header, and is wrapped in
 * ProtectedRoute like every other driver page.
 *
 * Calculation goes through driverPayService.getPaySummary so this
 * page sees exactly the same numbers the admin settlement view uses.
 * Money renders through useTenantCurrency().format - the same
 * formatter the driver dashboard tile uses - so the identical figure
 * renders identically on both surfaces.
 *
 * Default range is the last 30 days; the period picker swaps it for
 * presets or a custom range. Three pay components: hourly (shift
 * hours x effective hourly rate), distance (delivered km x effective
 * per-km rate), callout (flat per-delivery).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Banknote, Clock, Download, ExternalLink, Loader2, MapPin, RefreshCw, Route, TrendingUp, Truck, MessageCircle,
} from "lucide-react";
import { PortalCard, PortalCardHeader, PortalOverview, StatTile } from "@/components/portal/ui";
import { DriverPageShell } from "@/components/driver/DriverPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalISO } from "@/lib/localDate";
import {
  driverPayService,
  type DriverPaySummary,
} from "@/services/driverPayService";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

type Preset = "last_7" | "last_30" | "month_to_date" | "last_month" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  last_7: "Last 7 days",
  last_30: "Last 30 days",
  month_to_date: "This month",
  last_month: "Last month",
  custom: "Custom range",
};

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

/** Event name is sometimes stored as the literal "Untitled"
 *  placeholder; treat that as no name. */
function cleanEventName(name?: string | null): string | null {
  const trimmed = (name || "").trim();
  if (!trimmed || /^untitled$/i.test(trimmed)) return null;
  return trimmed;
}

/** Quote a CSV cell only when needed; always escapes embedded quotes. */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function DriverEarningsInner() {
  const { user, profile } = useAuth() as any;
  const companyId: string | null = profile?.company_id ?? user?.company_id ?? null;
  // Tenant-currency formatter - same source as the dashboard earnings
  // tile so a figure never renders two different ways.
  const tenantCurrency = useTenantCurrency(companyId);
  const formatR = tenantCurrency.format;
  const { withSlug } = useTenantHref();

  const [preset, setPreset] = useState<Preset>("last_30");
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [summary, setSummary] = useState<DriverPaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);

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
      setError(null);
      try {
        const result = await driverPayService.getPaySummary({
          companyId,
          driverId: user.id,
          range: { from, to },
        });
        if (!cancelled) setSummary(result);
      } catch (e: any) {
        // Pre-restructure this await was unguarded: a rejection left
        // the page stuck on the loading spinner forever. Surface it
        // with a Retry instead.
        console.error("[driver/earnings] getPaySummary failed:", e);
        if (!cancelled) {
          setSummary(null);
          setError(e?.message || "Could not load your earnings. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, companyId, from, to, loadTick]);

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

  const ready = !loading && !error && !!stats;

  // Payslip record: shift lines + delivery lines + totals for the
  // current period as a CSV blob download (same BOM pattern as the
  // admin settlement export so Excel-ZA renders currency correctly).
  const exportCsv = () => {
    if (!summary) return;
    const t = summary.totals;
    const lines: string[] = [];
    lines.push(`Driver earnings,${csvCell(`${from} to ${to}`)},${csvCell(PRESET_LABELS[preset])}`);
    lines.push(`Currency,${csvCell(tenantCurrency.code)}`);
    lines.push("");
    lines.push("Shifts");
    lines.push(["Date", "Hours", "Multiplier", "Hourly rate", "Pay"].join(","));
    for (const s of summary.shifts) {
      lines.push([
        csvCell(s.shift_date || s.shift_id),
        s.hours.toFixed(2),
        s.multiplier.toFixed(2),
        s.hourly_rate.toFixed(2),
        s.pay.toFixed(2),
      ].join(","));
    }
    lines.push("");
    lines.push("Deliveries");
    lines.push(["Order", "Event", "Distance (km)", "Distance pay", "Callout fee", "Total"].join(","));
    for (const d of summary.deliveries) {
      lines.push([
        csvCell(d.order_number || d.order_id),
        csvCell(cleanEventName(d.event_name) || ""),
        d.distance_km.toFixed(2),
        d.distance_pay.toFixed(2),
        d.callout_fee.toFixed(2),
        d.total.toFixed(2),
      ].join(","));
    }
    lines.push("");
    lines.push("Totals");
    lines.push(["Hours", "Hourly pay", "Distance (km)", "Distance pay", "Callout pay", "Grand total"].join(","));
    lines.push([
      t.hours_total.toFixed(2),
      t.hourly_pay.toFixed(2),
      t.distance_total_km.toFixed(2),
      t.distance_pay.toFixed(2),
      t.callout_pay.toFixed(2),
      t.grand_total.toFixed(2),
    ].join(","));
    // UTF-8 BOM so Excel-ZA renders currency + diacritics.
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `driver-earnings_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chip = "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white";

  return (
    <DriverPageShell
      pageTitle="My earnings - CateringMS"
      heading="My earnings"
      subheading="Hours, distance and callout pay for the period below."
      icon={Banknote}
      width="wide"
      headerAction={
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={!ready || (stats!.shiftCount === 0 && stats!.deliveryCount === 0)}
          title="Download this period's shifts, deliveries and totals as CSV"
        >
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      }
      meta={
        ready ? (
          <>
            <span className={chip}>{PRESET_LABELS[preset]}: {from} to {to}</span>
            <span className={chip}><Banknote className="h-3.5 w-3.5" /> {formatR(stats!.grandTotal)} total</span>
            <span className={chip}><Clock className="h-3.5 w-3.5" /> {stats!.hoursTotal.toFixed(1)}h worked</span>
          </>
        ) : undefined
      }
      overview={
        <PortalOverview
          eyebrow="Pay summary"
          title={error ? "Earnings could not be loaded" : loading ? "Calculating driver pay" : stats ? "Pay is split into hours, distance, and callouts" : "No earnings data for this period"}
          description={`Current period: ${from} to ${to}. The breakdown uses the same driver pay service as admin settlement, so this page and the back office agree.`}
          items={[
            { label: "Total", value: ready ? formatR(stats!.grandTotal) : "-", helper: "Selected period", icon: TrendingUp, tone: ready && stats!.grandTotal > 0 ? "brand" : "neutral" },
            { label: "Hours", value: ready ? `${stats!.hoursTotal.toFixed(1)}h` : "-", helper: ready ? `${stats!.shiftCount} shifts` : "No shifts loaded", icon: Clock, tone: "neutral" },
            { label: "Distance", value: ready ? `${stats!.distanceKm.toFixed(1)} km` : "-", helper: "Round-trip km", icon: Route, tone: "neutral" },
            { label: "Deliveries", value: ready ? stats!.deliveryCount : "-", helper: "Callout count", icon: Truck, tone: "neutral" },
          ]}
          actions={
            <Link
              href={withSlug("/team-portal/driver/deliveries")}
              className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Review deliveries
            </Link>
          }
        />
      }
    >
      {/* Period picker */}
      <PortalCard className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-slate-500 dark:text-slate-400">Period</Label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              className="mt-1 block rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900/50 dark:bg-slate-900">
          <h2 className="mb-1 text-base font-bold text-rose-900 dark:text-rose-300">Couldn&apos;t load your earnings</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{error}</p>
          <Button
            onClick={() => setLoadTick((n) => n + 1)}
            size="sm"
            disabled={loading}
            className="bg-brand-primary hover:bg-brand-primary/90"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Retry
          </Button>
        </div>
      ) : loading || !stats ? (
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
                <TabsTrigger value="shifts" className="data-[state=active]:bg-brand-primary data-[state=active]:text-white">Shifts ({stats.shiftCount})</TabsTrigger>
                <TabsTrigger value="deliveries" className="data-[state=active]:bg-brand-primary data-[state=active]:text-white">Deliveries ({stats.deliveryCount})</TabsTrigger>
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
    </DriverPageShell>
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
            <th className="text-left px-4 py-2 font-medium">Date</th>
            <th className="text-left px-4 py-2 font-medium">Hours</th>
            <th className="text-left px-4 py-2 font-medium">Multiplier</th>
            <th className="text-right px-4 py-2 font-medium">Rate</th>
            <th className="text-right px-4 py-2 font-medium">Pay</th>
          </tr>
        </thead>
        <tbody>
          {summary.shifts.map((s) => (
            <tr key={s.shift_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{s.shift_date || "-"}</td>
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
          {summary.deliveries.map((d) => {
            const eventName = cleanEventName(d.event_name);
            return (
              <tr key={d.order_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2 max-w-[180px]">
                  <span className="block truncate font-semibold text-slate-800 dark:text-slate-200">
                    {d.order_number || `${d.order_id.slice(0, 8)}...`}
                  </span>
                  {eventName && (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{eventName}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{d.distance_km.toFixed(1)} km</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatR(d.distance_pay)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatR(d.callout_fee)}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums dark:text-white">{formatR(d.total)}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={withSlug(staffOrderHref(d.order_id, "driver"))}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary font-semibold min-h-[32px] dark:border-brand-primary/30 dark:bg-brand-primary/10 dark:text-brand-primary dark:hover:bg-brand-primary/20"
                      title="Open the driver brief for this order"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open brief
                    </Link>
                    <Link
                      href={withSlug(staffOrderHref(d.order_id, "driver", { openChat: true }))}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold min-h-[32px] dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
                      title="Message the client about this order"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Chat
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Defense-in-depth: same role gate as the driver dashboard. Admin
// roles are admitted for support / cross-tenant troubleshooting.
export default function DriverEarningsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.DRIVER,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <DriverEarningsInner />
    </ProtectedRoute>
  );
}
