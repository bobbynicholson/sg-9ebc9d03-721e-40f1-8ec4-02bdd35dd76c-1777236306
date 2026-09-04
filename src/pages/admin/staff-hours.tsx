import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Users, TrendingUp, CheckCircle, Banknote, Download, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { captureException } from "@/lib/observability";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { formatZAR } from "@/lib/formatters";
import { timeClockService } from "@/services/timeClockService";
import { formatLocalDate } from "@/lib/localFormat";
import { toLocalISO } from "@/lib/localDate";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { notificationService } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MonthlyPayrollAudit } from "@/components/admin/MonthlyPayrollAudit";

export default function ProtectedStaffHoursPage() {
  return (
    // STH-B (staff-hours audit, 2026-05-23): tightened to OWNER /
    // COMPANY_ADMIN / SUPER_ADMIN per the directors-folder finance-
    // visibility rule. Pre-STH-B ADMIN (region_admin + sales_admin)
    // could read the unpaid R amounts here, which leaks pay rates
    // and totals - same gate /admin/wages already uses.
    <ProtectedRoute allowedRoles={[UserRole.COMPANY_ADMIN, UserRole.OWNER]} denyRoles={[UserRole.SUPER_ADMIN]}>
      <StaffHoursPage />
    </ProtectedRoute>
  );
}

// STH-B: narrow shape for a clocked session row. Pre-STH-B the page
// typed sessions as any[] and the CSV referenced fields that don't
// exist on the schema (staff_name, hours_worked, is_paid). Now we
// match what timeClockService.getAllStaffWorkSessions actually
// returns: clock_in, clock_out, total_hours, total_earnings,
// payment_status, with the staff relation joined as `staff`.
interface StaffSession {
  id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
  total_earnings: number | null;
  payment_status: "unpaid" | "paid" | "pending" | string;
  // STH-C: true when this row was backfilled via the Add manual
  // shift dialog. Renders a "Manual" chip on the row.
  entered_manually?: boolean | null;
  entry_reason?: string | null;
  staff?: { full_name: string | null; email: string | null; role: string | null } | null;
}

interface StaffPayment {
  id: string;
  staff_id: string;
  payment_period_start: string | null;
  payment_period_end: string | null;
  total_hours: number | null;
  hourly_rate: number | null;
  total_amount: number | null;
  payment_method: string;
  payment_date: string | null;
  staff?: { full_name: string | null } | null;
}

interface StaffGroup {
  staff: StaffSession["staff"];
  sessions: StaffSession[];
  totalHours: number;
  /** Integer cents. Summed in cents so float earnings never drift. */
  totalEarningsCents: number;
  unpaidSessions: StaffSession[];
}

// Money rule: the DB stores rand decimals; compare and sum in integer
// cents so 0.1 + 0.2 float drift can never make the tiles disagree
// with the per-staff cards.
const centsOf = (v: number | string | null | undefined) => Math.round(Number(v || 0) * 100);
const sumEarningsCents = (rows: StaffSession[]) =>
  rows.reduce((sum, s) => sum + centsOf(s.total_earnings), 0);

function StaffHoursPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // Phase 10 #2: tenant currency for the unpaid / paid totals +
  // per-session earnings + per-payment hourly rate strings.
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  // Display path: formatZAR (thousand separators) with the tenant's
  // currency code. Takes integer cents so callers never pass floats.
  const fmtMoney = (cents: number) => formatZAR(cents / 100, { currency: tenantCurrency.code });
  const [sessions, setSessions] = useState<StaffSession[]>([]);
  const [ledger, setLedger] = useState<StaffPayment[]>([]);
  const [loading, setLoading] = useState(false);
  // Persistent per-leg load failures (the old toasts vanished after
  // 5s and the page then looked "empty" instead of "broken").
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [activeTab, setActiveTab] = useState<"hours" | "ledger" | "monthly-audit">("hours");
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState({
    method: "cash" as "cash" | "bank_transfer" | "eft" | "other",
    reference: "",
    notes: "",
  });
  // Phase 18 #7: sort order for the staff cards. Payroll wants
  // "who do I owe the most" at the top during run-up to month-end;
  // alphabetical is the default everywhere else.
  const [staffSort, setStaffSort] = useState<"unpaid_desc" | "hours_desc" | "earnings_desc" | "name_asc">(
    "unpaid_desc",
  );
  // STH-C: custom date range. Pre-STH-C the page locked to 7 / 30
  // days only; payroll runs the audit on arbitrary windows ("just
  // the events on the 19th" / "the long weekend"). Picker mirrors
  // /admin/wages.
  const [rangeMode, setRangeMode] = useState<"week" | "month" | "custom">("week");
  const todayIsoLocal = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>(todayIsoLocal());
  // STH-C: reconciliation tile data. Pulled in parallel with the
  // sessions / ledger load; null while loading or on error.
  const [recon, setRecon] = useState<{
    clocked_hours: number;
    scheduled_hours: number;
    clocked_session_count: number;
    scheduled_shift_count: number;
  } | null>(null);
  // STH-C: manual-entry dialog state.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<{
    staffId: string;
    clockIn: string;
    clockOut: string;
    reason: string;
  }>({ staffId: "", clockIn: "", clockOut: "", reason: "" });
  const [manualSaving, setManualSaving] = useState(false);
  // Roster used by the manual-entry Select. Pulled once on mount
  // via the same supabase client; we only need id + full_name for
  // staff this company employs.
  const [roster, setRoster] = useState<Array<{ id: string; full_name: string | null }>>([]);
  useEffect(() => {
    if (router.isReady && router.query.tab === "monthly-audit") setActiveTab("monthly-audit");
  }, [router.isReady, router.query.tab]);
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", user.company_id)
        .order("full_name", { ascending: true });
      // A failed roster pull would render an empty staff Select in the
      // manual-shift dialog with no explanation - log it so the gap is
      // diagnosable instead of silently swallowed.
      if (error) {
        captureException(error, {
          level: "warning",
          tags: { companyId: user?.company_id, route: "/admin/staff-hours", step: "load_roster" },
        });
      }
      if (!cancelled) setRoster((data || []) as Array<{ id: string; full_name: string | null }>);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);

  useEffect(() => {
    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, period, rangeMode, customFrom, customTo]);

  // STH-C: resolve the active [startDate, endDate] from the
  // current range mode. Defined as a function so loadData and the
  // reconciliation fetch agree on the same window.
  const resolveRange = (): { start: Date; end: Date } => {
    const now = new Date();
    if (rangeMode === "custom" && customFrom && customTo) {
      const start = new Date(customFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customTo);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    const start = new Date();
    if (rangeMode === "month") start.setMonth(now.getMonth() - 1);
    else start.setDate(now.getDate() - 7);
    return { start, end: now };
  };

  const loadData = async () => {
    const { start: startDate, end: now } = resolveRange();
    // Custom range sanity: from after to returns nothing from every
    // leg and looks like a data loss. Refuse it up front.
    if (startDate.getTime() > now.getTime()) {
      toast({ title: "Invalid range", description: "The from date must be on or before the to date.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setSessionsError(null);
    setLedgerError(null);

    // STH-D (task #215, 2026-05-25): switched from Promise.all to
    // independent fetches. The page is three orthogonal sub-loads
    // (sessions / ledger / reconciliation) - if one 400s (e.g.
    // staff_payment_ledger missing columns pre-migration) the
    // page used to show "Couldn't load time clock data" and
    // render nothing, even though the other two queries succeeded.
    // Now each leg fails independently with its own toast + Sentry
    // breadcrumb, and the page keeps whatever it could load.
    const tasks: Array<Promise<void>> = [];

    tasks.push((async () => {
      try {
        const sessionsData = await timeClockService.getAllStaffWorkSessions(startDate, now, user?.company_id);
        setSessions(sessionsData as unknown as StaffSession[]);
      } catch (error) {
        captureException(error, {
          level: "error",
          tags: { companyId: user?.company_id, route: "/admin/staff-hours", step: "load_sessions" },
        });
        setSessionsError(dbErrorMessage(error, { entity: "clock-in" }));
      }
    })());

    tasks.push((async () => {
      try {
        const ledgerData = await paymentLedgerService.getAllPayments(startDate, now, user?.company_id);
        setLedger(ledgerData as unknown as StaffPayment[]);
      } catch (error) {
        captureException(error, {
          level: "error",
          tags: { companyId: user?.company_id, route: "/admin/staff-hours", step: "load_ledger" },
        });
        setLedgerError(dbErrorMessage(error, { entity: "payment ledger" }));
      }
    })());

    if (user?.company_id) {
      tasks.push((async () => {
        try {
          const reconData = await timeClockService.getReconciliation(
            user.company_id as string,
            startDate.toISOString(),
            now.toISOString(),
          );
          setRecon(reconData);
        } catch (error) {
          captureException(error, {
            level: "error",
            tags: { companyId: user?.company_id, route: "/admin/staff-hours", step: "load_recon" },
          });
          // Recon is intel - silent fail. The card just stays empty.
        }
      })());
    }

    await Promise.all(tasks);
    setLoading(false);
  };

  const groupedSessions = sessions.reduce<Record<string, StaffGroup>>((acc, session) => {
    const staffId = session.staff_id;
    if (!acc[staffId]) {
      acc[staffId] = {
        staff: session.staff,
        sessions: [],
        totalHours: 0,
        totalEarningsCents: 0,
        unpaidSessions: [],
      };
    }
    acc[staffId].sessions.push(session);
    acc[staffId].totalHours += Number(session.total_hours || 0);
    acc[staffId].totalEarningsCents += centsOf(session.total_earnings);
    if (session.payment_status === "unpaid") {
      acc[staffId].unpaidSessions.push(session);
    }
    return acc;
  }, {});

  const handleProcessPayment = async (staffId: string, sessionIds: string[]) => {
    setLoading(true);
    try {
      const ledgerEntry = await paymentLedgerService.processStaffPayment(
        staffId,
        sessionIds,
        paymentData.method,
        paymentData.reference,
        paymentData.notes
      );

      // Notify the staff member their wages were paid out. Best-effort
      // (a notification failure must never roll back a recorded
      // payment) and deduped on the ledger row so a double-fire can't
      // spam the recipient. staff_work_sessions.staff_id references
      // profiles.id, so it is a valid recipient_id.
      try {
        const entry = ledgerEntry as { id?: string; total_amount?: number | null; total_hours?: number | null } | null;
        const amountCents = centsOf(entry?.total_amount);
        const hours = Number(entry?.total_hours || 0);
        await notificationService.createNotification({
          company_id: user?.company_id,
          recipient_id: staffId,
          notification_type: "staff_wage_paid",
          title: "Wages paid",
          message: `A wage payment of ${fmtMoney(amountCents)} covering ${hours.toFixed(1)} hours was recorded for you (${paymentData.method.replace("_", " ")}).`,
          priority: "normal",
          related_entity_type: "staff_payment_ledger",
          related_entity_id: entry?.id,
          dedup: true,
        });
      } catch (notifyErr) {
        captureException(notifyErr, {
          level: "warning",
          tags: { companyId: user?.company_id, route: "/admin/staff-hours", step: "notify_wage_paid" },
        });
      }

      setPaymentDialog(false);
      setPaymentData({ method: "cash", reference: "", notes: "" });
      await loadData();
      toast({ title: "Payment recorded" });
    } catch (error) {
      captureException(error, {
        level: "error",
        tags: { companyId: user?.company_id, route: "/admin/staff-hours", step: "process_payment" },
      });
      toast({
        title: "Payment failed",
        description: dbErrorMessage(error, { entity: "payment" }),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Phase 18 #7: build sorted entries once so the JSX stays simple
  // and the comparator only fires when the user picks a new sort.
  const sortedStaffEntries: Array<[string, StaffGroup]> = Object.entries(groupedSessions).sort(
    ([, a], [, b]) => {
      const unpaidOf = (x: StaffGroup) => sumEarningsCents(x.unpaidSessions);
      switch (staffSort) {
        case "hours_desc":
          return Number(b.totalHours || 0) - Number(a.totalHours || 0);
        case "earnings_desc":
          return b.totalEarningsCents - a.totalEarningsCents;
        case "name_asc":
          return String(a.staff?.full_name || "").localeCompare(String(b.staff?.full_name || ""));
        case "unpaid_desc":
        default:
          return unpaidOf(b) - unpaidOf(a);
      }
    },
  );

  // Cents throughout so "Unpaid" always equals the sum of the amber
  // per-staff unpaid boxes below (same rows, same integer maths).
  const summary = {
    totalStaff: Object.keys(groupedSessions).length,
    totalHours: Object.values(groupedSessions).reduce((sum, staff) => sum + staff.totalHours, 0),
    totalUnpaidCents: Object.values(groupedSessions).reduce(
      (sum, staff) => sum + sumEarningsCents(staff.unpaidSessions), 0),
    totalPaidCents: ledger.reduce((sum, payment) => sum + centsOf(payment.total_amount), 0),
  };

  // Honest period copy on the tiles. Pre-fix the sub-lines read
  // "Active this week" even when a custom range was applied, because
  // `period` only tracks the week / month presets.
  const periodLabel = rangeMode === "custom"
    ? "in the selected range"
    : period === "week" ? "in the last 7 days" : "in the last 30 days";

  // STH-B intel: open-shift anomalies. Any session with no
  // clock_out that started more than 14 hours ago is almost
  // certainly a forgot-to-clock-out, not a real ongoing shift.
  // Surface as a banner so payroll doesn't accidentally pay for
  // 16 hours of cooking that didn't happen.
  const openShiftAnomalies = sessions.filter((s) => {
    if (s.clock_out) return false;
    const startMs = new Date(s.clock_in).getTime();
    if (!Number.isFinite(startMs)) return false;
    return Date.now() - startMs > 14 * 60 * 60 * 1000;
  });

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Time clock log - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Staff hours"
            icon={Clock}
            subtitle={
              <>
                Clock-in / clock-out audit per staff member, with payments processed on this page. For the full wage roll-up (BCEA overtime + Sunday + public-holiday splits) see{" "}
                <Link href={withSlug("/admin/wages")} className="font-semibold text-white underline underline-offset-2 hover:text-white/80 inline-flex items-center gap-0.5">
                  Wages dashboard <ExternalLink className="w-3 h-3" />
                </Link>
                .
              </>
            }
            meta={
              !loading && (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {summary.totalStaff} staff clocked in this period
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {Number(summary.totalHours || 0).toFixed(1)}h worked
                  </span>
                  {summary.totalUnpaidCents > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {fmtMoney(summary.totalUnpaidCents)} unpaid
                    </span>
                  )}
                </>
              )
            }
            actions={
            <>
            {/* Phase 17 #10: CSV export. Payroll team needs an
                offline copy of the period roll-up to push through
                their bank-transfer template + reconcile against
                the ledger. Exports the sessions list (active
                shifts) since that's the live tracking surface;
                the payment ledger has its own historical
                snapshot. */}
            <Button
              variant="outline"
              onClick={() => {
                if (sessions.length === 0) {
                  toast({ title: "Nothing to export", description: "No sessions in this period." });
                  return;
                }
                // STH-B: CSV columns were referencing fields that
                // don't exist on the actual schema (staff_name,
                // hours_worked, is_paid). Real shape from
                // timeClockService.getAllStaffWorkSessions:
                // session.staff.{full_name,email}, clock_in,
                // clock_out, total_hours, total_earnings,
                // payment_status. Export was effectively dead.
                const headers = [
                  "Staff name", "Email", "Clock in", "Clock out", "Hours",
                  "Total earnings", "Payment status",
                ];
                const esc = (v: unknown) => {
                  if (v == null) return "";
                  const s = String(v).replace(/"/g, '""');
                  return /[",\n]/.test(s) ? `"${s}"` : s;
                };
                const lines = [headers.join(",")];
                for (const s of sessions) {
                  lines.push([
                    esc(s.staff?.full_name || ""),
                    esc(s.staff?.email || ""),
                    esc(s.clock_in),
                    esc(s.clock_out),
                    esc(Number(s.total_hours || 0).toFixed(2)),
                    esc(Number(s.total_earnings || 0).toFixed(2)),
                    esc(s.payment_status),
                  ].join(","));
                }
                // STH-B: UTF-8 BOM for Excel-ZA, matches every
                // other admin CSV export.
                const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const stamp = toLocalISO(new Date());
                // Filename tags the ACTIVE range mode; `period` lags
                // behind when a custom window is applied.
                a.download = `staff-hours_${rangeMode === "custom" ? `${customFrom}_to_${customTo}` : rangeMode}_${stamp}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="gap-2 self-start sm:self-auto"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            </>
            }
          />
          <PageWorkbench />

          {/* Load failures are persistent + retryable. The old
              toast-only path vanished after a few seconds and left
              zeroed tiles that read as "no shifts this week". */}
          {(sessionsError || ledgerError) && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-rose-900">
                {sessionsError ? "Couldn't load clock-ins" : "Couldn't load the payment ledger"}
              </p>
              <p className="mt-1 text-sm text-slate-600">{sessionsError || ledgerError}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={loadData} disabled={loading}>
                Retry
              </Button>
            </div>
          )}

          {/* STH-B intel: open-shift anomaly banner. A session
              still open more than 14 hours after clock-in is
              almost certainly a forgot-to-clock-out. Surfacing
              them here prevents the operator paying out a 16-hour
              "shift" that was actually a 7-hour shift + 9 hours
              the session was left open with nobody around to close it. */}
          {openShiftAnomalies.length > 0 && (
            <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  {openShiftAnomalies.length} clock-in{openShiftAnomalies.length === 1 ? "" : "s"} still open more than 14 hours
                </p>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  Probable forgot-to-clock-out events. Review and close them before processing payments so you don&apos;t pay for hours that weren&apos;t worked.
                </p>
                <ul className="mt-1.5 text-xs text-amber-800 space-y-0.5">
                  {openShiftAnomalies.slice(0, 5).map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.staff?.full_name || "Unknown staff"}</span>
                      {" - clocked in "}
                      {formatLocalDate(s.clock_in)}
                    </li>
                  ))}
                  {openShiftAnomalies.length > 5 && (
                    <li className="italic">+ {openShiftAnomalies.length - 5} more</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Total Staff <InfoTooltip content={"Number of staff who clocked in at least once during this period."} /></CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalStaff}</div>
                <p className="text-xs text-muted-foreground">Active {periodLabel}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Total Hours <InfoTooltip content={"Total hours your team has clocked during this period."} /></CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Number(summary.totalHours || 0).toFixed(1)}h</div>
                <p className="text-xs text-muted-foreground">Worked {periodLabel}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Unpaid <InfoTooltip content={"What you still owe staff for shifts that have not yet been paid out."} /></CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{fmtMoney(summary.totalUnpaidCents)}</div>
                <p className="text-xs text-muted-foreground">Pending payment</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Paid Out <InfoTooltip content={"Total paid out to staff during this period."} /></CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-brand-primary">{fmtMoney(summary.totalPaidCents)}</div>
                <p className="text-xs text-muted-foreground">Paid {periodLabel}</p>
              </CardContent>
            </Card>
          </div>

          {/* Toolbar: range + sort + actions grouped into one card
              (command-centre standard) instead of a floating strip. */}
          <Card className="mb-6">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* STH-C: range mode now includes Custom. Pre-STH-C
                  the period was locked to 7 or 30 days; payroll
                  runs the audit on arbitrary windows. */}
              <Select
                value={rangeMode}
                onValueChange={(v) => {
                  const mode = v as "week" | "month" | "custom";
                  setRangeMode(mode);
                  // Keep `period` in sync for the tile copy that
                  // reads "Active this week" / "Active this month".
                  if (mode !== "custom") setPeriod(mode);
                  if (mode === "custom" && !customFrom) {
                    const d = new Date();
                    d.setDate(d.getDate() - 7);
                    setCustomFrom(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
                  }
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {rangeMode === "custom" && (
                <>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-[150px]"
                    aria-label="From date"
                  />
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-[150px]"
                    aria-label="To date"
                  />
                </>
              )}
              {/* Phase 18 #7: order staff cards by what payroll
                  actually triages on. Default is highest-unpaid
                  first because that's the run-up-to-payday case. */}
              <Select value={staffSort} onValueChange={(v: any) => setStaffSort(v)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid_desc">Sort: Unpaid (high to low)</SelectItem>
                  <SelectItem value="hours_desc">Sort: Hours (high to low)</SelectItem>
                  <SelectItem value="earnings_desc">Sort: Earnings (high to low)</SelectItem>
                  <SelectItem value="name_asc">Sort: Name (A to Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {/* STH-C: manager backfill for a clock-in that
                  never happened (clock-in missed / forgot to
                  clock in). Inserts a staff_work_sessions row
                  with entered_manually=true so payroll can
                  audit which sessions weren't real clock-ins. */}
              <Button variant="outline" onClick={() => {
                setManualDraft({ staffId: "", clockIn: "", clockOut: "", reason: "" });
                setManualOpen(true);
              }}>
                + Add manual shift
              </Button>
              <Button onClick={loadData} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </Button>
            </div>
            </CardContent>
          </Card>

          {/* STH-C: clocked-vs-scheduled reconciliation tile.
              Surfaces the divergent-source-of-truth problem to the
              operator: this page reads staff_work_sessions (live
              clock-ins); /admin/wages reads kitchen_staff_shifts
              (manager-entered shift roster). When the two numbers
              disagree significantly the operator knows the wage
              roll-up isn't seeing the same hours as the clock-in
              audit. Hidden when both are zero (nothing to
              reconcile) or when reconciliation hasn't loaded yet. */}
          {recon && (recon.clocked_hours > 0 || recon.scheduled_hours > 0) && (() => {
            const gap = recon.scheduled_hours - recon.clocked_hours;
            const gapPct = recon.scheduled_hours > 0
              ? Math.abs(gap) / recon.scheduled_hours * 100
              : 100;
            const significant = gapPct >= 10;
            return (
              <Card className={`mb-6 ${significant ? "border-amber-300 bg-amber-50/60" : "border-slate-200"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {significant && <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3 flex-wrap text-sm">
                        <span className="font-semibold">
                          Clocked vs scheduled
                        </span>
                        <span className="tabular-nums">
                          <strong>{recon.clocked_hours.toFixed(1)}h</strong>
                          {" clocked-in "}
                          <span className="text-slate-500">({recon.clocked_session_count} session{recon.clocked_session_count === 1 ? "" : "s"})</span>
                        </span>
                        <span className="tabular-nums">
                          <strong>{recon.scheduled_hours.toFixed(1)}h</strong>
                          {" scheduled "}
                          <span className="text-slate-500">({recon.scheduled_shift_count} shift{recon.scheduled_shift_count === 1 ? "" : "s"})</span>
                        </span>
                        <span className={`tabular-nums ${significant ? "text-amber-800 font-semibold" : "text-slate-500"}`}>
                          {gap === 0 ? "in sync" : `gap ${gap > 0 ? "+" : ""}${gap.toFixed(1)}h`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        This page reads live clock-ins. The{" "}
                        <Link href={withSlug("/admin/wages")} className="text-blue-600 hover:underline">
                          Wages dashboard
                        </Link>
                        {" "}reads the manager-entered shift roster. A large gap means one surface is missing data the other has.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "hours" | "ledger" | "monthly-audit")} className="space-y-6">
            <TabsList>
              <TabsTrigger value="hours">Staff Hours</TabsTrigger>
              <TabsTrigger value="ledger">Payment Ledger</TabsTrigger>
              <TabsTrigger value="monthly-audit">Monthly audit</TabsTrigger>
            </TabsList>

            <TabsContent value="monthly-audit" className="space-y-4">
              <MonthlyPayrollAudit companyId={user?.company_id} />
            </TabsContent>

            <TabsContent value="hours" className="space-y-4">
              {loading && sortedStaffEntries.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                    Loading clock-ins...
                  </CardContent>
                </Card>
              )}
              {/* STH-B: explicit empty state. Pre-STH-B if a
                  tenant routes everything through the manager-
                  entered shift flow on /admin/wages, this page
                  showed zero rows under zero tiles with no
                  explanation - looked like a broken surface. */}
              {sortedStaffEntries.length === 0 && !loading && !sessionsError && (
                <Card className="border-dashed border-2">
                  <CardContent className="py-10 text-center">
                    <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">No clock-ins in this period</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      This page only shows live clock-in / clock-out sessions. If your team works off manager-entered shifts on the roster instead, the wage report on{" "}
                      <Link href={withSlug("/admin/wages")} className="text-blue-600 hover:underline">
                        /admin/wages
                      </Link>
                      {" "}is the source of truth. You can also{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setManualDraft({ staffId: "", clockIn: "", clockOut: "", reason: "" });
                          setManualOpen(true);
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        add a manual shift
                      </button>
                      {" "}to backfill a missed clock-in.
                    </p>
                  </CardContent>
                </Card>
              )}
              {sortedStaffEntries.map(([staffId, data]) => (
                <Card key={staffId}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{data.staff?.full_name || "Unknown"}</CardTitle>
                        <CardDescription>
                          {data.staff?.role} • {data.staff?.email}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{Number(data.totalHours || 0).toFixed(1)}h</div>
                        <div className="text-sm text-muted-foreground">
                          {fmtMoney(data.totalEarningsCents)} total
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {data.unpaidSessions.length > 0 && (
                      <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Unpaid Hours</span>
                          <span className="text-lg font-bold text-amber-600">
                            {fmtMoney(sumEarningsCents(data.unpaidSessions))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            {Number(data.unpaidSessions.reduce((sum: number, s: any) => sum + Number(s.total_hours || 0), 0)).toFixed(1)} hours
                          </span>
                          <Dialog open={paymentDialog && selectedStaff === staffId} onOpenChange={(open) => {
                            setPaymentDialog(open);
                            if (!open) setSelectedStaff(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" onClick={() => setSelectedStaff(staffId)}>
                                Process Payment
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Process Payment for {data.staff?.full_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="p-4 bg-muted rounded-lg">
                                  <div className="flex justify-between mb-2">
                                    <span>Total Hours:</span>
                                    <span className="font-bold">
                                      {Number(data.unpaidSessions.reduce((sum: number, s: any) => sum + Number(s.total_hours || 0), 0)).toFixed(1)}h
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Total Amount:</span>
                                    <span className="font-bold text-brand-primary">
                                      {fmtMoney(sumEarningsCents(data.unpaidSessions))}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>Payment Method</Label>
                                  <Select
                                    value={paymentData.method}
                                    onValueChange={(v: any) => setPaymentData({ ...paymentData, method: v })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="cash">Cash</SelectItem>
                                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                      <SelectItem value="eft">EFT</SelectItem>
                                      <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Reference (optional)</Label>
                                  <Input
                                    placeholder="Payment reference or transaction ID"
                                    value={paymentData.reference}
                                    onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Notes (optional)</Label>
                                  <Textarea
                                    placeholder="Any additional notes about this payment"
                                    value={paymentData.notes}
                                    onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                                    rows={2}
                                  />
                                </div>

                                <Button
                                  onClick={() => handleProcessPayment(staffId, data.unpaidSessions.map((s: any) => s.id))}
                                  disabled={loading}
                                  className="w-full"
                                >
                                  {loading ? "Processing..." : "Confirm Payment"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-sm font-medium mb-2">Recent Sessions</div>
                      {data.sessions.slice(0, 5).map((session) => (
                        <div key={session.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {/* STH-B: was `session.clock_in_time`
                                which doesn't exist on the schema -
                                rendered "Invalid Date" on every
                                row. Real column is clock_in. */}
                            <span>{formatLocalDate(session.clock_in)}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap justify-end">
                            <span>{Number(session.total_hours || 0).toFixed(1)}h</span>
                            <span className="font-medium">{fmtMoney(centsOf(session.total_earnings))}</span>
                            {/* STH-C: Manual chip when this row was
                                backfilled. Title hovers the reason
                                the manager gave. */}
                            {session.entered_manually && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-amber-300 text-amber-800 bg-amber-50"
                                title={session.entry_reason || "Manually backfilled"}
                              >
                                Manual
                              </Badge>
                            )}
                            <Badge variant={session.payment_status === "paid" ? "default" : "secondary"}>
                              {session.payment_status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="ledger" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="flex items-center gap-1.5">Payment History <InfoTooltip content={"Every staff payment in this period, including the method, hours covered and rate paid."} /></CardTitle>
                    <CardDescription>
                      Complete record of all staff payments
                    </CardDescription>
                  </div>
                  {/* Phase 21 #7: payment ledger CSV. The sessions
                      tab already exports the active shift log
                      (Phase 17 #10) but this historical payments
                      tab had no export. Payroll reconciliation
                      and bookkeeping batch needs both. */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ledger.length === 0}
                    onClick={() => {
                      if (ledger.length === 0) return;
                      const esc = (v: unknown) => {
                        if (v == null) return "";
                        const s = String(v).replace(/"/g, '""');
                        return /[",\n]/.test(s) ? `"${s}"` : s;
                      };
                      const headers = [
                        "Staff", "Period start", "Period end", "Hours", "Hourly rate",
                        "Total", "Method", "Paid on",
                      ];
                      const lines = [headers.join(",")];
                      for (const p of ledger) {
                        lines.push([
                          esc(p.staff?.full_name || ""),
                          esc(p.payment_period_start || ""),
                          esc(p.payment_period_end || ""),
                          esc(Number(p.total_hours || 0).toFixed(2)),
                          esc(Number(p.hourly_rate || 0).toFixed(2)),
                          esc(Number(p.total_amount || 0).toFixed(2)),
                          esc(p.payment_method || ""),
                          esc(p.payment_date || ""),
                        ].join(","));
                      }
                      // STH-B: UTF-8 BOM.
                      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `payment-ledger-${toLocalISO(new Date())}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export ledger
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {ledger.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{payment.staff?.full_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatLocalDate(payment.payment_period_start)} - {formatLocalDate(payment.payment_period_end)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {Number(payment.total_hours || 0).toFixed(1)} hours @ {fmtMoney(centsOf(payment.hourly_rate))}/hr
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-brand-primary">
                            {fmtMoney(centsOf(payment.total_amount))}
                          </div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {(payment.payment_method || "").replace("_", " ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatLocalDate(payment.payment_date)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {ledger.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Banknote className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No payments recorded for this period</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* STH-B: replaced the dead /hr-solutions link with a
              useful cross-link strip. The old card pointed to a
              page that doesn't exist in the codebase, and the
              "we're not an HR solution" framing told the operator
              what the page WASN'T rather than what it was for.
              Now: clear pointers to the two surfaces this page
              hands off to. */}
          <Card className="mt-8 border-slate-200 bg-slate-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-900">Where the rest lives</CardTitle>
              <CardDescription className="text-slate-600">
                This page is the live clock-in audit. Pay rates, BCEA splits and the wage report are elsewhere.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button asChild variant="outline">
                  <Link href={withSlug("/admin/wages")} className="justify-start gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Wage report (BCEA)
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={withSlug("/admin/staff")} className="justify-start gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Staff &amp; rates
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={withSlug("/admin/cashflow-dashboard")} className="justify-start gap-1.5">
                    <Banknote className="w-3.5 h-3.5" />
                    Cashflow forecast
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </PortalShell>

        {/* STH-C: manual-entry dialog. Manager backfill for a
            clock-in that never happened. Writes a
            staff_work_sessions row with entered_manually=true so
            payroll can audit which sessions weren't real clock-
            ins. Earnings auto-computed off the same rate fallback
            chain clockOut uses. */}
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add manual shift</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Backfill a shift that didn&apos;t get logged at the time. The session is tagged &quot;Manual&quot; so payroll knows it wasn&apos;t a real clock-in. Hours and earnings are computed off the staff member&apos;s hourly rate.
              </p>
              <div className="space-y-1.5">
                <Label>Staff member</Label>
                <Select
                  value={manualDraft.staffId}
                  onValueChange={(v) => setManualDraft((d) => ({ ...d, staffId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {roster.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name || r.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Clock-in</Label>
                  <Input
                    type="datetime-local"
                    value={manualDraft.clockIn}
                    onChange={(e) => setManualDraft((d) => ({ ...d, clockIn: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Clock-out</Label>
                  <Input
                    type="datetime-local"
                    value={manualDraft.clockOut}
                    onChange={(e) => setManualDraft((d) => ({ ...d, clockOut: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. forgot to clock out, machine offline, double-shift"
                  value={manualDraft.reason}
                  onChange={(e) => setManualDraft((d) => ({ ...d, reason: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setManualOpen(false)} disabled={manualSaving}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!user?.id || !user?.company_id) return;
                    if (!manualDraft.staffId) {
                      toast({ title: "Pick a staff member", variant: "destructive" });
                      return;
                    }
                    if (!manualDraft.clockIn || !manualDraft.clockOut) {
                      toast({ title: "Set both timestamps", variant: "destructive" });
                      return;
                    }
                    // Guard the obvious backfill typo: a clock-out at
                    // or before clock-in would store a zero / negative
                    // session that pollutes the payroll audit.
                    if (new Date(manualDraft.clockOut).getTime() <= new Date(manualDraft.clockIn).getTime()) {
                      toast({ title: "Clock-out must be after clock-in", variant: "destructive" });
                      return;
                    }
                    setManualSaving(true);
                    try {
                      await timeClockService.createManualSession({
                        staffId: manualDraft.staffId,
                        companyId: user.company_id,
                        // datetime-local values are zone-naive but
                        // local; convert to ISO via Date so they
                        // store as UTC the same way live clock-ins
                        // do.
                        clockInIso: new Date(manualDraft.clockIn).toISOString(),
                        clockOutIso: new Date(manualDraft.clockOut).toISOString(),
                        entryReason: manualDraft.reason.trim(),
                        enteredByUserId: user.id,
                      });
                      toast({ title: "Manual shift recorded" });
                      setManualOpen(false);
                      void loadData();
                    } catch (e: unknown) {
                      toast({
                        title: "Couldn't record shift",
                        description: dbErrorMessage(e, { entity: "shift" }),
                        variant: "destructive",
                      });
                    } finally {
                      setManualSaving(false);
                    }
                  }}
                  disabled={manualSaving}
                >
                  {manualSaving ? "Saving..." : "Save shift"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </>
  );
}
