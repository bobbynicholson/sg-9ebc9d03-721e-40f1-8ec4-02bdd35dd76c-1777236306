/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/driver-settlement -- per-driver pay summary for the admin.
 *
 * Lists every active driver in the company with their pay breakdown
 * for a selected period: hourly pay (from driver_shifts), distance
 * pay (from delivered orders' delivery_distance_km), callout pay
 * (flat per delivery). Sums to the grand total.
 *
 * Source of truth: driverPayService.getPaySummary -- same calc the
 * driver's own /team-portal/driver/earnings page uses, so admin and
 * driver always see the same numbers.
 *
 * Stage 3 of the driver hourly-rate build. Stage 4 adds auto
 * clock-in / clock-out + BCEA multipliers, which feed straight into
 * this view via the same path (multiplier already in the calc).
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet, Loader2, Download, Clock, Route, MapPin, ChevronDown, ChevronRight, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  driverPayService,
  type DriverPaySummary,
} from "@/services/driverPayService";

const formatR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

type Preset = "last_7" | "last_30" | "month_to_date" | "last_month" | "custom";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}
function startOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastMonthRange(): { from: string; to: string } {
  const d = new Date();
  const firstOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 86400000);
  const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
  return {
    from: firstOfPrev.toISOString().slice(0, 10),
    to: lastOfPrev.toISOString().slice(0, 10),
  };
}

interface DriverRow {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  /** Soft-deleted via /admin/driver-management remove. We still show
   *  them in settlement because their historical pay is real and the
   *  operator may need to pay it out. Surfaced with a "Removed" badge. */
  is_removed: boolean;
}

interface SettlementRow {
  driver: DriverRow;
  summary: DriverPaySummary | null;
  loading: boolean;
}

export default function ProtectedDriverSettlementPage() {
  // Pay-data privacy: tightened to COMPANY_ADMIN+ to match the
  // canAccessFinance gate on the Wages section in AdminNav.
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN]}>
      <DriverSettlementPage />
    </ProtectedRoute>
  );
}

