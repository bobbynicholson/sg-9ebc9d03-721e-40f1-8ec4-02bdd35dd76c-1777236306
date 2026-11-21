/**
 * /admin/kitchen-settlement - per-period kitchen, cleaning and shopping pay summary.
 *
 * Wave 36.3. Mirrors /admin/driver-settlement.tsx in spirit but
 * leaner because kitchen pay has no distance/callout/vehicle logic
 * to summarise - just clocked-hours x rate (+ OT + multiplier).
 *
 * Pick a date range, scan each operations staffer, see who worked
 * how many hours, what they earned, then issue payslips one-tap or
 * in bulk. CSV export for the bookkeeper.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
import { Wallet, Loader2, Download, RefreshCw, Receipt, FileCheck, CheckCircle2, AlertTriangle, UserPlus, Users, Clock, TrendingUp, Banknote, Pencil, FileClock, ArrowRight } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { formatZAR } from "@/lib/formatters";
import { useTenantHref } from "@/lib/tenantUrl";
import {
  summariseStaffPay,
  persistPayslip,
  type PaySummary,
} from "@/services/kitchenPayService";
import { kitchenStaffService } from "@/services/kitchenStaffService";
import { needsKitchenShiftReview, type KitchenShift, type StaffWageSummary } from "@/services/kitchenStaffService";
import { kitchenDutyService } from "@/services/kitchenDutyService";

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

interface SummaryFailure {
  id: string;
  name: string;
  message: string;
}

function defaultPeriodStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function localDayStartISO(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toISOString();
}

function localDayAfterISO(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date + 1).toISOString();
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

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  const [summariseFailed, setSummariseFailed] = useState<SummaryFailure[]>([]);
  const [persisting, setPersisting] = useState<string | null>(null);
  const [bulkPersisting, setBulkPersisting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // Active staff on kitchen_staff_members with NO linked profile. They
  // appear on /admin/wages (the report reads kitchen_staff_members) but
  // CANNOT be issued a payslip here - kitchen_payslips.staff_id is a
  // hard FK to profiles, so a profile-less staffer has no valid key.
  // Surfacing them stops them being silently dropped from settlement.
  const [staffWageRows, setStaffWageRows] = useState<StaffWageSummary[]>([]);
  const [rosterShifts, setRosterShifts] = useState<KitchenShift[]>([]);
  const [expandedRosterRows, setExpandedRosterRows] = useState<Set<string>>(() => new Set());
  const [selectedDepartment, setSelectedDepartment] = useState<"kitchen" | "cleaning" | "shopping" | "all">("all");
  const [companyBrand, setCompanyBrand] = useState<{ name: string | null; slug: string | null }>({ name: null, slug: null });
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<PaySummary["shifts"][number] | null>(null);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftDraft, setShiftDraft] = useState({ start: "", end: "", breakMin: "0", notes: "", reason: "" });
  const realtimeSuppressionUntilRef = useRef(0);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const periodKey = `${periodStart}__${periodEnd}`;
  const rangeInvalid = !!periodStart && !!periodEnd && periodStart > periodEnd;

  const load = async () => {
    if (!companyId) return;
    // This read follows the user action or period change that caused it.
    // Ignore its own realtime echoes so one payslip/clock save doesn't
    // immediately start a second full settlement fetch.
    realtimeSuppressionUntilRef.current = Date.now() + 2500;
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
    realtimeRefreshTimerRef.current = null;
    setLoading(true);
    setLoadError(null);
    try {
      // 1) Pull tenant profiles, then restrict the settlement rows to
      // profiles actually linked to an operations roster member. Profile
      // roles alone are not the source of team membership and used to put
      // admins, owners and unrelated staff in this table.
      const { data: staffRes, error: staffResError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, hourly_rate, role, active_role")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
      if (staffResError) {
        console.error("[admin/kitchen-settlement] profiles fetch failed:", staffResError);
        // Silent-failure audit: an empty staff list here read as
        // "no staff to settle". Route it to the toast in the catch.
        throw staffResError;
      }
      const allProfiles = (staffRes || []) as Staffer[];
      const rangeStartISO = localDayStartISO(periodStart);
      const rangeEndExclusiveISO = localDayAfterISO(periodEnd);
      const [wageRows, rosterShifts] = await Promise.all([
        kitchenStaffService.getWageSummary(
          companyId,
          rangeStartISO,
          rangeEndExclusiveISO,
        ),
        kitchenStaffService.listShiftsInRange(
          companyId,
          rangeStartISO,
          rangeEndExclusiveISO,
        ),
      ]);
      const linkedProfileIds = new Set(wageRows.flatMap((row) => row.linked_profile_id ? [row.linked_profile_id] : []));
      const staffRows = allProfiles.filter((profile) => linkedProfileIds.has(profile.id));
      setStaff(staffRows);
      setStaffWageRows(wageRows);
      setRosterShifts(rosterShifts);

      // 2) Summarise pay for each
      const sumMap: Record<string, PaySummary> = {};
      const failedNames: SummaryFailure[] = [];
      for (const s of staffRows) {
        // Sequential to avoid hammering the DB. Catering tenants
        // typically have <20 chefs so this is acceptable.
        try {
          const sum = await summariseStaffPay(supabase as any, {
            companyId,
            staffId: s.id,
            periodStart,
            periodEnd,
            rangeStartISO,
            rangeEndExclusiveISO,
          });
          const wageRowsForProfile = wageRows.filter((row) => row.linked_profile_id === s.id);
          const cents = (value: number) => Math.round((Number(value) || 0) * 100);
          const standardPay = wageRowsForProfile.reduce((total, row) => total + cents(row.standard_wage), 0) / 100;
          const overtimePay = wageRowsForProfile.reduce((total, row) => total + cents(row.overtime_wage), 0) / 100;
          const premiumPay = wageRowsForProfile.reduce((total, row) => total + cents(row.sunday_holiday_wage), 0) / 100;
          const totalPay = wageRowsForProfile.reduce((total, row) => total + cents(row.total_wage), 0) / 100;
          const totalMinutes = wageRowsForProfile.reduce((total, row) => total + row.total_min, 0);
          const reviewCount = wageRowsForProfile.reduce((total, row) => total + row.review_shifts_count, 0);
          // Wages is the canonical rollup for every roster-linked staffer.
          // Keep its totals on the payslip summary too, while retaining this
          // service's clock lines for the settlement detail/editor.
          sumMap[s.id] = {
            ...sum,
            totalHours: Math.round((totalMinutes / 60) * 100) / 100,
            basePay: standardPay,
            overtimePay,
            multiplierPay: premiumPay,
            totalPay,
            shiftsNeedingReview: reviewCount,
          };
        } catch (e) {
          // Partial-failure audit: a swallowed summarise made this
          // person read as R0 in the totals. Track and surface it.
          console.warn("[kitchen-settlement] summarise failed:", s.id, e);
          failedNames.push({
            id: s.id,
            name: s.full_name || s.email,
            message: e?.message || "Unknown calculation error",
          });
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
      setStaffWageRows([]);
      setRosterShifts([]);
      toast({ title: "Could not load settlement", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (supabase as any)
      .from("companies")
      .select("company_name, slug")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }: { data: { company_name?: string | null; slug?: string | null } | null }) => {
        if (cancelled) return;
        setCompanyBrand({
          name: data?.company_name || null,
          slug: data?.slug || user?.company_slug || null,
        });
      })
      .catch((error: unknown) => {
        console.warn("[admin/kitchen-settlement] tenant branding lookup failed:", error);
        if (!cancelled) setCompanyBrand({ name: null, slug: user?.company_slug || null });
      });
    return () => { cancelled = true; };
  }, [companyId, user?.company_slug]);

  useEffect(() => {
    if (rangeInvalid) {
      setLoading(false);
      setLoadError("Period start must be on or before period end.");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, periodKey, refreshTick, rangeInvalid]);

  // Match driver settlement: a clock-out, roster correction, rate change or
  // payslip action in another tab should refresh this pay run automatically.
  useEffect(() => {
    if (!companyId) return;
    const refreshSoon = () => {
      if (Date.now() < realtimeSuppressionUntilRef.current) {
        if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
        return;
      }
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        setRefreshTick((value) => value + 1);
      }, 750);
    };
    const channel = supabase
      .channel(`kitchen-settlement:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_staff_shifts", filter: `company_id=eq.${companyId}` }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_duty_shifts", filter: `company_id=eq.${companyId}` }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_staff_members", filter: `company_id=eq.${companyId}` }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_payslips", filter: `company_id=eq.${companyId}` }, refreshSoon)
      .subscribe();
    return () => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  const visibleRosterRows = useMemo(
    () => staffWageRows.filter((row) => selectedDepartment === "all" || row.departments.includes(selectedDepartment)),
    [staffWageRows, selectedDepartment],
  );
  const visibleProfileIds = new Set(visibleRosterRows.flatMap((row) => row.linked_profile_id ? [row.linked_profile_id] : []));
  const visibleStaff = staff.filter((person) => visibleProfileIds.has(person.id));
  const activeLinkedProfileIds = new Set(staff.map((person) => person.id));
  const visibleUnlinkedPay = visibleRosterRows.filter((row) => !row.linked_profile_id || !activeLinkedProfileIds.has(row.linked_profile_id));

  const visibleShiftLines = (summary: PaySummary) => summary.shifts.filter((shift) => {
    if (selectedDepartment === "all") return true;
    if (shift.source === "kitchen_duty_shifts") return selectedDepartment === "kitchen";
    const rosterShift = rosterShifts.find((row) => row.id === shift.shift_id);
    return rosterShift?.department === selectedDepartment || (!rosterShift && selectedDepartment === "kitchen");
  });

  const totals = useMemo(() => {
    // Wages is the canonical roster rollup. Sum these same rows for linked
    // and roster-only staff so the report and settlement cannot drift when
    // a profile summary fails or a person works across multiple departments.
    let hours = 0, baseC = 0, otC = 0, multC = 0, totalC = 0;
    for (const row of visibleRosterRows) {
      hours += row.total_min / 60;
      baseC += toCents(row.standard_wage);
      otC += toCents(row.overtime_wage);
      multC += toCents(row.sunday_holiday_wage);
      totalC += toCents(row.total_wage);
    }
    const chefsWithHours = visibleRosterRows.filter((row) => row.total_min > 0).length;
    const heldStaff = visibleRosterRows.filter((row) => row.review_shifts_count > 0).length;
    return {
      hours,
      base: baseC / 100,
      ot: otC / 100,
      mult: multC / 100,
      total: totalC / 100,
      chefsWithHours,
      heldStaff,
    };
  }, [visibleRosterRows]);

  const readyToIssueCount = visibleStaff.map((person) => summaries[person.id]).filter((summary): summary is PaySummary => !!summary).filter((summary) => {
    const slip = existingPayslips[summary.staffId];
    const staleIssued = !!slip && slip.status === "issued" && toCents(Number(slip.total_pay)) !== toCents(summary.totalPay);
    return summary.totalPay > 0 && summary.shiftsNeedingReview === 0 &&
      (!slip || slip.status === "draft" || staleIssued);
  }).length;

  const findNextSettlementStaff = (currentId: string, status: "issued" | "paid") => {
    const currentIndex = visibleStaff.findIndex((person) => person.id === currentId);
    const ordered = [...visibleStaff.slice(currentIndex + 1), ...visibleStaff.slice(0, currentIndex + 1)];
    return ordered.find((person) => {
      const summary = summaries[person.id];
      const slip = existingPayslips[person.id];
      if (!summary || summary.totalPay <= 0 || summary.shiftsNeedingReview > 0) return false;
      if (status === "paid") return !!slip && slip.status !== "paid";
      return !slip || slip.status === "draft";
    })?.id || null;
  };

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

  const issuePayslip = async (staffId: string, status: "draft" | "issued" | "paid", goToNext = false) => {
    const summary = summaries[staffId];
    if (!summary || !companyId) return;
    if (summary.shiftsNeedingReview > 0) {
      toast({
        title: "Review shifts before paying",
        description: `${summary.shiftsNeedingReview} clock record${summary.shiftsNeedingReview === 1 ? " needs" : "s need"} correction for ${summary.staffName || "this staff member"}.`,
        variant: "destructive",
      });
      return;
    }
    const nextStaffId = goToNext && status !== "draft" ? findNextSettlementStaff(staffId, status) : null;
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
      if (goToNext) setSelectedStaffId(nextStaffId);
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
      const candidates = visibleStaff.map((person) => summaries[person.id]).filter((s): s is PaySummary => !!s).filter((s) => {
        const slip = existingPayslips[s.staffId];
        const staleIssued = !!slip && slip.status === "issued" && toCents(Number(slip.total_pay)) !== toCents(s.totalPay);
        return s.totalPay > 0 && s.shiftsNeedingReview === 0 &&
          (!slip || slip.status === "draft" || staleIssued);
      });
      if (candidates.length === 0) {
        toast({ title: "No payslips ready to issue", description: "Check the period and resolve any shift reviews first." });
        return;
      }
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
        const heldCount = visibleStaff.filter((person) => (summaries[person.id]?.shiftsNeedingReview || 0) > 0).length;
        toast({
          title: `Issued ${issued} payslip${issued === 1 ? "" : "s"}`,
          description: heldCount > 0
            ? `Period ${periodStart} - ${periodEnd}. ${heldCount} staff held for shift review.`
            : `Period ${periodStart} - ${periodEnd}`,
        });
      }
      await load();
    } finally {
      setBulkPersisting(false);
    }
  };

  const exportCsv = () => {
    if (visibleStaff.length === 0 && visibleUnlinkedPay.length === 0) return;
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const headers = [
      "Chef", "Email", "Period start", "Period end", "Hourly rate",
      "Total hours", "Base pay", "Overtime pay", "Multiplier premium",
      "Total pay", "Currency", "Payslip status", "Shifts needing review",
    ];
    const lines = [headers.join(",")];
    for (const s of visibleStaff) {
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
        esc(sum.shiftsNeedingReview),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedDepartment}-staff-settlement-${periodStart}_to_${periodEnd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openStaffDetails = (staffId: string) => {
    setEditingShift(null);
    setSelectedStaffId(staffId);
  };

  const toggleRosterDetails = (staffId: string) => {
    setExpandedRosterRows((current) => {
      const next = new Set(current);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const openShiftEditor = (shift: PaySummary["shifts"][number]) => {
    setShiftDraft({
      start: toLocalDateTimeInput(shift.shift_start),
      end: toLocalDateTimeInput(shift.shift_end) || toLocalDateTimeInput(new Date().toISOString()),
      breakMin: String(Math.max(0, shift.total_break_min || 0)),
      notes: shift.notes || "",
      reason: "",
    });
    setEditingShift(shift);
  };

  const saveShiftCorrection = async () => {
    if (!editingShift || !shiftDraft.start || !shiftDraft.end || !shiftDraft.reason.trim()) return;
    const start = new Date(shiftDraft.start);
    const end = new Date(shiftDraft.end);
    const breakMin = Number(shiftDraft.breakMin);
    const grossMin = Math.floor((end.getTime() - start.getTime()) / 60_000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || grossMin <= 0 || grossMin > 24 * 60) {
      toast({ title: "Check the shift times", description: "Clock-out must be after clock-in and the shift must be 24 hours or shorter.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(breakMin) || breakMin < 0 || breakMin > grossMin) {
      toast({ title: "Check the break", description: "Break minutes must be between zero and the shift length.", variant: "destructive" });
      return;
    }
    setShiftSaving(true);
    try {
      if (editingShift.source === "kitchen_staff_shifts") {
        await kitchenStaffService.manualEditShift({
          shiftId: editingShift.shift_id,
          shift_start: start.toISOString(),
          shift_end: end.toISOString(),
          total_break_min: breakMin,
          notes: shiftDraft.notes.trim(),
          override_reason: shiftDraft.reason.trim(),
          edited_by: user?.id || null,
        });
      } else {
        await kitchenDutyService.manualEditDutyShift({
          shiftId: editingShift.shift_id,
          shiftStart: start.toISOString(),
          shiftEnd: end.toISOString(),
          totalBreakMin: breakMin,
          notes: shiftDraft.notes,
          overrideReason: shiftDraft.reason.trim(),
          editedBy: user?.id || null,
        });
      }
      toast({ title: "Shift corrected", description: "Pay and payslip status are being recalculated from the updated clock." });
      setEditingShift(null);
      await load();
    } catch (error: any) {
      toast({ title: "Could not correct shift", description: error?.message || "Try again after checking the shift record.", variant: "destructive" });
    } finally {
      setShiftSaving(false);
    }
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
      <Head><title>Kitchen, cleaning &amp; shopping settlement - {companyBrand.name || "CateringMS"}</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title={
              <span className="flex min-w-0 items-center gap-2">
                {companyBrand.slug && (
                  <img
                    src={`/api/pwa/icon?slug=${encodeURIComponent(companyBrand.slug)}&size=180`}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-md border border-white/20 bg-white object-contain p-0.5"
                  />
                )}
                <span className="truncate">Kitchen, cleaning &amp; shopping settlement</span>
              </span>
            }
            subtitle={
              <>
                Kitchen, cleaning and shopping pay for this period. Clock issues are held for correction before payslips can be issued.{" "}
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
                    {fmtCurrency(totals.total)} period pay
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {Object.keys(existingPayslips).length} payslip{Object.keys(existingPayslips).length === 1 ? "" : "s"} on record
                  </span>
                </>
              ) : undefined
            }
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" size="sm" aria-label="Export settlement CSV" title="Export settlement CSV" className="h-9 w-9 p-0 sm:w-auto sm:gap-1.5 sm:px-3" onClick={exportCsv} disabled={visibleStaff.length === 0 && visibleUnlinkedPay.length === 0}>
                  <Download className="h-4 w-4" /> <span className="sr-only sm:not-sr-only">Export CSV</span>
                </Button>
                <Button
                  size="sm"
                  className="h-9 gap-1.5 bg-brand-primary px-3 text-xs hover:opacity-90 sm:text-sm"
                  onClick={issueAll}
                  disabled={bulkPersisting || readyToIssueCount === 0 || rangeInvalid}
                >
                  {bulkPersisting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Issue {readyToIssueCount} ready</span><span className="sm:hidden">Issue {readyToIssueCount}</span>
                </Button>
              </div>
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
            {!loading && !loadError && summariseFailed.length > 0 && (
              <Alert className="mb-4 border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="flex flex-wrap items-center gap-3 text-amber-900">
                  <div className="min-w-0 flex-1">
                    Pay could not be computed for {summariseFailed.map((failure) => failure.name).join(", ")}.
                    The totals below exclude {summariseFailed.length === 1 ? "this person" : "these people"}.
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {summariseFailed.map((failure) => <li key={failure.id}><span className="font-medium">{failure.name}:</span> {failure.message}</li>)}
                    </ul>
                  </div>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-amber-300 text-amber-900">
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {!loading && !loadError && totals.heldStaff > 0 && (
              <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>
                    {totals.heldStaff} staff {totals.heldStaff === 1 ? "member has" : "members have"} shift records needing review. Earnings from flagged shifts are held; other valid period earnings remain included. Payslips stay blocked until the clock records are corrected.
                  </span>
                  <Link href={withSlug("/admin/wages")} className="shrink-0 font-semibold underline underline-offset-2">
                    Open staff hours
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {/* Period picker: the page's one filter toolbar. mb-6 so
                the stacked sections stop rendering flush against each
                other (pre-fix there was no vertical rhythm at all). */}
            <Card className="mb-6">
              <CardContent className="grid grid-cols-1 gap-4 p-3 md:p-4 xl:grid-cols-[minmax(360px,auto)_minmax(240px,1fr)_auto] xl:items-end">
                <div className="grid min-w-0 grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="period_start" className="text-xs font-medium text-slate-600">Period start</Label>
                    <Input id="period_start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1 h-10 w-full" />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="period_end" className="text-xs font-medium text-slate-600">Period end</Label>
                    <Input id="period_end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 h-10 w-full" />
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  <span className="w-full text-xs font-medium text-slate-600 xl:sr-only">Quick date ranges</span>
                  {/* Copy honesty: the preset sets today minus 6 days
                      through today, which is a rolling 7-day window,
                      not the calendar week. */}
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={setThisWeek}>Last 7 days</Button>
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={setLastWeek}>Last week</Button>
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={setLastMonth}>Last month</Button>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-3 xl:border-0 xl:pt-0">
                  <span className="mr-1 text-xs font-medium text-slate-600">Team</span>
                  {([
                    ["kitchen", "Kitchen"],
                    ["cleaning", "Cleaning"],
                    ["shopping", "Shopping"],
                    ["all", "All teams"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={selectedDepartment === value ? "default" : "outline"}
                      aria-pressed={selectedDepartment === value}
                      className={`h-9 rounded-full px-3 text-xs ${selectedDepartment === value ? "bg-brand-primary text-white hover:bg-brand-primary/90" : ""}`}
                      onClick={() => setSelectedDepartment(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Headline totals: shared StatTile primitives so the
                figures read identically to the rest of the command
                centre. Sums are computed in integer cents in `totals`
                so Base + OT + Premium always equals Total pay. */}
            <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-6">
              <StatTile
                compact
                label="Staff with hours"
                value={loading ? <MetricLoading width="w-10" /> : totals.chefsWithHours}
                icon={Users}
                hint={`of ${visibleRosterRows.length} on this team roster`}
              />
              <StatTile
                compact
                label="Combined hours"
                value={loading ? <MetricLoading width="w-16" /> : `${totals.hours.toFixed(1)}h`}
                icon={Clock}
                hint="Clocked in this period"
              />
              <StatTile
                compact
                label="Base pay"
                value={loading ? <MetricLoading width="w-20" /> : fmtCurrency(totals.base)}
                icon={Banknote}
                hint="Ordinary or fixed-rate pay"
              />
              <StatTile
                compact
                label="OT + premium"
                value={loading ? <MetricLoading width="w-20" /> : fmtCurrency(totals.ot + totals.mult)}
                icon={TrendingUp}
                hint="Overtime and multipliers"
              />
              <StatTile
                compact
                label="Total pay"
                value={loading ? <MetricLoading width="w-20" /> : fmtCurrency(totals.total)}
                icon={Wallet}
                hint={loading ? "Calculating selected period" : totals.heldStaff > 0 ? "Valid shifts included; flagged shifts held" : "Recorded shifts included"}
              />
              <StatTile
                compact
                tone={totals.heldStaff > 0 ? "warn" : "good"}
                label="Held for review"
                value={loading ? <MetricLoading width="w-10" /> : totals.heldStaff}
                icon={AlertTriangle}
                hint={loading ? "Checking shift records" : totals.heldStaff > 0 ? "Shift corrections needed" : "No shifts need correction"}
              />
            </div>

            {/* Per-staffer breakdown */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{selectedDepartment === "all" ? "All operations" : `${selectedDepartment[0].toUpperCase()}${selectedDepartment.slice(1)}`} pay breakdown</CardTitle>
                <CardDescription className="text-xs">
                  Showing staff assigned to this team. Each person&apos;s hours and pay stay combined across assigned operations work for one period settlement; expanded shift details follow the selected team.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <KitchenSettlementLoading companyName={companyBrand.name} companySlug={companyBrand.slug} />
                ) : visibleStaff.length === 0 && visibleUnlinkedPay.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <p>No kitchen, cleaning or shopping staff on the company roster yet.</p>
                    <Link href={withSlug("/admin/kitchen-staff")}>
                      <Button variant="outline" size="sm" className="mt-3 gap-1.5">
                        <UserPlus className="w-3.5 h-3.5" />
                        Add staff and rates
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* A nine-column payroll table is not usable on a phone.
                        Keep its audit-friendly form for desktop and present
                        the same figures as a card per staff member on mobile. */}
                    <div className="space-y-3 p-4 md:hidden">
                      {visibleStaff.map((s) => {
                        const sum = summaries[s.id];
                        const displayShifts = sum ? visibleShiftLines(sum) : [];
                        const ps = existingPayslips[s.id];
                        const summaryFailed = summariseFailed.some((failure) => failure.id === s.id);
                        const hasPay = !!sum && sum.totalPay > 0;
                        const needsReview = !!sum && sum.shiftsNeedingReview > 0;
                        const payslipStale = !!ps && !!sum && toCents(Number(ps.total_pay)) !== toCents(sum.totalPay);
                        return (
                          <div key={s.id} className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${hasPay || needsReview || summaryFailed ? "" : "opacity-60"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{s.full_name || s.email}</p>
                                <p className="truncate text-xs text-slate-500">{s.email}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{needsReview ? "Held Â· provisional" : "Total pay"}</p>
                                <p className="text-base font-bold tabular-nums text-brand-primary sm:text-lg">{sum ? fmtCurrency(sum.totalPay, sum.currency) : "-"}</p>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-100 py-3 text-xs">
                              <div><p className="text-slate-500">Rate</p><p className="mt-0.5 font-medium text-slate-800">{summaryFailed ? "Unavailable" : sum?.payType === "monthly" ? (sum.monthlySalary ? `${fmtCurrency(sum.monthlySalary, sum.currency)}/mo` : "No salary") : sum?.payType === "shift" ? (sum.shiftRate ? `${fmtCurrency(sum.shiftRate, sum.currency)}/shift` : "No rate") : sum?.hourlyRate ? fmtCurrency(sum.hourlyRate, sum.currency) : "No rate"}</p></div>
                              <div><p className="text-slate-500">Combined hours</p><p className="mt-0.5 font-medium tabular-nums text-slate-800">{sum ? `${sum.totalHours.toFixed(1)}h` : "-"}</p></div>
                              <div><p className="text-slate-500">Base pay</p><p className="mt-0.5 font-medium tabular-nums text-slate-800">{sum ? fmtCurrency(sum.basePay, sum.currency) : "-"}</p></div>
                              <div><p className="text-slate-500">OT + premium</p><p className="mt-0.5 font-medium tabular-nums text-amber-700">{sum ? fmtCurrency(sum.overtimePay + sum.multiplierPay, sum.currency) : "-"}</p></div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {ps ? (
                                  <Badge variant="outline" className={
                                    ps.status === "paid" ? "border-brand-primary/20 bg-brand-primary/15 text-brand-primary" :
                                    ps.status === "issued" ? "border-blue-200 bg-blue-100 text-blue-800" :
                                    "border-slate-200 bg-slate-100 text-slate-700"
                                  }>{ps.status}</Badge>
                                ) : summaryFailed ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-800">Unavailable</Badge> : <span className="text-xs text-slate-400">Not issued</span>}
                                {needsReview && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-900">{sum?.shiftsNeedingReview} review</Badge>}
                                {payslipStale && <span className="text-[10px] font-medium text-amber-700">Needs re-issue</span>}
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                  {sum && <Button size="sm" variant="outline" className="min-h-9 gap-1" onClick={() => openStaffDetails(s.id)}>
                                    <FileClock className="h-3.5 w-3.5" /> Shifts ({displayShifts.length})
                                  </Button>}
                                  {hasPay && !needsReview && (!ps || ps.status === "draft" || (payslipStale && ps.status === "issued")) && (
                                    <Button size="sm" variant="outline" className="min-h-9 gap-1" disabled={persisting === s.id || rangeInvalid} onClick={() => issuePayslip(s.id, "issued")}>
                                      {persisting === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
                                      {ps && payslipStale && ps.status === "issued" ? "Re-issue" : "Issue"}
                                    </Button>
                                  )}
                                  {hasPay && !needsReview && ps && ps.status !== "paid" && (
                                    <Button size="sm" className="min-h-9 gap-1 bg-brand-primary hover:bg-brand-primary/90" disabled={persisting === s.id || rangeInvalid} onClick={() => issuePayslip(s.id, "paid")}>
                                      <CheckCircle2 className="h-3 w-3" /> Mark paid
                                    </Button>
                                  )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {visibleUnlinkedPay.map((row) => {
                        const shifts = rosterShifts.filter((shift) => shift.staff_member_id === row.staff_id && (selectedDepartment === "all" || shift.department === selectedDepartment));
                        const expanded = expandedRosterRows.has(row.staff_id);
                        return (
                          <article key={row.staff_id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words font-semibold text-slate-900">{row.full_name}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] text-sky-800">No login · roster tracked</Badge>
                                  {row.departments?.map((department) => <Badge key={department} variant="outline" className="text-[10px]">{department}</Badge>)}
                                  {row.review_shifts_count > 0 && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-900">Review {row.review_shifts_count}</Badge>}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Period pay</p>
                                <p className="text-base font-bold tabular-nums text-brand-primary">{fmtCurrency(row.total_wage)}</p>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-100 py-3 text-xs">
                              <RosterMetric label="Rate" value={rosterRateLabel(row, fmtCurrency)} />
                              <RosterMetric label="Hours" value={`${((row.standard_min + row.overtime_min + row.sunday_holiday_min) / 60).toFixed(2)}h`} />
                              <RosterMetric label="Base" value={fmtCurrency(row.standard_wage)} />
                              <RosterMetric label="Overtime" value={fmtCurrency(row.overtime_wage)} />
                              <RosterMetric label="Sunday / holiday" value={fmtCurrency(row.sunday_holiday_wage)} />
                              <RosterMetric label="Shifts" value={String(row.shifts_count)} />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs text-slate-500">{row.shifts_count} recorded shift{row.shifts_count === 1 ? "" : "s"}</span>
                              <div className="flex flex-wrap gap-2">
                                <Link href={withSlug(`/admin/kitchen-staff?staffId=${row.staff_id}`)} className="inline-flex min-h-9 items-center rounded-md border border-brand-primary/30 bg-brand-primary/5 px-3 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10">Manage roster</Link>
                                <Button type="button" size="sm" variant="outline" className="min-h-9 gap-1" aria-expanded={expanded} onClick={() => toggleRosterDetails(row.staff_id)}>
                                  <FileClock className="h-3.5 w-3.5" /> {expanded ? "Hide shifts" : `View shifts (${shifts.length})`}
                                </Button>
                              </div>
                            </div>
                            {expanded && <RosterOnlyShiftDetails shifts={shifts} fmtCurrency={fmtCurrency} withSlug={withSlug} />}
                          </article>
                        );
                      })}
                    </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Staff member</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rate</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Combined h</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Base</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">OT</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Premium</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                          <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleStaff.map((s) => {
                          const sum = summaries[s.id];
                          const displayShifts = sum ? visibleShiftLines(sum) : [];
                          const ps = existingPayslips[s.id];
                          const summaryFailed = summariseFailed.some((failure) => failure.id === s.id);
                          const hasPay = sum && sum.totalPay > 0;
                          const needsReview = !!sum && sum.shiftsNeedingReview > 0;
                          // Money audit: an issued payslip can go stale
                          // when shifts are edited after issue. Flag any
                          // cent-level drift between the stored payslip
                          // and the recomputed figure so the two never
                          // silently disagree.
                          const payslipStale =
                            !!ps && !!sum && toCents(Number(ps.total_pay)) !== toCents(sum.totalPay);
                          return (
                            <tr key={s.id} className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${hasPay || needsReview || summaryFailed ? "" : "opacity-50"}`}>
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
                                {summaryFailed ? (
                                  <span className="text-rose-700">Unavailable</span>
                                ) : sum && sum.payType === "monthly" ? (
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
                                {summaryFailed ? (
                                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">Unavailable</Badge>
                                ) : needsReview ? (
                                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Review {sum?.shiftsNeedingReview}</Badge>
                                ) : ps ? (
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
                                {(hasPay || needsReview) && (
                                  <div className="inline-flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1 text-xs"
                                      onClick={() => openStaffDetails(s.id)}
                                    >
                                      <FileClock className="h-3.5 w-3.5" /> Shifts ({displayShifts.length})
                                    </Button>
                                    {/* Stale issued slips get a Re-issue so the
                                        payslip can catch up with edited shifts.
                                        Paid slips stay locked. */}
                                    {!needsReview && hasPay && (!ps || ps.status === "draft" || (payslipStale && ps.status === "issued")) ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1"
                                        disabled={persisting === s.id || rangeInvalid}
                                        onClick={() => issuePayslip(s.id, "issued")}
                                      >
                                        {persisting === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />}
                                        {ps && payslipStale && ps.status === "issued" ? "Re-issue" : "Issue"}
                                      </Button>
                                    ) : null}
                                    {!needsReview && hasPay && ps && ps.status !== "paid" && (
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs gap-1 bg-brand-primary hover:bg-brand-primary/90"
                                        disabled={persisting === s.id || rangeInvalid}
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
                        {visibleUnlinkedPay.map((row) => {
                          const shifts = rosterShifts.filter((shift) => shift.staff_member_id === row.staff_id && (selectedDepartment === "all" || shift.department === selectedDepartment));
                          const expanded = expandedRosterRows.has(row.staff_id);
                          return (
                            <Fragment key={row.staff_id}>
                              <tr className="hover:bg-slate-50/70">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-900">{row.full_name}</div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] text-sky-800">No login · roster tracked</Badge>
                                    {row.departments?.map((department) => <Badge key={department} variant="outline" className="text-[10px]">{department}</Badge>)}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{rosterRateLabel(row, fmtCurrency)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-slate-900">{((row.standard_min + row.overtime_min + row.sunday_holiday_min) / 60).toFixed(2)}h</td>
                                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{fmtCurrency(row.standard_wage)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-amber-700">{fmtCurrency(row.overtime_wage)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-amber-700">{fmtCurrency(row.sunday_holiday_wage)}</td>
                                <td className="px-3 py-3 text-right tabular-nums font-bold text-brand-primary">{fmtCurrency(row.total_wage)}</td>
                                <td className="px-3 py-3 text-right">
                                  {row.review_shifts_count > 0
                                    ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Review {row.review_shifts_count}</Badge>
                                    : <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">Roster tracked</Badge>}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <div className="flex justify-end gap-2">
                                    <Link href={withSlug(`/admin/kitchen-staff?staffId=${row.staff_id}`)} className="inline-flex h-8 items-center rounded-md border border-brand-primary/30 bg-brand-primary/5 px-2.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10">Manage</Link>
                                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" aria-expanded={expanded} onClick={() => toggleRosterDetails(row.staff_id)}>
                                      <FileClock className="h-3.5 w-3.5" /> {expanded ? "Hide" : `Shifts (${shifts.length})`}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              {expanded && <tr><td colSpan={9} className="border-b border-slate-200 bg-slate-50/60 p-3"><RosterOnlyShiftDetails shifts={shifts} fmtCurrency={fmtCurrency} withSlug={withSlug} /></td></tr>}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </CardContent>
            </Card>

            {(() => {
              const selectedStaff = staff.find((person) => person.id === selectedStaffId) || null;
              const selectedSummary = selectedStaffId ? summaries[selectedStaffId] : null;
              const selectedPayslip = selectedStaffId ? existingPayslips[selectedStaffId] : null;
              const selectedDepartmentShifts = selectedSummary ? visibleShiftLines(selectedSummary) : [];
              const selectedPayslipStale = !!selectedPayslip && !!selectedSummary &&
                toCents(Number(selectedPayslip.total_pay)) !== toCents(selectedSummary.totalPay);
              const canIssueSelected = !!selectedSummary && selectedSummary.totalPay > 0 &&
                selectedSummary.shiftsNeedingReview === 0 &&
                (!selectedPayslip || selectedPayslip.status === "draft" || (selectedPayslipStale && selectedPayslip.status === "issued"));
              const canMarkSelectedPaid = !!selectedSummary && !!selectedPayslip &&
                selectedPayslip.status !== "paid" && selectedSummary.totalPay > 0 && selectedSummary.shiftsNeedingReview === 0;
              return (
                <Dialog
                  open={!!selectedStaffId}
                  onOpenChange={(open) => {
                    if (!open) {
                      setSelectedStaffId(null);
                      setEditingShift(null);
                    }
                  }}
                >
                  <DialogContent className="max-h-[92dvh] max-w-2xl overflow-hidden p-4 sm:max-w-4xl sm:p-6">
                    <DialogHeader className="pr-10 text-left">
                      <DialogTitle className="text-base sm:text-lg">
                        {editingShift ? "Correct shift record" : selectedStaff?.full_name || selectedStaff?.email || "Operations staff settlement"}
                      </DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">
                        {editingShift
                          ? "A reason is required. The correction is saved to the clock record and the payslip is recalculated."
                          : `${periodStart} to ${periodEnd} · ${selectedSummary?.totalHours.toFixed(1) || "0.0"} combined hours · ${selectedSummary ? fmtCurrency(selectedSummary.totalPay, selectedSummary.currency) : "—"}`}
                      </DialogDescription>
                    </DialogHeader>

                    {editingShift ? (
                      <div className="space-y-3">
                        <Alert className="border-amber-300 bg-amber-50 py-2 text-amber-950">
                          <AlertTriangle className="h-4 w-4 text-amber-700" />
                          <AlertDescription className="text-xs">
                            {editingShift.review_reason || "Manual edits are retained with an audit reason."} Â· {editingShift.source === "kitchen_staff_shifts" ? "Kitchen staff clock" : "Legacy duty clock"}
                          </AlertDescription>
                        </Alert>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="settlement-shift-start" className="text-xs">Clock-in</Label>
                            <Input id="settlement-shift-start" type="datetime-local" value={shiftDraft.start} onChange={(e) => setShiftDraft((draft) => ({ ...draft, start: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="settlement-shift-end" className="text-xs">Clock-out</Label>
                            <Input id="settlement-shift-end" type="datetime-local" value={shiftDraft.end} onChange={(e) => setShiftDraft((draft) => ({ ...draft, end: e.target.value }))} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="settlement-break-min" className="text-xs">Break minutes</Label>
                            <Input id="settlement-break-min" inputMode="numeric" type="number" min="0" step="1" value={shiftDraft.breakMin} onChange={(e) => setShiftDraft((draft) => ({ ...draft, breakMin: e.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="settlement-shift-notes" className="text-xs">Shift notes</Label>
                          <Textarea id="settlement-shift-notes" className="min-h-16 text-sm" value={shiftDraft.notes} onChange={(e) => setShiftDraft((draft) => ({ ...draft, notes: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="settlement-override-reason" className="text-xs">Reason for correction <span className="text-rose-600">*</span></Label>
                          <Textarea id="settlement-override-reason" className="min-h-16 text-sm" required value={shiftDraft.reason} onChange={(e) => setShiftDraft((draft) => ({ ...draft, reason: e.target.value }))} placeholder="For example: clock-out missed; verified with the shift lead." />
                        </div>
                      </div>
                    ) : selectedSummary ? (
                      <div className="max-h-[62dvh] space-y-4 overflow-y-auto pr-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                          <p className="text-xs text-slate-600">Showing {selectedDepartment === "all" ? "all team" : selectedDepartment} shifts. Pay stays combined across this person&apos;s assigned operations work.</p>
                          <Badge variant="outline" className="shrink-0 bg-slate-50 text-slate-700">{selectedDepartment === "all" ? "All teams" : selectedDepartment}</Badge>
                        </div>
                        {selectedSummary.shiftsNeedingReview > 0 && (
                          <Alert className="border-amber-300 bg-amber-50 py-2 text-amber-950">
                            <AlertTriangle className="h-4 w-4 text-amber-700" />
                            <AlertDescription className="text-xs">
                              {selectedSummary.shiftsNeedingReview} shift record{selectedSummary.shiftsNeedingReview === 1 ? "" : "s"} need correction. This staff member is held from payslip actions until all flagged clocks are fixed.
                            </AlertDescription>
                          </Alert>
                        )}
                        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-5 sm:gap-3 sm:p-4">
                          <div className="min-w-0 rounded-lg bg-white p-2.5"><p className="text-[11px] font-medium text-slate-500">Base pay</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-slate-900">{fmtCurrency(selectedSummary.basePay, selectedSummary.currency)}</p></div>
                          <div className="min-w-0 rounded-lg bg-white p-2.5"><p className="text-[11px] font-medium text-slate-500">Overtime</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-slate-900">{fmtCurrency(selectedSummary.overtimePay, selectedSummary.currency)}</p></div>
                          <div className="min-w-0 rounded-lg bg-white p-2.5"><p className="text-[11px] font-medium text-slate-500">Sunday / holiday</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-slate-900">{fmtCurrency(selectedSummary.multiplierPay, selectedSummary.currency)}</p></div>
                          <div className="min-w-0 rounded-lg bg-white p-2.5"><p className="text-[11px] font-medium text-slate-500">Payslip</p><p className="mt-1 truncate text-sm font-semibold capitalize text-slate-900">{selectedPayslip?.status || "Not issued"}</p></div>
                          <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 sm:col-span-1 sm:block sm:border-0 sm:bg-white sm:p-2.5">
                            <p className="text-[11px] font-medium text-slate-500">Total pay</p>
                            <p className="truncate text-base font-bold tabular-nums text-brand-primary sm:mt-1">{fmtCurrency(selectedSummary.totalPay, selectedSummary.currency)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1 px-1 text-[11px] text-slate-500">
                          <span>{selectedSummary.totalHours.toFixed(2)} combined hours</span>
                          <span>{selectedSummary.shifts.length} clock record{selectedSummary.shifts.length === 1 ? "" : "s"} in period</span>
                        </div>
                        {selectedDepartmentShifts.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">No clock records in this period.</p>
                        ) : (
                          <div className="space-y-2">
                            {[...selectedDepartmentShifts].sort((a, b) => (b.shift_start || "").localeCompare(a.shift_start || "")).map((shift) => {
                              const rosterStaffId = staffWageRows.find((row) => row.linked_profile_id === selectedStaffId)?.staff_id;
                              const shiftDay = (shift.shift_date || shift.shift_start || periodStart).slice(0, 10);
                              const reviewHref = rosterStaffId
                                ? withSlug(`/admin/wages?from=${shiftDay}&to=${shiftDay}&staff=${rosterStaffId}${shift.source === "kitchen_staff_shifts" ? `&shift=${shift.shift_id}` : ""}#wages-members-heading`)
                                : withSlug("/admin/wages#order-coverage-audit");
                              return (
                              <article key={`${shift.source}-${shift.shift_id}`} className={`rounded-xl border p-3 sm:p-4 ${shift.needs_review ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">
                                      {shift.shift_date ? new Date(`${shift.shift_date}T00:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date missing"}
                                    </p>
                                    <p className="mt-1 text-sm font-medium tabular-nums text-slate-700">
                                      {shift.shift_start ? new Date(shift.shift_start).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "Clock-in missing"}
                                      <span className="px-1.5 text-slate-400">→</span>{shift.shift_end ? new Date(shift.shift_end).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "Still open"}
                                      {shift.total_break_min > 0 ? <span className="ml-2 text-xs font-normal text-slate-500">{shift.total_break_min}m break</span> : null}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    {shift.needs_review ? (
                                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Review</Badge>
                                    ) : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Ready</Badge>}
                                    <span className="text-xs font-semibold tabular-nums text-slate-700">{shift.hours.toFixed(2)}h · {fmtCurrency(shift.line_total, selectedSummary.currency)}</span>
                                    <Link href={reviewHref} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                      Open shift details <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" onClick={() => openShiftEditor(shift)}>
                                      <Pencil className="h-3.5 w-3.5" /> Edit
                                    </Button>
                                  </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200/80 pt-3 sm:grid-cols-4">
                                  <RosterMetric label="Standard" value={`${shift.base_hours.toFixed(2)}h · ${fmtCurrency(shift.base_pay, selectedSummary.currency)}`} />
                                  <RosterMetric label="Overtime" value={`${shift.ot_hours.toFixed(2)}h · ${fmtCurrency(shift.ot_pay, selectedSummary.currency)}`} />
                                  <RosterMetric label="Sunday / holiday" value={`${(shift.sunday_holiday_hours || 0).toFixed(2)}h · ${fmtCurrency(shift.multiplier_pay, selectedSummary.currency)}`} />
                                  <RosterMetric label="Clock source" value={shift.source === "kitchen_staff_shifts" ? "Roster shift" : "Legacy duty"} />
                                </div>
                                {shift.needs_review && <p className="mt-3 rounded-md bg-amber-100/70 px-2.5 py-2 text-xs font-medium text-amber-900">{shift.review_reason || "Review this clock record before finalizing pay."}</p>}
                              </article>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-slate-500">Loading pay details…</div>
                    )}

                    <DialogFooter className="gap-2 sm:justify-between">
                      {editingShift ? (
                        <>
                          <Button type="button" variant="outline" className="h-9" onClick={() => setEditingShift(null)} disabled={shiftSaving}>Back to shifts</Button>
                          <Button type="button" className="h-9 gap-1.5 bg-brand-primary" onClick={saveShiftCorrection} disabled={shiftSaving || !shiftDraft.start || !shiftDraft.end || !shiftDraft.reason.trim()}>
                            {shiftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Save correction
                          </Button>
                        </>
                      ) : (
                        <div className="flex w-full flex-wrap justify-end gap-2">
                          {canIssueSelected && selectedStaffId && (
                            <Button type="button" variant="outline" className="h-9 gap-1.5" disabled={persisting === selectedStaffId || rangeInvalid} onClick={() => issuePayslip(selectedStaffId, "issued", true)}>
                              {persisting === selectedStaffId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                              Issue &amp; next <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canMarkSelectedPaid && selectedStaffId && (
                            <Button type="button" className="h-9 gap-1.5 bg-brand-primary" disabled={persisting === selectedStaffId || rangeInvalid} onClick={() => issuePayslip(selectedStaffId, "paid", true)}>
                              <CheckCircle2 className="h-4 w-4" /> Mark paid &amp; next <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            })()}
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}

function rosterRateLabel(row: StaffWageSummary, formatMoney: (amount: number, currency?: string) => string): string {
  if (row.pay_type === "monthly") return row.monthly_salary ? `${formatMoney(row.monthly_salary)}/mo` : "No salary set";
  if (row.pay_type === "shift") return row.shift_rate ? `${formatMoney(row.shift_rate)}/shift` : "No shift rate";
  return row.hourly_rate ? `${formatMoney(row.hourly_rate)}/h` : "No hourly rate";
}

function RosterMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-500">{label}</p>
      <p className="mt-0.5 break-words font-medium tabular-nums text-slate-800">{value}</p>
    </div>
  );
}

function MetricLoading({ width }: { width: string }) {
  return (
    <span role="status" aria-label="Calculating period total" className={`inline-flex h-6 ${width} animate-pulse rounded-md bg-slate-200 sm:h-7`}>
      <span className="sr-only">Calculating</span>
    </span>
  );
}

function RosterOnlyShiftDetails({ shifts, fmtCurrency, withSlug }: {
  shifts: KitchenShift[];
  fmtCurrency: (amount: number, currency?: string) => string;
  withSlug: (path: string) => string;
}) {
  const orderedShifts = [...shifts].sort((a, b) => b.shift_start.localeCompare(a.shift_start));
  const formatTime = (value: string | null) => value
    ? new Date(value).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Not recorded";
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Recorded shift details</p>
        <Link href={withSlug("/admin/wages")} className="text-xs font-semibold text-brand-primary underline underline-offset-2">Open Wages</Link>
      </div>
      {orderedShifts.length === 0 ? (
        <p className="py-3 text-center text-sm text-slate-500">No clocked shifts in this period.</p>
      ) : (
        <div className="space-y-2">
          {orderedShifts.map((shift) => {
            const review = needsKitchenShiftReview(shift);
            const shiftDay = shift.shift_start.slice(0, 10);
            const reviewHref = withSlug(`/admin/wages?from=${shiftDay}&to=${shiftDay}&staff=${shift.staff_member_id}&shift=${shift.id}#wages-members-heading`);
            const totalMinutes = (shift.standard_min || 0) + (shift.overtime_min || 0) + (shift.sunday_holiday_min || 0);
            const clockMinutes = shift.shift_end
              ? Math.max(0, (new Date(shift.shift_end).getTime() - new Date(shift.shift_start).getTime()) / 60_000 - (shift.total_break_min || 0))
              : null;
            return (
              <article key={shift.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{formatTime(shift.shift_start)}</p>
                    <p className="mt-0.5 text-xs text-slate-600">Clock-out: {formatTime(shift.shift_end)}{shift.total_break_min > 0 ? ` · ${shift.total_break_min}m break` : ""}</p>
                  </div>
                  {review ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Review clock</Badge> : shift.shift_end ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Recorded</Badge> : <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">In progress</Badge>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <RosterMetric label={review ? "Held recorded hours" : "Approved hours"} value={`${(totalMinutes / 60).toFixed(2)}h${review ? " · held" : ""}`} />
                  <RosterMetric label="Clock span" value={clockMinutes == null ? "In progress" : `${(clockMinutes / 60).toFixed(2)}h`} />
                  <RosterMetric label="Standard" value={`${((shift.standard_min || 0) / 60).toFixed(2)}h`} />
                  <RosterMetric label="Overtime" value={`${((shift.overtime_min || 0) / 60).toFixed(2)}h`} />
                  <RosterMetric label="Sunday / holiday" value={`${((shift.sunday_holiday_min || 0) / 60).toFixed(2)}h`} />
                </div>
                {review && <p className="mt-2 text-xs text-amber-800">Clock time needs review in Wages before the flagged time can be finalized.</p>}
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                  <Link href={reviewHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Open this shift in Staff Hours <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KitchenSettlementLoading({ companyName, companySlug }: { companyName: string | null; companySlug: string | null }) {
  const tenantName = companyName?.trim() || "your company";
  return (
    <div className="px-4 py-10 sm:px-6" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          {companySlug ? (
            <img
              src={`/api/pwa/icon?slug=${encodeURIComponent(companySlug)}&size=180`}
              alt=""
              className="h-9 w-9 rounded-lg object-contain"
            />
          ) : (
            <Banknote className="h-6 w-6 text-brand-primary" aria-hidden="true" />
          )}
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-brand-primary ring-1 ring-slate-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-900">Loading {tenantName} settlement</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
          Matching kitchen, cleaning and shopping shifts to this pay period.
        </p>
        <div className="mt-6 w-full max-w-lg space-y-3" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="grid grid-cols-[minmax(0,1.4fr)_0.6fr_0.6fr_0.7fr] items-center gap-3 rounded-lg border border-slate-100 px-3 py-3">
              <span className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
              <span className="h-3 animate-pulse rounded bg-slate-100" />
              <span className="h-3 animate-pulse rounded bg-slate-100" />
              <span className="h-3 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading kitchen, cleaning and shopping pay for {tenantName}.</span>
      </div>
    </div>
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
