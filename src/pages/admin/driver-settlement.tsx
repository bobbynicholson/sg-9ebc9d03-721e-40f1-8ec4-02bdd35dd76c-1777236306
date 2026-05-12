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
  Pencil, Trash2, Check, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import {
  driverPayService,
  type DriverPaySummary,
} from "@/services/driverPayService";

const formatR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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
  const [companyName, setCompanyName] = useState<string>("CateringMS");
  // Phase 8 #1: bump to refetch pay summaries after a shift edit
  // or delete lands. We hold this at the page level so the recompute
  // effect can re-run without losing the rows list.
  const [refreshTick, setRefreshTick] = useState(0);

  // Phase 19 #2: sort selector for the per-driver breakdown table.
  // Default is total-desc so the operator sees who they owe the most
  // first when running payouts. Name-asc kept as the alphabetical
  // fallback for ops who scan by driver.
  const [driverSort, setDriverSort] = useState<"total_desc" | "hours_desc" | "name_asc">(
    "total_desc",
  );

  // Phase 4 #7: pull the company name once so per-driver payslips
  // have the right header. Cheap; one row, runs on mount.
  useEffect(() => {
    if (!user?.company_id) return;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", user.company_id)
        .maybeSingle();
      if ((data as any)?.company_name) setCompanyName((data as any).company_name);
    })().catch(() => { /* default name is fine */ });
  }, [user?.company_id]);

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
  }, [user?.company_id, from, to, rows.length, refreshTick]);

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
      <Head><title>Driver Settlement | Admin</title></Head>
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
                  Per-driver pay summary. Hourly, distance per km, callout fees, and the total owed for the period. Review here before triggering payout.
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
              <div>
                <Label className="text-xs text-slate-500">Sort by</Label>
                <select
                  value={driverSort}
                  onChange={(e) => setDriverSort(e.target.value as any)}
                  className="mt-1 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="total_desc">Total owed (high to low)</option>
                  <option value="hours_desc">Hours (high to low)</option>
                  <option value="name_asc">Name (A to Z)</option>
                </select>
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                  <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Period totals strip + Phase 12 #9 utilisation tile.
              Utilisation = total team hours / (drivers * working
              days * 8h). Working days = elapsed days in the
              period, including weekends, because catering trades
              7 days. Anything > ~70% on a Spit Braai-style team
              means the operator is leaning hard on a small bench;
              < 30% means the bench is over-provisioned. */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
            <TotalCard label="Drivers paid" value={String(totals.drivers)} />
            <TotalCard label="Hours" value={`${totals.hours.toFixed(1)}h`} icon={Clock} accent="text-blue-600" />
            {(() => {
              const days = Math.max(
                1,
                Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1,
              );
              const capacity = totals.drivers * days * 8;
              const pct = capacity > 0 ? Math.round((totals.hours / capacity) * 100) : 0;
              const tone =
                pct >= 70 ? "text-rose-600"
                : pct >= 50 ? "text-amber-600"
                : pct >= 25 ? "text-emerald-600"
                : "text-slate-500";
              return (
                <TotalCard
                  label="Utilisation"
                  value={`${pct}%`}
                  icon={Clock}
                  accent={tone}
                />
              );
            })()}
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
                        // Phase 19 #2: sort by what operators actually
                        // triage on. Defaults to highest-owed first.
                        .sort((a, b) => {
                          const at = a.summary?.totals;
                          const bt = b.summary?.totals;
                          switch (driverSort) {
                            case "hours_desc":
                              return Number(bt?.hours_total || 0) - Number(at?.hours_total || 0);
                            case "name_asc":
                              return String((a.driver as any).full_name || "").localeCompare(
                                String((b.driver as any).full_name || ""),
                              );
                            case "total_desc":
                            default:
                              return Number(bt?.grand_total || 0) - Number(at?.grand_total || 0);
                          }
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
                              periodFrom={from}
                              periodTo={to}
                              companyName={companyName}
                              toast={toast}
                              actorUserId={user?.id}
                              onShiftChanged={() => setRefreshTick((n) => n + 1)}
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
  row, t, isOpen, onToggle, periodFrom, periodTo, companyName, toast, actorUserId, onShiftChanged,
}: {
  row: SettlementRow;
  t: { hours_total: number; hourly_pay: number; distance_total_km: number; distance_pay: number; callout_pay: number; grand_total: number } | undefined;
  isOpen: boolean;
  onToggle: () => void;
  periodFrom: string;
  periodTo: string;
  companyName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: any;
  actorUserId?: string | null;
  onShiftChanged?: () => void;
}) {
  // Phase 8 #1: per-shift edit / delete state. Lives at the row
  // level so multiple rows can each have their own dialog open
  // without cross-talk.
  const [editingShift, setEditingShift] = useState<{
    shift_id: string;
    actual_start: string;
    actual_end: string;
    notes: string;
    rate_multiplier: number;
  } | null>(null);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);

  const toLocalForInput = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const openEditShift = (s: any) => {
    setEditingShift({
      shift_id: s.shift_id,
      actual_start: toLocalForInput(s.actual_start),
      actual_end: toLocalForInput(s.actual_end),
      notes: s.notes || "",
      rate_multiplier: s.multiplier ?? 1,
    });
  };
  const saveShiftEdit = async () => {
    if (!editingShift) return;
    setShiftBusy(true);
    try {
      const startIso = editingShift.actual_start ? new Date(editingShift.actual_start).toISOString() : null;
      const endIso = editingShift.actual_end ? new Date(editingShift.actual_end).toISOString() : null;
      const res = await driverPayService.updateShift(
        editingShift.shift_id,
        {
          actual_start: startIso as any,
          actual_end: endIso as any,
          notes: editingShift.notes.trim() || null,
          rate_multiplier: editingShift.rate_multiplier === 1 ? null : editingShift.rate_multiplier,
        },
        undefined,
        actorUserId ?? null,
      );
      if (!res.ok) throw new Error(res.error || "Update failed");
      toast({ title: "Shift updated", description: "Settlement totals will refresh." });
      setEditingShift(null);
      onShiftChanged?.();
    } catch (e: any) {
      toast({ title: "Edit failed", description: e?.message, variant: "destructive" });
    } finally {
      setShiftBusy(false);
    }
  };
  const confirmDeleteShift = async () => {
    if (!deletingShiftId) return;
    setShiftBusy(true);
    try {
      const res = await driverPayService.deleteShift(deletingShiftId, undefined, actorUserId ?? null);
      if (!res.ok) throw new Error(res.error || "Delete failed");
      toast({ title: "Shift removed", description: "Settlement totals will refresh." });
      setDeletingShiftId(null);
      onShiftChanged?.();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    } finally {
      setShiftBusy(false);
    }
  };
  // Phase 4 #7: payslip download. jsPDF render of the same summary
  // the row above shows, so the operator can email or print one
  // per driver without re-keying anything.
  const handleDownload = async () => {
    if (!row.summary) return;
    const { driverPayslipService } = await import("@/services/driverPayslipService");
    const blob = driverPayslipService.generatePayslipPdf(
      {
        companyName,
        driverName: row.driver.full_name,
        driverEmail: row.driver.email || null,
        periodFrom,
        periodTo,
      },
      row.summary,
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = row.driver.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `payslip_${safeName}_${periodFrom}_to_${periodTo}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Phase 5 #4: email the same PDF to the driver. Same render, but
  // base64-encoded as an attachment on the per-tenant emailService
  // send so it picks up the company's branded sender + audit logging.
  const handleEmail = async () => {
    if (!row.summary || !row.driver.email) return;
    const { driverPayslipService } = await import("@/services/driverPayslipService");
    const blob = driverPayslipService.generatePayslipPdf(
      {
        companyName,
        driverName: row.driver.full_name,
        driverEmail: row.driver.email,
        periodFrom,
        periodTo,
      },
      row.summary,
    );
    // Resend / nodemailer attachment shape: filename + content (base64).
    const buf = await blob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buf).reduce((acc, b) => acc + String.fromCharCode(b), ""),
    );
    const safeName = row.driver.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const filename = `payslip_${safeName}_${periodFrom}_to_${periodTo}.pdf`;
    const res = await fetch("/api/admin/email-driver-payslip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver_id: row.driver.id,
        driver_email: row.driver.email,
        driver_name: row.driver.full_name,
        period_from: periodFrom,
        period_to: periodTo,
        grand_total: row.summary.totals.grand_total,
        attachment_filename: filename,
        attachment_base64: base64,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || "Could not email payslip");
    }
  };
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
        <td className="pr-2">
          {row.summary && t && t.grand_total > 0 && (
            <div className="flex items-center gap-1 justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={handleDownload}
                title="Download payslip PDF"
              >
                <Download className="w-3 h-3" /> PDF
              </Button>
              {row.driver.email && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={async () => {
                    try {
                      await handleEmail();
                      toast({
                        title: "Payslip emailed",
                        description: `Sent to ${row.driver.email}`,
                      });
                    } catch (e: any) {
                      toast({
                        title: "Could not email payslip",
                        description: e?.message || "Try again",
                        variant: "destructive",
                      });
                    }
                  }}
                  title="Email this payslip to the driver"
                >
                  Email
                </Button>
              )}
            </div>
          )}
        </td>
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
                  <ul className="text-xs space-y-2">
                    {row.summary.shifts.map((s) => {
                      const buckets = (s as any).bcea_buckets as
                        | Array<{
                            date: string;
                            hours: number;
                            dayMultiplier: number;
                            overtimeHours: number;
                            pay: number;
                          }>
                        | undefined;
                      const hasBreakdown = buckets && buckets.length > 1;
                      const hasMultiplier = s.multiplier !== 1;
                      const hasOvertime = !!buckets?.some((b) => b.overtimeHours > 0);
                      return (
                        <li key={s.shift_id} className="border-l-2 border-slate-200 pl-2 group">
                          <div className="flex justify-between items-start gap-2">
                            <span className="flex-1">
                              {s.hours.toFixed(2)}h @ {formatR(s.hourly_rate)}/hr{" "}
                              {hasMultiplier && (
                                <span className="text-amber-700 font-medium">× {s.multiplier}</span>
                              )}
                              {hasOvertime && (
                                <span className="text-amber-700 font-medium"> (includes overtime)</span>
                              )}
                            </span>
                            <span className="font-medium tabular-nums">{formatR(s.pay)}</span>
                            {/* Phase 8 #1: admin edit / soft-delete
                                actions per shift. Visible on hover
                                so they don't crowd the row. Audit log
                                handled inside driverPayService. */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 -my-0.5">
                              <button
                                type="button"
                                onClick={() => openEditShift(s)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="Edit shift"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingShiftId(s.shift_id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Delete shift"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {/* Phase 3 #2: per-day BCEA buckets, shown
                              when a shift crosses midnight (multiple
                              buckets) or includes Sunday/PH/overtime
                              uplifts. Otherwise the single-day case
                              is the same as the headline above. */}
                          {hasBreakdown && (
                            <ul className="mt-1 ml-2 text-[11px] text-slate-500 space-y-0.5">
                              {buckets!.map((b) => {
                                const day = new Date(b.date + "T12:00:00");
                                const dayLabel = day.toLocaleDateString("en-ZA", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                });
                                const tags: string[] = [];
                                if (b.dayMultiplier === 2) tags.push("Sun/PH ×2");
                                if (b.overtimeHours > 0) tags.push(`${b.overtimeHours.toFixed(2)}h OT ×1.5`);
                                return (
                                  <li key={b.date} className="flex justify-between">
                                    <span>
                                      {dayLabel}: {b.hours.toFixed(2)}h
                                      {tags.length > 0 && (
                                        <span className="text-amber-700"> ({tags.join(" + ")})</span>
                                      )}
                                    </span>
                                    <span className="tabular-nums">{formatR(b.pay)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
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

      {/* Phase 8 #1: shift edit dialog. Mirrors LogDriverShiftModal
          inputs but minus the create-new flow. Saved patch routes
          through driverPayService.updateShift which writes an
          audit_logs row with before + patch. */}
      <Dialog open={!!editingShift} onOpenChange={(o) => !o && setEditingShift(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit shift</DialogTitle>
            <DialogDescription>
              Adjust the clock times, notes or pay multiplier. Audit logged.
            </DialogDescription>
          </DialogHeader>
          {editingShift && (
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit_shift_start">Clock in</Label>
                  <Input
                    id="edit_shift_start"
                    type="datetime-local"
                    value={editingShift.actual_start}
                    onChange={(e) => setEditingShift({ ...editingShift, actual_start: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_shift_end">Clock out</Label>
                  <Input
                    id="edit_shift_end"
                    type="datetime-local"
                    value={editingShift.actual_end}
                    onChange={(e) => setEditingShift({ ...editingShift, actual_end: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit_shift_mult">Pay multiplier</Label>
                <select
                  id="edit_shift_mult"
                  value={String(editingShift.rate_multiplier)}
                  onChange={(e) => setEditingShift({ ...editingShift, rate_multiplier: Number(e.target.value) })}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                >
                  <option value="1">1x -- standard hours</option>
                  <option value="1.5">1.5x -- overtime</option>
                  <option value="2">2x -- Sunday / public holiday (BCEA)</option>
                </select>
              </div>
              <div>
                <Label htmlFor="edit_shift_notes">Notes</Label>
                <Input
                  id="edit_shift_notes"
                  value={editingShift.notes}
                  onChange={(e) => setEditingShift({ ...editingShift, notes: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditingShift(null)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-md hover:bg-slate-50"
              disabled={shiftBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveShiftEdit}
              disabled={shiftBusy}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-1.5 disabled:opacity-60"
            >
              {shiftBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 8 #1: shift delete confirm. Soft delete via the
          deleted_at column so historical settlement reports stay
          truthful; audit row captures the before-snapshot so the
          shift can be reconstructed if needed. */}
      <Dialog open={!!deletingShiftId} onOpenChange={(o) => !o && setDeletingShiftId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this shift?</DialogTitle>
            <DialogDescription>
              The shift will disappear from settlement and stop counting toward
              pay. It is soft-deleted, so it can be recovered from audit logs
              if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeletingShiftId(null)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-md hover:bg-slate-50"
              disabled={shiftBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteShift}
              disabled={shiftBusy}
              className="px-3 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-md flex items-center gap-1.5 disabled:opacity-60"
            >
              {shiftBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
