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
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
  StatTile,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, Loader2, Download, RefreshCw, Receipt, FileCheck, CheckCircle2, AlertTriangle, UserPlus, Users, Clock, TrendingUp, Banknote } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { formatZAR } from "@/lib/formatters";
import { useTenantHref } from "@/lib/tenantUrl";
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

// Money display routes through the shared formatZAR util so figures
// here read identically to payslips and the wage dashboard (the old
// inline Intl formatter rounded to whole rand, hiding cents).
function fmtCurrency(amount: number, currency = "ZAR"): string {
  return formatZAR(amount || 0, { currency });
}

// Rand-float to integer cents. PaySummary amounts arrive as 2dp rand
// floats; all comparisons and sums on this page happen in cents.
const toCents = (rand: number): number => Math.round((rand || 0) * 100);

function KitchenSettlementPage() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const companyId = user?.company_id;

  const [periodStart, setPeriodStart] = useState<string>(defaultPeriodStart());
  const [periodEnd, setPeriodEnd] = useState<string>(toLocalISO(new Date()));
  const [staff, setStaff] = useState<Staffer[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PaySummary>>({});
  const [existingPayslips, setExistingPayslips] = useState<Record<string, PayslipRow>>({});
  const [loading, setLoading] = useState(true);
  // Silent-failure audit: the toast disappears; keep the failure on
  // screen with a Retry so an empty table can't read as "no staff".
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-staff summarise failures (partial Promise failures). Named so
  // the operator knows exactly whose pay is missing from the totals.
  const [summariseFailed, setSummariseFailed] = useState<string[]>([]);
  const [persisting, setPersisting] = useState<string | null>(null);
  const [bulkPersisting, setBulkPersisting] = useState(false);

  const periodKey = `${periodStart}__${periodEnd}`;

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      // 1) Pull all hourly-eligible staff. Wave 40.4: widened to
      // include cleaning_staff so the same settlement page covers
      // chef + cleaner payroll. Bobby's brief: same person can do
      // both jobs in one shift - pay once, not twice. The
      // kitchen_payslips table is keyed by (company, staff,
      // period) so it's role-agnostic anyway.
      // Match staff by base role OR active_role. A kitchen/cleaning
      // MANAGER carries role=kitchen_staff/cleaning_staff with
      // active_role=kitchen_manager/cleaning_manager, so filtering on
      // `role` alone happened to catch today's managers but would drop
      // any future manager provisioned with a manager base role. The
      // OR on active_role makes that impossible. (kitchen_manager /
      // cleaning_manager / owner are all valid user_role enum labels
      // now - the old "owner breaks the filter" note is stale.)
      const KITCHEN_PAY_ROLES = "kitchen_staff,cleaning_staff,kitchen_manager,cleaning_manager,company_admin,admin,owner";
      const { data: staffRes, error: staffResError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, hourly_rate, role, active_role")
        .eq("company_id", companyId)
        .or(`role.in.(${KITCHEN_PAY_ROLES}),active_role.in.(${KITCHEN_PAY_ROLES})`)
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
      if (staffResError) {
        console.error("[admin/kitchen-settlement] profiles fetch failed:", staffResError);
        // Silent-failure audit: an empty staff list here read as
        // "no staff to settle". Route it to the toast in the catch.
        throw staffResError;
      }
      const staffRows = (staffRes || []) as Staffer[];
      setStaff(staffRows);

      // 2) Summarise pay for each
      const sumMap: Record<string, PaySummary> = {};
      const failedNames: string[] = [];
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
          // Partial-failure audit: a swallowed summarise made this
          // person read as R0 in the totals. Track and surface it.
          console.warn("[kitchen-settlement] summarise failed:", s.id, e);
          failedNames.push(s.full_name || s.email);
        }
      }
      setSummaries(sumMap);
      setSummariseFailed(failedNames);

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
        // Silent-failure audit: missing payslip rows made already-
        // issued payslips look unissued. Route to the catch toast.
        throw psRowsError;
      }
      const psMap: Record<string, PayslipRow> = {};
      for (const r of (psRows || []) as PayslipRow[]) {
        psMap[r.staff_id] = r;
      }
      setExistingPayslips(psMap);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load the settlement data. Please try again.");
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
    // Sum in integer cents so float drift can never make the headline
    // tiles disagree with the per-row figures below them.
    let hours = 0, baseC = 0, otC = 0, multC = 0, totalC = 0;
    let chefsWithHours = 0;
    Object.values(summaries).forEach((s) => {
      if (s.totalHours > 0) chefsWithHours += 1;
      hours += s.totalHours;
      baseC += toCents(s.basePay);
      otC += toCents(s.overtimePay);
      multC += toCents(s.multiplierPay);
      totalC += toCents(s.totalPay);
    });
    return {
      hours,
      base: baseC / 100,
      ot: otC / 100,
      mult: multC / 100,
      total: totalC / 100,
      chefsWithHours,
    };
  }, [summaries]);

  // Best-effort staff notification on issue / mark-paid. staff_id in
  // this settlement flow is a profiles.id, so it's a valid
  // notifications.recipient_id. Deduped on the payslip row so a
  // re-click inside the window doesn't double-ping. Never blocks the
  // payslip write.
  const notifyPayslip = async (
    staffId: string,
    summary: PaySummary,
    status: "issued" | "paid",
    payslipId: string | undefined,
  ) => {
    if (!companyId) return;
    try {
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.createNotification({
        company_id: companyId,
        recipient_id: staffId,
        user_id: staffId,
        notification_type: status === "paid" ? "payslip_paid" : "payslip_issued",
        title: status === "paid" ? "Payslip paid" : "Payslip issued",
        message: `Your payslip for ${periodStart} to ${periodEnd} (${fmtCurrency(summary.totalPay, summary.currency)}) ${status === "paid" ? "has been marked paid" : "has been issued"}.`,
        priority: "normal",
        link: "/team-portal/kitchen/duty",
        related_entity_type: "kitchen_payslip",
        related_entity_id: payslipId,
        dedup: true,
      });
    } catch (e) {
      console.warn("[kitchen-settlement] payslip notify failed (non-fatal):", e);
    }
  };

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
      if (status === "issued" || status === "paid") {
        await notifyPayslip(staffId, summary, status, res.payslipId);
      }
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
      // Audit fix: per-row failures were swallowed entirely, so
      // "Issued 3 payslips" could silently mean 2 people got skipped.
      // Collect names and report them.
      const failed: string[] = [];
      for (const s of candidates) {
        try {
          const r = await persistPayslip(supabase as any, {
            companyId,
            summary: s,
            actorUserId: user?.id || null,
            status: "issued",
          });
          if (r.ok) {
            issued += 1;
            await notifyPayslip(s.staffId, s, "issued", r.payslipId);
          } else {
            failed.push(s.staffName || "Unnamed");
          }
        } catch {
          failed.push(s.staffName || "Unnamed");
        }
      }
      if (failed.length > 0) {
        toast({
          title: `Issued ${issued} of ${candidates.length} payslips`,
          description: `Failed for ${failed.join(", ")}. Retry after checking their shifts.`,
          variant: "destructive",
        });
      } else {
        toast({ title: `Issued ${issued} payslip${issued === 1 ? "" : "s"}`, description: `Period ${periodStart} - ${periodEnd}` });
      }
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
            variant="hero"
            title="Kitchen settlement"
            icon={Wallet}
            subtitle={
              <>
                Pay for everyone who works kitchen or cleaning shifts (team,
                their managers, plus any admin or owner who logs shifts) over the
                selected period, with overtime and Sunday multipliers, ready to
                issue as payslips.{" "}
                <span className="font-semibold text-white">{periodStart}</span> to{" "}
                <span className="font-semibold text-white">{periodEnd}</span>.
              </>
            }
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {totals.chefsWithHours} staff with hours
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {fmtCurrency(totals.total)} total pay
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {Object.keys(existingPayslips).length} payslip{Object.keys(existingPayslips).length === 1 ? "" : "s"} on record
                  </span>
                </>
              ) : undefined
            }
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

            {loadError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  <span>{loadError}</span>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Partial-failure surface: totals below EXCLUDE anyone
                whose pay calc failed, so say so instead of silently
                under-reporting the wage bill. */}
            {!loadError && summariseFailed.length > 0 && (
              <Alert className="mb-4 border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="flex flex-wrap items-center gap-3 text-amber-900">
                  <span>
                    Pay could not be computed for {summariseFailed.join(", ")}.
                    The totals below exclude {summariseFailed.length === 1 ? "this person" : "these people"}.
                  </span>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-amber-300 text-amber-900">
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Period picker: the page's one filter toolbar. mb-6 so
                the stacked sections stop rendering flush against each
                other (pre-fix there was no vertical rhythm at all). */}
            <Card className="mb-6">
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
                  {/* Copy honesty: the preset sets today minus 6 days
                      through today, which is a rolling 7-day window,
                      not the calendar week. */}
                  <Button variant="outline" size="sm" onClick={setThisWeek}>Last 7 days</Button>
                  <Button variant="outline" size="sm" onClick={setLastWeek}>Last week</Button>
                  <Button variant="outline" size="sm" onClick={setLastMonth}>Last month</Button>
                </div>
              </CardContent>
            </Card>

            {/* Headline totals: shared StatTile primitives so the
                figures read identically to the rest of the command
                centre. Sums are computed in integer cents in `totals`
                so Base + OT + Premium always equals Total pay. */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <StatTile
                label="Staff with hours"
                value={loading ? "…" : totals.chefsWithHours}
                icon={Users}
                hint={`of ${staff.length} on the roster`}
              />
              <StatTile
                label="Total hours"
                value={loading ? "…" : `${totals.hours.toFixed(1)}h`}
                icon={Clock}
                hint="Clocked in this period"
              />
              <StatTile
                label="Base pay"
                value={loading ? "…" : fmtCurrency(totals.base)}
                icon={Banknote}
                hint="Hours x hourly rate"
              />
              <StatTile
                label="OT + premium"
                value={loading ? "…" : fmtCurrency(totals.ot + totals.mult)}
                icon={TrendingUp}
                hint="Overtime and multipliers"
              />
              <StatTile
                label="Total pay"
                value={loading ? "…" : fmtCurrency(totals.total)}
                icon={Wallet}
                hint="Base + OT + premium"
              />
            </div>

            {/* Per-staffer breakdown */}
            <Card className="mb-6">
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
                    <p>No kitchen or cleaning staff on the company roster yet.</p>
                    <Link href={withSlug("/admin/kitchen-staff")}>
                      <Button variant="outline" size="sm" className="mt-3 gap-1.5">
                        <UserPlus className="w-3.5 h-3.5" />
                        Add staff and rates
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Chef</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rate</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Hours</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Base</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">OT</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Premium</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {staff.map((s) => {
                          const sum = summaries[s.id];
                          const ps = existingPayslips[s.id];
                          const hasHours = sum && sum.totalHours > 0;
                          // Money audit: an issued payslip can go stale
                          // when shifts are edited after issue. Flag any
                          // cent-level drift between the stored payslip
                          // and the recomputed figure so the two never
                          // silently disagree.
                          const payslipStale =
                            !!ps && !!sum && toCents(Number(ps.total_pay)) !== toCents(sum.totalPay);
                          return (
                            <tr key={s.id} className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${hasHours ? "" : "opacity-50"}`}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900 truncate">{s.full_name || s.email}</div>
                                <div className="text-[11px] text-slate-500 truncate">{s.email}</div>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                                {/* Rate column is pay-model aware: salaried and
                                    per-shift staff have hourly_rate=0 but are not
                                    "No rate" - show their salary / shift rate so a
                                    correctly-configured staffer doesn't read as a
                                    mistake. */}
                                {sum && sum.payType === "monthly" ? (
                                  <span title="Monthly salary, prorated to this period">
                                    {sum.monthlySalary ? `${fmtCurrency(sum.monthlySalary, sum.currency)}/mo` : <span className="text-rose-600 text-[11px]">No salary</span>}
                                  </span>
                                ) : sum && sum.payType === "shift" ? (
                                  <span title="Flat rate per shift worked">
                                    {sum.shiftRate ? `${fmtCurrency(sum.shiftRate, sum.currency)}/shift` : <span className="text-rose-600 text-[11px]">No rate</span>}
                                  </span>
                                ) : (
                                  sum?.hourlyRate ? fmtCurrency(sum.hourlyRate, sum.currency) : <span className="text-rose-600 text-[11px]">No rate</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-900 font-medium">{sum?.totalHours.toFixed(1) || "0.0"}h</td>
                              <td className="px-3 py-3 text-right tabular-nums text-slate-700">{sum ? fmtCurrency(sum.basePay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-700">{sum && sum.overtimePay > 0 ? fmtCurrency(sum.overtimePay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right tabular-nums text-amber-700">{sum && sum.multiplierPay > 0 ? fmtCurrency(sum.multiplierPay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right tabular-nums font-bold text-brand-primary">{sum ? fmtCurrency(sum.totalPay, sum.currency) : "-"}</td>
                              <td className="px-3 py-3 text-right">
                                {ps ? (
                                  <div className="inline-flex flex-col items-end gap-1">
                                    <Badge className={
                                      ps.status === "paid" ? "bg-brand-primary/15 text-brand-primary border-brand-primary/20" :
                                      ps.status === "issued" ? "bg-blue-100 text-blue-800 border-blue-200" :
                                                                "bg-slate-100 text-slate-700 border-slate-200"
                                    } variant="outline">
                                      {ps.status}
                                    </Badge>
                                    {payslipStale && (
                                      <span
                                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700"
                                        title={`Payslip shows ${fmtCurrency(Number(ps.total_pay), sum?.currency)}, recomputed pay is ${fmtCurrency(sum?.totalPay ?? 0, sum?.currency)}. Shifts changed after issue; re-issue to update.`}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        Differs from payslip
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {hasHours && (
                                  <div className="inline-flex gap-1">
                                    {/* Stale issued slips get a Re-issue so the
                                        payslip can catch up with edited shifts.
                                        Paid slips stay locked. */}
                                    {!ps || ps.status === "draft" || (payslipStale && ps.status === "issued") ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1"
                                        disabled={persisting === s.id}
                                        onClick={() => issuePayslip(s.id, "issued")}
                                      >
                                        {persisting === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />}
                                        {ps && payslipStale && ps.status === "issued" ? "Re-issue" : "Issue"}
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
    // Parity with /admin/driver-settlement: OWNER is in
    // FULL_COMPANY_ACCESS_ROLES and pays the wages; pre-fix the owner
    // was locked out of their own settlement page.
    <ProtectedRoute allowedRoles={[UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]} denyRoles={[UserRole.SUPER_ADMIN]}>
      <KitchenSettlementPage />
    </ProtectedRoute>
  );
}
