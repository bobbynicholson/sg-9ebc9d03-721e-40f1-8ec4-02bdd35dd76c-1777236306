/**
 * /admin/kitchen-settlement - per-period kitchen pay summary.
 *
 * Wave 36.3. Mirrors /admin/driver-settlement.tsx in spirit but
 * leaner because kitchen pay has no distance/callout/vehicle logic
 * to summarise - just clocked-hours x rate (+ OT + multiplier).
 *
 * Pick a date range, scan every kitchen staffer, see who worked
 * how many hours, what they earned, then issue payslips one-tap or
 * in bulk. CSV export for the bookkeeper.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Loader2, Download, RefreshCw, Receipt, FileCheck, CheckCircle2 } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import {
  summariseStaffPay,
  persistPayslip,
  type PaySummary,
} from "@/services/kitchenPayService";

interface Staffer {
  id: string;
  full_name: string;
  email: string;
  hourly_rate: number | null;
}

interface PayslipRow {
  id: string;
  staff_id: string;
  period_start: string;
  period_end: string;
  total_pay: number;
  status: string;
}

function defaultPeriodStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return toLocalISO(d);
}

function fmtCurrency(amount: number, currency = "ZAR"): string {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  } catch {
    return `R${(amount || 0).toFixed(0)}`;
  }
}

function KitchenSettlementPage() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const companyId = user?.company_id;

  const [periodStart, setPeriodStart] = useState<string>(defaultPeriodStart());
  const [periodEnd, setPeriodEnd] = useState<string>(toLocalISO(new Date()));
  const [staff, setStaff] = useState<Staffer[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PaySummary>>({});
  const [existingPayslips, setExistingPayslips] = useState<Record<string, PayslipRow>>({});
  const [loading, setLoading] = useState(true);
  const [persisting, setPersisting] = useState<string | null>(null);
  const [bulkPersisting, setBulkPersisting] = useState(false);

  const periodKey = `${periodStart}__${periodEnd}`;

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // 1) Pull all hourly-eligible staff. Wave 40.4: widened to
      // include cleaning_staff so the same settlement page covers
      // chef + cleaner payroll. Bobby's brief: same person can do
      // both jobs in one shift - pay once, not twice. The
      // kitchen_payslips table is keyed by (company, staff,
      // period) so it's role-agnostic anyway.
      const { data: staffRes, error: staffResError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, hourly_rate, role")
        .eq("company_id", companyId)
        // Wave 64.5 - "owner" was in this filter but isn't a valid
        // user_role enum label, so PostgREST rejected the whole
        // query and the settlement table silently came back empty.
        // Same trap as kitchen-schedule + vehicles. Valid roles only.
        .in("role", ["kitchen_staff", "cleaning_staff", "company_admin", "admin"])
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
      if (staffResError) {
        console.error("[admin/kitchen-settlement] profiles fetch failed:", staffResError);
      }
      const staffRows = (staffRes || []) as Staffer[];
      setStaff(staffRows);

      // 2) Summarise pay for each
      const sumMap: Record<string, PaySummary> = {};
      for (const s of staffRows) {
        // Sequential to avoid hammering the DB. Catering tenants
        // typically have <20 chefs so this is acceptable.
        try {
          const sum = await summariseStaffPay(supabase as any, {
            companyId,
            staffId: s.id,
            periodStart,
            periodEnd,
          });
          sumMap[s.id] = sum;
        } catch (e) {
          console.warn("[kitchen-settlement] summarise failed:", s.id, e);
        }
      }
      setSummaries(sumMap);

      // 3) Pull any existing payslips for this exact period so the
      // operator sees what's already been issued / paid.
      const { data: psRows, error: psRowsError } = await (supabase as any)
        .from("kitchen_payslips")
        .select("id, staff_id, period_start, period_end, total_pay, status")
        .eq("company_id", companyId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .is("deleted_at", null);
      if (psRowsError) {
        console.error("[admin/kitchen-settlement] kitchen_payslips fetch failed:", psRowsError);
      }
      const psMap: Record<string, PayslipRow> = {};
      for (const r of (psRows || []) as PayslipRow[]) {
        psMap[r.staff_id] = r;
      }
      setExistingPayslips(psMap);
    } catch (e: any) {
      toast({ title: "Could not load settlement", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, periodKey]);

  const totals = useMemo(() => {
    let hours = 0, base = 0, ot = 0, mult = 0, total = 0;
    let chefsWithHours = 0;
    Object.values(summaries).forEach((s) => {
      if (s.totalHours > 0) chefsWithHours += 1;
      hours += s.totalHours;
      base += s.basePay;
      ot += s.overtimePay;
      mult += s.multiplierPay;
      total += s.totalPay;
    });
    return { hours, base, ot, mult, total, chefsWithHours };
  }, [summaries]);

  const issuePayslip = async (staffId: string, status: "draft" | "issued" | "paid") => {
    const summary = summaries[staffId];
    if (!summary || !companyId) return;
    setPersisting(staffId);
    try {
      const res = await persistPayslip(supabase as any, {
        companyId,
        summary,
        actorUserId: user?.id || null,
        status,
      });
      if (!res.ok) throw new Error(res.error || "Persist failed");
      toast({
        title: status === "paid" ? "Marked paid" : status === "issued" ? "Payslip issued" : "Payslip saved",
        description: `${summary.staffName || "Staff"} - ${fmtCurrency(summary.totalPay, summary.currency)}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Could not issue payslip", description: e?.message, variant: "destructive" });
    } finally {
      setPersisting(null);
    }
  };

  const issueAll = async () => {
    if (!companyId) return;
    setBulkPersisting(true);
    try {
      const candidates = Object.values(summaries).filter((s) => s.totalPay > 0);
      let issued = 0;
      for (const s of candidates) {
        try {
          const r = await persistPayslip(supabase as any, {
            companyId,
            summary: s,
            actorUserId: user?.id || null,
            status: "issued",
          });
          if (r.ok) issued += 1;
        } catch { /* swallow per-row, continue */ }
      }
      toast({ title: `Issued ${issued} payslip${issued === 1 ? "" : "s"}`, description: `Period ${periodStart} - ${periodEnd}` });
      await load();
    } finally {
      setBulkPersisting(false);
    }
  };

  const exportCsv = () => {
    if (Object.keys(summaries).length === 0) return;
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const headers = [
      "Chef", "Email", "Period start", "Period end", "Hourly rate",
      "Total hours", "Base pay", "Overtime pay", "Multiplier premium",
      "Total pay", "Currency", "Payslip status",
    ];
    const lines = [headers.join(",")];
    for (const s of staff) {
      const sum = summaries[s.id];
      if (!sum) continue;
      const ps = existingPayslips[s.id];
      lines.push([
        esc(s.full_name || ""),
        esc(s.email || ""),
        esc(periodStart),
        esc(periodEnd),
        esc(sum.hourlyRate.toFixed(2)),
        esc(sum.totalHours.toFixed(2)),
        esc(sum.basePay.toFixed(2)),
        esc(sum.overtimePay.toFixed(2)),
        esc(sum.multiplierPay.toFixed(2)),
        esc(sum.totalPay.toFixed(2)),
        esc(sum.currency),
        esc(ps?.status || ""),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kitchen-settlement-${periodStart}_to_${periodEnd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Quick-pick presets for common pay periods.
  const setLastWeek = () => {
    const end = new Date();
    end.setDate(end.getDate() - end.getDay() - 1); // last Saturday-ish
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    setPeriodStart(toLocalISO(start));
    setPeriodEnd(toLocalISO(end));
  };
  const setThisWeek = () => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setPeriodStart(toLocalISO(start));
    setPeriodEnd(toLocalISO(new Date()));
  };
  const setLastMonth = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    setPeriodStart(toLocalISO(start));
    setPeriodEnd(toLocalISO(end));
  };

  return (
    <>
      <Head><title>Kitchen settlement - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            title="Kitchen settlement"
            icon={Wallet}
            subtitle="Period summary, OT + Sunday multipliers, one-tap payslip issue."
            actions={
            <>
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={Object.keys(summaries).length === 0}>
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
                <Button
                  size="sm"
                  className="bg-brand-primary hover:opacity-90 gap-1.5"
                  onClick={issueAll}
                  disabled={bulkPersisting || totals.total === 0}
                >
                  {bulkPersisting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                  Issue all payslips
                </Button>
            </>
            }
          />
          <PageWorkbench />

            {/* Period picker */}
            <Card>
              <CardContent className="p-4 flex flex-col lg:flex-row gap-3 lg:items-end">
                <div className="flex-1 grid grid-cols-2 gap-3 max-w-md">
                  <div>
                    <Label htmlFor="period_start" className="text-xs">Period start</Label>
                    <Input id="period_start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="period_end" className="text-xs">Period end</Label>
                    <Input id="period_end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Button variant="outline" size="sm" onClick={setThisWeek}>This week</Button>
                  <Button variant="outline" size="sm" onClick={setLastWeek}>Last week</Button>
                  <Button variant="outline" size="sm" onClick={setLastMonth}>Last month</Button>
                </div>
              </CardContent>
            </Card>

            {/* Headline totals */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Chefs with hours</div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900 mt-1">{totals.chefsWithHours}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Total hours</div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900 mt-1">{totals.hours.toFixed(1)}<span className="text-sm font-normal text-slate-500 ml-0.5">h</span></div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Base pay</div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900 mt-1">{fmtCurrency(totals.base)}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">OT + premium</div>
                  <div className="text-2xl font-bold tabular-nums text-amber-700 mt-1">{fmtCurrency(totals.ot + totals.mult)}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Total pay</div>
                  <div className="text-2xl font-bold tabular-nums text-brand-primary mt-1">{fmtCurrency(totals.total)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Per-staffer breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Per-chef breakdown</CardTitle>
                <CardDescription className="text-xs">
                  Computed from clocked hours x hourly_rate, with OT for shifts over the tenant's overtime threshold and any roster multipliers (Sundays / public holidays).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Calculating...
                  </div>
                ) : staff.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No kitchen staff on the company roster yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Chef</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Rate</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Hours</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Base</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">OT</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Premium</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Total</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                          <th className="text-right px-3 py-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {staff.map((s) => {
                          const sum = summaries[s.id];
                          const ps = existingPayslips[s.id];
                          const hasHours = sum && sum.totalHours > 0;
                          return (
                            <tr key={s.id} className={hasHours ? "" : "opacity-50"}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900 truncate">{s.full_name || s.email}</div>
                                <div className="text-[11px] text-slate-500 truncate">{s.email}</div>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                                {sum?.hourlyRate ? fmtCurrency(sum.hourlyRate, sum.currency) : <span className="text-rose-600 text-[11px]">No rate</span>}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-900 font-medium">{sum?.totalHours.toFixed(1) || "0.0"}h</td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-700">{sum ? fmtCurrency(sum.basePay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-700">{sum && sum.overtimePay > 0 ? fmtCurrency(sum.overtimePay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-700">{sum && sum.multiplierPay > 0 ? fmtCurrency(sum.multiplierPay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right tabular-nums font-bold text-brand-primary">{sum ? fmtCurrency(sum.totalPay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right">
                                {ps ? (
                                  <Badge className={
                                    ps.status === "paid" ? "bg-brand-primary/15 text-brand-primary border-brand-primary/20" :
                                    ps.status === "issued" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                                              "bg-slate-100 text-slate-700 border-slate-200"
                                  } variant="outline">
                                    {ps.status}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {hasHours && (
                                  <div className="inline-flex gap-1">
                                    {!ps || ps.status === "draft" ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1"
                                        disabled={persisting === s.id}
                                        onClick={() => issuePayslip(s.id, "issued")}
                                      >
                                        {persisting === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />}
                                        Issue
                                      </Button>
                                    ) : null}
                                    {ps && ps.status !== "paid" && (
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs gap-1 bg-brand-primary hover:bg-brand-primary/90"
                                        disabled={persisting === s.id}
                                        onClick={() => issuePayslip(s.id, "paid")}
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        Mark paid
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}

export default function ProtectedKitchenSettlementPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <KitchenSettlementPage />
    </ProtectedRoute>
  );
}