function DriverSettlementPage() {
  const { user } = useAuth() as any;
  const { toast } = useToast();

  const [preset, setPreset] = useState<Preset>("last_30");
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (preset === "last_7") { setFrom(daysAgoIso(7)); setTo(todayIso()); }
    else if (preset === "last_30") { setFrom(daysAgoIso(30)); setTo(todayIso()); }
    else if (preset === "month_to_date") { setFrom(startOfMonthIso()); setTo(todayIso()); }
    else if (preset === "last_month") { const r = lastMonthRange(); setFrom(r.from); setTo(r.to); }
  }, [preset]);

  // Load the driver list for the company on mount.
  //
  // Includes soft-deleted drivers (deleted_at IS NOT NULL) so the
  // operator can still pay out hours / deliveries that closed before
  // the driver was removed. We mark them with is_removed = true and
  // hide the row in the UI when their period totals are zero.
  useEffect(() => {
    if (!user?.company_id) { setLoadingDrivers(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingDrivers(true);
      try {
        const { data, error } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, email, is_active, deleted_at")
          .eq("company_id", user.company_id)
          .eq("role", "driver");
        if (error) throw error;
        const drivers: DriverRow[] = (data || []).map((d: any) => ({
          id: d.id,
          full_name: d.full_name || d.email || "Unnamed",
          email: d.email || "",
          is_active: !!d.is_active,
          is_removed: !!d.deleted_at,
        }));
        if (!cancelled) {
          setRows(drivers.map((d) => ({ driver: d, summary: null, loading: true })));
        }
      } catch (e) {
        console.error(e);
        toast({ title: "Could not load drivers", variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.company_id, toast]);

  // Recompute pay summaries when range or drivers change.
  useEffect(() => {
    if (!user?.company_id || rows.length === 0) return;
    let cancelled = false;
    (async () => {
      // Mark all rows as loading.
      setRows((prev) => prev.map((r) => ({ ...r, loading: true, summary: null })));
      // Fetch in parallel; partial failures fall back to null per-row.
      const results = await Promise.all(rows.map(async (r) => {
        try {
          const summary = await driverPayService.getPaySummary({
            companyId: user.company_id,
            driverId: r.driver.id,
            range: { from, to },
          });
          return { ...r, summary, loading: false };
        } catch {
          return { ...r, summary: null, loading: false };
        }
      }));
      if (!cancelled) setRows(results);
    })();
    return () => { cancelled = true; };
    // We deliberately depend on rows.length (not rows itself) so the
    // recompute fires when the list shape changes, not on every
    // setRows in the inner effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id, from, to, rows.length]);

  const totals = useMemo(() => {
    let hours = 0, hourlyPay = 0, distanceKm = 0, distancePay = 0, callout = 0, grand = 0, drivers = 0;
    for (const r of rows) {
      const s = r.summary?.totals;
      if (!s) continue;
      drivers += 1;
      hours += s.hours_total;
      hourlyPay += s.hourly_pay;
      distanceKm += s.distance_total_km;
      distancePay += s.distance_pay;
      callout += s.callout_pay;
      grand += s.grand_total;
    }
    return { hours, hourlyPay, distanceKm, distancePay, callout, grand, drivers };
  }, [rows]);

  const exportCsv = () => {
    const header = [
      "Driver", "Email", "Hours", "Hourly pay", "Distance (km)", "Distance pay", "Callouts", "Callout pay", "Grand total",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const s = r.summary?.totals;
      if (!s) continue;
      lines.push([
        `"${r.driver.full_name.replace(/"/g, '""')}"`,
        `"${r.driver.email.replace(/"/g, '""')}"`,
        s.hours_total.toFixed(2),
        s.hourly_pay.toFixed(2),
        s.distance_total_km.toFixed(2),
        s.distance_pay.toFixed(2),
        r.summary?.deliveries.length ?? 0,
        s.callout_pay.toFixed(2),
        s.grand_total.toFixed(2),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `driver-settlement_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Driver Settlement -- Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 py-8 max-w-screen-2xl">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Driver Settlement</h1>
                <p className="text-slate-600 mt-1">
                  Pay breakdown per driver -- hourly + distance + callout. Pick a period and review before payout.
                </p>
              </div>
            </div>
          </div>

          {/* Period picker */}
          <Card className="border-0 shadow mb-6">
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-slate-500">Period</Label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as Preset)}
                  className="mt-1 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="last_7">Last 7 days</option>
                  <option value="last_30">Last 30 days</option>
                  <option value="month_to_date">This month</option>
                  <option value="last_month">Last month</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">From</Label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="mt-1 w-44" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">To</Label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="mt-1 w-44" />
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                  <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Period totals strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <TotalCard label="Drivers paid" value={String(totals.drivers)} />
            <TotalCard label="Hours" value={`${totals.hours.toFixed(1)}h`} icon={Clock} accent="text-blue-600" />
            <TotalCard label="Hourly pay" value={formatR(totals.hourlyPay)} icon={Clock} accent="text-blue-600" />
            <TotalCard label="Distance pay" value={formatR(totals.distancePay)} icon={Route} accent="text-amber-600" />
            <TotalCard label="Grand total" value={formatR(totals.grand)} accent="text-emerald-700" emphasize />
          </div>

          {loadingDrivers ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading drivers...
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 text-center text-slate-500">
                No drivers configured yet. Add some on /admin/driver-management.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-orange-600" />
                  Per-driver breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Driver</th>
                        <th className="text-right px-4 py-2 font-medium">Hours</th>
                        <th className="text-right px-4 py-2 font-medium">Hourly pay</th>
                        <th className="text-right px-4 py-2 font-medium">Distance</th>
                        <th className="text-right px-4 py-2 font-medium">Distance pay</th>
                        <th className="text-right px-4 py-2 font-medium">Callouts</th>
                        <th className="text-right px-4 py-2 font-medium">Callout pay</th>
                        <th className="text-right px-4 py-2 font-medium">Total</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        // Hide removed drivers when they have nothing
                        // to pay out in the selected period -- noise
                        // the operator doesn't need. Active drivers
                        // always show even with zero totals so their
                        // empty rows still surface.
                        .filter((r) => {
                          if (!r.driver.is_removed) return true;
                          if (r.loading) return true;
                          const t = r.summary?.totals;
                          return !!t && t.grand_total > 0;
                        })
                        .map((r) => {
                          const t = r.summary?.totals;
                          const isOpen = expanded.has(r.driver.id);
                          return (
                            <FragmentRows
                              key={r.driver.id}
                              row={r}
                              t={t}
                              isOpen={isOpen}
                              onToggle={() => toggleExpand(r.driver.id)}
                            />
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}

function FragmentRows({
  row, t, isOpen, onToggle,
}: {
  row: SettlementRow;
  t: { hours_total: number; hourly_pay: number; distance_total_km: number; distance_pay: number; callout_pay: number; grand_total: number } | undefined;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={onToggle} className="text-slate-400 hover:text-slate-700">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <div>
              <p className="font-medium text-slate-900">{row.driver.full_name}</p>
              <p className="text-xs text-slate-500">{row.driver.email}</p>
            </div>
            {row.driver.is_removed ? (
              <Badge variant="outline" className="ml-2 text-xs bg-rose-50 text-rose-700 border-rose-200">
                Removed
              </Badge>
            ) : !row.driver.is_active ? (
              <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>
            ) : null}
          </div>
        </td>
        {row.loading ? (
          <td colSpan={7} className="px-4 py-3 text-slate-400 italic">
            <RefreshCw className="w-3 h-3 inline-block mr-1 animate-spin" /> calculating...
          </td>
        ) : !t ? (
          <td colSpan={7} className="px-4 py-3 text-rose-500 italic">Failed to load</td>
        ) : (
          <>
            <td className="px-4 py-3 text-right tabular-nums">{t.hours_total.toFixed(2)}h</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatR(t.hourly_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{t.distance_total_km.toFixed(1)} km</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatR(t.distance_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{row.summary?.deliveries.length ?? 0}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatR(t.callout_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{formatR(t.grand_total)}</td>
          </>
        )}
        <td></td>
      </tr>
      {isOpen && row.summary && (
        <tr className="bg-slate-50/50">
          <td colSpan={9} className="px-4 py-3">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Shifts ({row.summary.shifts.length})
                </p>
                {row.summary.shifts.length === 0 ? (
                  <p className="text-sm text-slate-500">No shifts in this period.</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {row.summary.shifts.map((s) => (
                      <li key={s.shift_id} className="flex justify-between">
                        <span>{s.hours.toFixed(2)}h @ {formatR(s.hourly_rate)}/hr {s.multiplier !== 1 && `× ${s.multiplier}`}</span>
                        <span className="font-medium">{formatR(s.pay)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Deliveries ({row.summary.deliveries.length})
                </p>
                {row.summary.deliveries.length === 0 ? (
                  <p className="text-sm text-slate-500">No deliveries in this period.</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {row.summary.deliveries.map((d) => (
                      <li key={d.order_id} className="flex justify-between">
                        <span className="font-mono text-slate-500">{d.order_id.slice(0, 8)}...</span>
                        <span>{d.distance_km.toFixed(1)} km · {formatR(d.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TotalCard({
  label, value, icon: Icon, accent, emphasize,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: string;
  emphasize?: boolean;
}) {
  return (
    <Card className={`border-0 shadow ${emphasize ? "ring-2 ring-emerald-200" : ""}`}>
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{label}</p>
        <div className="flex items-center gap-2 mt-1">
          {Icon && <Icon className={`w-4 h-4 ${accent || "text-slate-500"}`} />}
          <p className={`text-xl font-bold tabular-nums ${accent || "text-slate-900"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
