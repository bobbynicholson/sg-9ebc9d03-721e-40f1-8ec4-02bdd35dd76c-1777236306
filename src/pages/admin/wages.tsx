/**
 * /admin/wages - payroll roll-up for the whole operation.
 *
 * Owner-only, company-wide surface. Drivers run on driverPayService (hourly +
 * distance + callout); the other departments run on
 * kitchenStaffService.getWageSummary (clocked time x rates with a BCEA
 * Sunday/holiday split).
 *
 * The page never enters or stores rate data - it only reads. Staff records
 * are company-scoped and are not region-tagged, so this report is company-wide.
 */
import { UserRole } from "@/types/app";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Banknote, Calendar as CalendarIcon, Download, Users, ChefHat, Truck, TrendingUp, AlertTriangle, Trophy, Clock as ClockIcon, ArrowUp, ArrowDown, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PageLoader } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useToast } from "@/hooks/use-toast";
import {
  kitchenStaffService, liveWorkedMinutes, needsKitchenShiftReview, type StaffWageSummary, type KitchenShift,
} from "@/services/kitchenStaffService";
import { driverPayService, type DriverPayRates, type DriverPaySummary } from "@/services/driverPayService";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { captureException } from "@/lib/observability";
import { MonthlyPayrollAudit } from "@/components/admin/MonthlyPayrollAudit";

// ── Helpers ─────────────────────────────────────────────────────────

type Preset = "this_week" | "this_month" | "this_year" | "custom";

interface Range { fromISO: string; toISO: string; label: string; }

// TIGHTEN I.91 (2026-06-02): tenant-aware currency formatter
// builders. Replaces the previous module-scope `fmtZAR` / `fmtZARDetailed`
// pair that hardcoded "R" for every tenant. The main WageDashboardPage
// builds these from useTenantCurrency and passes them as props through
// to KitchenSummaryView / DriverSummaryView / KitchenByPersonTable /
// DriverByPersonTable. Defaults below are the ZAR fallback for any
// caller that hasn't been updated (none in this file post-I.91).
const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
  AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE",
};
function buildFmtMoney(code: string) {
  let f: Intl.NumberFormat;
  try {
    f = new Intl.NumberFormat(CURRENCY_LOCALE[code] || "en-ZA", {
      style: "currency",
      currency: code || "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    f = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Exact cents + dot-decimal like formatZAR (Callum 2026-07-08), no rounding.
  const norm = (v: number) =>
    f.formatToParts(v).map((p) => {
      if (p.type === "group") return " ";
      if (p.type === "decimal") return ".";
      return p.value.replace(/\s/g, " ");
    }).join("");
  return (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return norm(0);
    return norm(v);
  };
}
function buildFmtMoneyDetailed(code: string) {
  let f: Intl.NumberFormat;
  try {
    f = new Intl.NumberFormat(CURRENCY_LOCALE[code] || "en-ZA", {
      style: "currency",
      currency: code || "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    f = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return f.format(0);
    return f.format(v);
  };
}
// Defaults for any historic top-level reference (none expected).
const fmtZARDefault = buildFmtMoney("ZAR");
const fmtZARDetailedDefault = buildFmtMoneyDetailed("ZAR");
const fmtHours = (mins: number) => {
  const h = Math.max(0, Math.round((mins / 60) * 10) / 10);
  return `${h.toFixed(1)}h`;
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function presetRange(p: Preset): Range {
  const now = new Date();
  if (p === "this_year") {
    const from = new Date(now.getFullYear(), 0, 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    to.setHours(0, 0, 0, 0);
    return { fromISO: from.toISOString(), toISO: to.toISOString(), label: "Year to date" };
  }
  if (p === "this_week") {
    const from = startOfWeek(now);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { fromISO: from.toISOString(), toISO: to.toISOString(), label: "This week" };
  }
  if (p === "this_month") {
    const from = startOfMonth(now);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    return { fromISO: from.toISOString(), toISO: to.toISOString(), label: "This month" };
  }
  return { fromISO: "", toISO: "", label: "Custom" };
}
function toDateInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return toLocalISO(d);
}
function fromDateInput(local: string, endOfDay = false): string {
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
// ── Types ───────────────────────────────────────────────────────────

type DepartmentKey = "all" | "kitchen" | "drivers" | "shopping" | "cleaning";

interface DriverPayRow {
  driver_id: string;
  full_name: string;
  hours: number;
  hourly_pay: number;
  distance_km: number;
  distance_pay: number;
  callout_pay: number;
  total: number;
  rates: DriverPayRates;
}

interface DailyChartRow {
  day: string;          // 'Mon 05'
  iso: string;          // '2026-05-05'
  standard: number;
  overtime: number;
  publicHoliday: number;
}

interface PublicHolidayLine {
  staff_name: string;
  iso_date: string;
  hours: number;
  premium: number;
  rateMissing: boolean;
  needsReview: boolean;
}

interface PaidWageRecord {
  id: string;
  staffId?: string;
  staffName: string;
  amount: number;
  paidAt: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  source: "Staff payment ledger" | "Kitchen payslip" | "Driver settlement";
  reference?: string | null;
}

function paidForEarningPeriod(records: PaidWageRecord[], args: {
  from: string;
  to: string;
  staffName: string;
  staffId?: string;
  primarySource: PaidWageRecord["source"];
}) {
  const personRecords = records.filter((record) =>
    (args.staffId && record.staffId === args.staffId)
      || record.staffName.trim().toLocaleLowerCase() === args.staffName.trim().toLocaleLowerCase(),
  );
  const primary = personRecords.filter((record) => record.source === args.primarySource);
  const ledgerFallback = args.primarySource === "Kitchen payslip"
    ? personRecords.filter((record) => record.source === "Staff payment ledger"
      && !primary.some((slip) => slip.periodFrom === record.periodFrom && slip.periodTo === record.periodTo))
    : [];
  const candidates = [...primary, ...ledgerFallback];
  const matched = candidates.filter((record) => !!record.periodFrom && !!record.periodTo
    && record.periodFrom >= args.from && record.periodTo <= args.to);
  const partial = candidates.some((record) => !!record.periodFrom && !!record.periodTo
    && record.periodFrom <= args.to && record.periodTo >= args.from
    && !(record.periodFrom >= args.from && record.periodTo <= args.to));
  const sorted = [...matched].sort((a, b) => (a.periodFrom || "").localeCompare(b.periodFrom || ""));
  const overlapping = sorted.some((record, index) => {
    const previous = sorted[index - 1];
    return !!previous?.periodTo && !!record.periodFrom && record.periodFrom <= previous.periodTo;
  });
  return {
    amount: matched.reduce((sum, record) => sum + record.amount, 0),
    overlapping,
    partial,
  };
}

// ── Page ────────────────────────────────────────────────────────────

// WAGE-A: friendly labels for the departments[] array on staff
// rows. The DB stores lower-case slugs; we want title-case in chips.
const DEPT_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  drivers: "Drivers",
  shopping: "Shopping",
  cleaning: "Cleaning",
};
function deptChipText(depts: string[]): string {
  if (!depts || depts.length === 0) return "Unassigned";
  return depts.map((d) => DEPT_LABELS[d] || d).join(" / ");
}

function WageDashboardPage() {
  const { profile, company, loading: authLoading } = useAuth();
  return (
    <WageDashboardContent
      key={profile?.company_id || "no-company"}
      profile={profile}
      companyName={company?.company_name || "your company"}
      companyLogoUrl={company?.logo_url || null}
      authLoading={authLoading}
    />
  );
}

function WageDashboardContent({
  profile,
  companyName,
  companyLogoUrl,
  authLoading,
}: {
  profile: ReturnType<typeof useAuth>["profile"];
  companyName: string;
  companyLogoUrl: string | null;
  authLoading: boolean;
}) {
  // TIGHTEN I.91: tenant-aware fmtZAR / fmtZARDetailed. These shadow
  // any module-level references and pass through to the sibling
  // summary / table components as props.
  const tenantCurrency = useTenantCurrency(profile?.company_id ?? null);
  const fmtZAR = buildFmtMoney(tenantCurrency.code);
  const fmtZARDetailed = buildFmtMoneyDetailed(tenantCurrency.code);
  const { toast } = useToast();
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id as string | undefined;
  const [preset, setPreset] = useState<Preset>("this_year");
  const [range, setRange] = useState<Range>(presetRange("this_year"));
  const [customFrom, setCustomFrom] = useState<string>(toDateInput(presetRange("this_year").fromISO));
  const [customTo, setCustomTo] = useState<string>(toDateInput(new Date().toISOString()));
  const visibleRangeLabel = range.label === "Custom"
    ? `${toDateInput(range.fromISO)} – ${toDateInput(new Date(new Date(range.toISO).getTime() - 1).toISOString())}`
    : range.label;

  const [department] = useState<DepartmentKey>("all");
  const [orderAuditOpen, setOrderAuditOpen] = useState(false);
  useEffect(() => {
    if (router.isReady && router.query.audit === "orders") setOrderAuditOpen(true);
  }, [router.isReady, router.query.audit]);

  // Kitchen-style data (used for all / kitchen / shopping / cleaning).
  const [staffRows, setStaffRows] = useState<StaffWageSummary[]>([]);
  const [shifts, setShifts] = useState<KitchenShift[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [loadingKitchen, setLoadingKitchen] = useState(true);
  // Persistent load failures per leg. A toast alone disappears and
  // the page then renders the "No shifts in this range" empty state,
  // which reads as zero wages rather than a failed load.
  const [kitchenError, setKitchenError] = useState<string | null>(null);
  const [driverError, setDriverError] = useState<string | null>(null);
  // Bumping this re-fires the load effects. The old realtime refetch
  // did setRange((r) => ({ ...r })), but the effects depend on the
  // fromISO / toISO STRINGS, which a spread doesn't change - so the
  // realtime channel never actually refreshed anything.
  const [reloadTick, setReloadTick] = useState(0);

  // Drivers data.
  const [driverRows, setDriverRows] = useState<DriverPayRow[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);

  // WAGE-A intel: prior-period total for the trend-vs-last-period
  // chip on the headline tile. Same query, same department, range
  // shifted back by `windowDays`.
  const [prevPeriodTotal, setPrevPeriodTotal] = useState<number | null>(null);
  // WAGE-A intel: owed-to-staff. Same number the financial-dashboard
  // shows as staffPaymentsOwed - the owner needs it here too so
  // "we paid R 3500 this week" sits next to "we still owe R 1200".
  const [paidWageRecords, setPaidWageRecords] = useState<PaidWageRecord[]>([]);
  const [loadingPaidWages, setLoadingPaidWages] = useState(false);
  const [paidWagesError, setPaidWagesError] = useState<string | null>(null);
  // WAGE-A intel: event count in range for the cost-per-event tile.
  const [eventCount, setEventCount] = useState<number | null>(null);
  // WAGE-B intel: revenue in range (sum of orders.total_amount on
  // non-cancelled orders whose event_date falls in the window). Pairs
  // with the period wage total to compute the wage-to-revenue ratio
  // - catering benchmark is roughly 25-35%. Null while loading or
  // when the fetch failed.
  const [revenueInRange, setRevenueInRange] = useState<number | null>(null);
  // WAGE-B intel: 4-week weekly-wage buckets per staff member for
  // the by-person table sparkline. Map of staff_id -> [w-3, w-2,
  // w-1, this-week] minute totals. Independent of the page range
  // selector - always shows the latest 4 ISO weeks ending today,
  // so the sparkline is a stable trend signal even when the
  // operator flips to "this month" on the headline.
  const [weeklyByStaff, setWeeklyByStaff] = useState<Map<string, number[]>>(new Map());
  const [editingKitchenShift, setEditingKitchenShift] = useState<KitchenShift | null>(null);
  const [savingKitchenShift, setSavingKitchenShift] = useState(false);
  const [kitchenShiftDraft, setKitchenShiftDraft] = useState({ start: "", end: "", breakMin: "0", notes: "", reason: "" });

  const toLocalDateTimeInput = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const openKitchenShiftCorrection = (shift: KitchenShift) => {
    setKitchenShiftDraft({
      start: toLocalDateTimeInput(shift.shift_start),
      end: toLocalDateTimeInput(shift.shift_end || new Date().toISOString()),
      breakMin: String(Math.max(0, shift.total_break_min || 0)),
      notes: shift.notes || "",
      reason: "",
    });
    setEditingKitchenShift(shift);
  };
  const saveKitchenShiftCorrection = async () => {
    if (!editingKitchenShift) return;
    const start = new Date(kitchenShiftDraft.start);
    const end = new Date(kitchenShiftDraft.end);
    const grossMin = Math.floor((end.getTime() - start.getTime()) / 60_000);
    const breakMin = Number(kitchenShiftDraft.breakMin);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || grossMin <= 0 || grossMin > 24 * 60) {
      toast({ title: "Check the shift times", description: "Clock-out must be after clock-in and the corrected shift must be no longer than 24 hours.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(breakMin) || breakMin < 0 || breakMin > grossMin) {
      toast({ title: "Check the break", description: "Break minutes must be between zero and the shift length.", variant: "destructive" });
      return;
    }
    if (!kitchenShiftDraft.reason.trim()) {
      toast({ title: "Reason required", description: "Add a short reason for the clock correction.", variant: "destructive" });
      return;
    }
    setSavingKitchenShift(true);
    try {
      await kitchenStaffService.manualEditShift({
        shiftId: editingKitchenShift.id,
        shift_start: start.toISOString(),
        shift_end: end.toISOString(),
        total_break_min: breakMin,
        notes: kitchenShiftDraft.notes.trim(),
        override_reason: kitchenShiftDraft.reason.trim(),
        edited_by: profile?.id || null,
      });
      toast({ title: "Clock times corrected", description: "Wages and holiday hours are recalculating from the corrected shift." });
      setEditingKitchenShift(null);
      setReloadTick((value) => value + 1);
    } catch (error) {
      toast({ title: "Could not correct shift", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingKitchenShift(false);
    }
  };

  const handlePresetChange = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setRange(r);
      setCustomFrom(toDateInput(r.fromISO));
      setCustomTo(p === "this_year" ? toDateInput(new Date().toISOString()) : toDateInput(r.toISO));
    }
  };
  const handleApplyCustom = () => {
    if (!customFrom || !customTo) {
      toast({ title: "Pick both dates", variant: "destructive" });
      return;
    }
    const fromISO = fromDateInput(customFrom);
    const toISO = fromDateInput(customTo, true);
    if (!fromISO || !toISO || new Date(fromISO) > new Date(toISO)) {
      toast({ title: "Invalid range", variant: "destructive" });
      return;
    }
    setPreset("custom");
    setRange({ fromISO, toISO, label: "Custom" });
  };

  // ── Load kitchen-style data ────────────────────────────────────
  useEffect(() => {
    if (!companyId || !range.fromISO || !range.toISO) return;
    if (department === "drivers") {
      setLoadingKitchen(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingKitchen(true);
      setKitchenError(null);
      try {
        const dept = department === "all" ? undefined : department;
        const [summary, shiftRows, holidayRows] = await Promise.all([
          kitchenStaffService.getWageSummary(companyId, range.fromISO, range.toISO, {
            department: dept,
          }),
          kitchenStaffService.listShiftsInRange(companyId, range.fromISO, range.toISO, { department: dept }),
          supabase
            .from("public_holidays")
            .select("date")
            .or(`company_id.is.null,company_id.eq.${companyId}`),
        ]);
        if (cancelled) return;
        setStaffRows(summary);
        setShifts(shiftRows);
        const set = new Set<string>();
        for (const h of (holidayRows.data || []) as Array<{ date: string }>) {
          if (h?.date) set.add(h.date.slice(0, 10));
        }
        setHolidaySet(set);
      } catch (e: any) {
        if (!cancelled) setKitchenError(e?.message || "Could not load wages.");
      } finally {
        if (!cancelled) setLoadingKitchen(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, department, reloadTick]);

  // ── Load drivers data ──────────────────────────────────────────
  useEffect(() => {
    if (!companyId || !range.fromISO || !range.toISO) return;
    if (department !== "drivers" && department !== "all") {
      setDriverRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingDrivers(true);
      setDriverError(null);
      try {
        // Pull drivers via the profiles table (matches driverService.getAllDrivers).
        // WAGE-A: dropped the legacy `name` column (typed `as any`
        // pre-WAGE-A to bypass schema mismatch; profiles only has
        // full_name + display_name). The driverPayService just
        // needs id, full_name, email for the fallback chain.
        const { data: drivers, error: driversError } = await supabase
          .from("profiles")
          .select("id, full_name, email, hourly_rate, distance_rate_per_km, base_callout_fee")
          .eq("company_id", companyId)
          .eq("role", "driver");
        // Pre-audit the profiles error was silently discarded: a
        // 400 here rendered "No driver pay yet" instead of failing.
        if (driversError) throw driversError;
        const driverList = (drivers || []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          hourly_rate: number | null;
          distance_rate_per_km: number | null;
          base_callout_fee: number | null;
        }>;
        const fromDate = range.fromISO.slice(0, 10);
        const toDate = toLocalISO(new Date(new Date(range.toISO).getTime() - 1));
        // WAGE-B: bulk fetch replaces the per-driver N+1. On a
        // 20-driver tenant this drops ~100 round trips to ~5.
        const bulk = await driverPayService.getBulkPayTotals({
          companyId,
          driverIds: driverList.map((d) => d.id),
          range: { from: fromDate, to: toDate },
        });
        const rows: DriverPayRow[] = driverList.map((d) => {
          const t = bulk.get(d.id);
          return {
            driver_id: d.id,
            full_name: d.full_name || d.email || "Driver",
            hours: t?.hours_total || 0,
            hourly_pay: t?.hourly_pay || 0,
            distance_km: t?.distance_total_km || 0,
            distance_pay: t?.distance_pay || 0,
            callout_pay: t?.callout_pay || 0,
            total: t?.grand_total || 0,
            rates: t?.rates || { hourly_rate: 0, distance_rate_per_km: 0, base_callout_fee: 0 },
          };
        });
        if (!cancelled) setDriverRows(rows.sort((a, b) => b.total - a.total));
      } catch (e: any) {
        if (!cancelled) setDriverError(e?.message || "Could not load driver pay.");
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, department, reloadTick]);

  // WAGE-A intel: prior-period roll-up for the trend chip. Shift
  // the range back by the same number of days and repeat the wage
  // summary for the same department. Bails to null on error so the
  // chip just hides rather than lying.
  useEffect(() => {
    if (!companyId || !range.fromISO || !range.toISO) return;
    if (department === "drivers") {
      setPrevPeriodTotal(null);
      return;
    }
    const windowMs = new Date(range.toISO).getTime() - new Date(range.fromISO).getTime();
    if (windowMs <= 0) return;
    const prevFrom = new Date(new Date(range.fromISO).getTime() - windowMs).toISOString();
    const prevTo = range.fromISO;
    let cancelled = false;
    (async () => {
      try {
        const summary = await kitchenStaffService.getWageSummary(companyId, prevFrom, prevTo, {
          department: department === "all" ? undefined : department,
        });
        if (cancelled) return;
        setPrevPeriodTotal(summary.reduce((s, r) => s + r.total_wage, 0));
      } catch (e) {
        captureException(e, { level: "warning", tags: { companyId, route: "/admin/wages", step: "prev_period" } });
        if (!cancelled) setPrevPeriodTotal(null);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, department, reloadTick]);

  // Payments are stored separately from calculated earnings. Read all
  // company payout paths and filter by the actual payment timestamp so
  // the selected range answers "what was paid then?" rather than "what
  // work period did this payout cover?" Keep records source-labelled;
  // some tenants use more than one payroll workflow.
  useEffect(() => {
    if (!companyId || !range.fromISO || !range.toISO) return;
    let cancelled = false;
    (async () => {
      setLoadingPaidWages(true);
      setPaidWagesError(null);
      try {
        const from = range.fromISO;
        const to = range.toISO;
        const toInclusive = new Date(new Date(to).getTime() - 1).toISOString();
        const fromDate = from.slice(0, 10);
        const toDate = toLocalISO(new Date(toInclusive));
        const [ledgerPeriodPayments, ledgerPaidAtPayments, payslipsResult, driverPayoutsResult, kitchenStaffResult, profilesResult] = await Promise.all([
          paymentLedgerService.getAllPayments(undefined, undefined, companyId, { from: fromDate, to: toDate }),
          paymentLedgerService.getAllPayments(new Date(from), new Date(toInclusive), companyId),
          supabase.from("kitchen_payslips")
            .select("id, staff_id, total_pay, paid_at, currency, period_start, period_end")
            .eq("company_id", companyId).eq("status", "paid")
            .lte("period_start", toDate).gte("period_end", fromDate).is("deleted_at", null),
          supabase.from("driver_payouts")
            .select("id, driver_id, gross_total, paid_at, paid_reference, period_from, period_to")
            .eq("company_id", companyId).eq("status", "paid")
            .lte("period_from", toDate).gte("period_to", fromDate).is("deleted_at", null),
          supabase.from("kitchen_staff_members")
            .select("full_name, linked_profile_id")
            .eq("company_id", companyId),
          supabase.from("profiles").select("id, full_name, email").eq("company_id", companyId),
        ]);
        if (payslipsResult.error) throw payslipsResult.error;
        if (driverPayoutsResult.error) throw driverPayoutsResult.error;
        if (kitchenStaffResult.error) throw kitchenStaffResult.error;
        if (profilesResult.error) throw profilesResult.error;
        const profileRows = profilesResult.data || [];
        const kitchenStaffRows = kitchenStaffResult.data || [];
        type LedgerPaymentRow = {
          id: string;
          staff_id?: string | null;
          payment_date?: string | null;
          payment_period_start?: string | null;
          payment_period_end?: string | null;
          deleted_at?: string | null;
          total_amount?: number | string | null;
          total_earnings?: number | string | null;
          payment_reference?: string | null;
          staff?: { full_name?: string | null; email?: string | null } | null;
        };
        const ledgerRows = [...ledgerPeriodPayments, ...ledgerPaidAtPayments] as LedgerPaymentRow[];
        const ledgerPayments = Array.from(new Map<string, LedgerPaymentRow>(ledgerRows.map((payment) => [payment.id, payment])).values());
        const profileById = new Map<string, string>(profileRows.map((p) => [p.id, p.full_name || p.email || "Team member"]));
        const kitchenNameByProfile = new Map<string, string>(kitchenStaffRows
          .filter((s): s is typeof s & { linked_profile_id: string } => Boolean(s.linked_profile_id))
          .map((s) => [s.linked_profile_id, s.full_name || "Team member"]));
        const records: PaidWageRecord[] = [];
        const overlapsRange = (periodFrom?: string | null, periodTo?: string | null, paidAt?: string | null) => {
          if (periodFrom && periodTo) return periodFrom <= toDate && periodTo >= fromDate;
          return !!paidAt && paidAt >= from && paidAt <= toInclusive;
        };
        for (const p of ledgerPayments) {
          if (p.deleted_at) continue;
          if (!overlapsRange(p.payment_period_start, p.payment_period_end, p.payment_date)) continue;
          if (!p.payment_date) continue;
          records.push({
            id: `ledger-${p.id}`,
            staffId: p.staff_id || undefined,
            staffName: p.staff?.full_name || p.staff?.email || "Team member",
            amount: Number(p.total_amount ?? p.total_earnings) || 0,
            paidAt: p.payment_date,
            periodFrom: p.payment_period_start || null,
            periodTo: p.payment_period_end || null,
            source: "Staff payment ledger",
            reference: p.payment_reference || null,
          });
        }
        for (const p of payslipsResult.data || []) {
          if (!p.paid_at) continue;
          records.push({
            id: `payslip-${p.id}`,
            staffId: p.staff_id,
            staffName: kitchenNameByProfile.get(p.staff_id) || profileById.get(p.staff_id) || "Team member",
            amount: Number(p.total_pay) || 0,
            paidAt: p.paid_at,
            periodFrom: p.period_start,
            periodTo: p.period_end,
            source: "Kitchen payslip",
          });
        }
        for (const p of driverPayoutsResult.data || []) {
          if (!p.paid_at) continue;
          records.push({
            id: `driver-${p.id}`,
            staffId: p.driver_id,
            staffName: profileById.get(p.driver_id) || "Driver",
            amount: Number(p.gross_total) || 0,
            paidAt: p.paid_at,
            periodFrom: p.period_from,
            periodTo: p.period_to,
            source: "Driver settlement",
            reference: p.paid_reference || null,
          });
        }
        if (!cancelled) setPaidWageRecords(records.sort((a, b) => b.paidAt.localeCompare(a.paidAt)));
      } catch (e: unknown) {
        if (!cancelled) {
          setPaidWagesError(e instanceof Error ? e.message : "Could not load recorded payments.");
          setPaidWageRecords([]);
        }
      } finally {
        if (!cancelled) setLoadingPaidWages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, reloadTick]);

  // WAGE-A intel: event count in the window for the cost-per-event
  // tile. WAGE-B extends this to also sum total_amount for the
  // wage % of revenue tile. Both numbers come from the same query
  // so cost is unchanged.
  useEffect(() => {
    if (!companyId || !range.fromISO || !range.toISO) return;
    let cancelled = false;
    (async () => {
      try {
        const fromDate = range.fromISO.slice(0, 10);
        // Inclusive last calendar day of the window. toISO is an
        // exclusive bound (next Monday 00:00 for presets, 23:59:59
        // of the picked day for custom); slicing it to a date and
        // using .lt() dropped every event ON the final day of a
        // custom range. Step back 1ms first, then compare with lte.
        const lastDay = toLocalISO(new Date(new Date(range.toISO).getTime() - 1));
        const { data, error } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("company_id", companyId)
          .gte("event_date", fromDate)
          .lte("event_date", lastDay)
          .neq("status", "cancelled");
        if (error) throw error;
        const rows = (data || []) as Array<{ total_amount: number | string | null }>;
        if (!cancelled) {
          setEventCount(rows.length);
          setRevenueInRange(rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0));
        }
      } catch (e) {
        captureException(e, { level: "warning", tags: { companyId, route: "/admin/wages", step: "event_count" } });
        if (!cancelled) {
          setEventCount(null);
          setRevenueInRange(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, reloadTick]);

  // WAGE-B intel: 4-week weekly-wage roll-up per staff. One bulk
  // query over kitchen_shifts in the trailing 28 days, then bucket
  // in memory into 4 weekly buckets (oldest -> newest). Independent
  // of the page range so the sparkline is a stable trend signal.
  useEffect(() => {
    if (!companyId) return;
    if (department === "drivers") {
      setWeeklyByStaff(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 28 days window ending end-of-today, broken into 4 buckets
        // of 7 days each: bucket 0 = 28..21d ago, bucket 3 = 7..0d
        // ago (this week).
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        const fromMs = now.getTime() - 28 * 86_400_000;
        const fromIso = new Date(fromMs).toISOString();
        const toIso = now.toISOString();
        const dept = department === "all" ? undefined : department;
        const shifts = await kitchenStaffService.listShiftsInRange(companyId, fromIso, toIso, { department: dept });
        if (cancelled) return;
        const map = new Map<string, number[]>();
        for (const sh of shifts) {
          if (needsKitchenShiftReview(sh)) continue;
          // Total minutes on this shift = standard + overtime +
          // sunday/holiday. Open shifts contribute 0 minutes (their
          // splits stay null until clock-out), which matches the
          // headline tile behaviour.
          const mins = (sh.standard_min || 0)
            + (sh.overtime_min || 0)
            + ((sh as { sunday_holiday_min?: number }).sunday_holiday_min || 0);
          if (mins <= 0) continue;
          const shiftMs = new Date(sh.shift_start).getTime();
          const daysAgo = Math.floor((now.getTime() - shiftMs) / 86_400_000);
          if (daysAgo < 0 || daysAgo > 28) continue;
          // Buckets: 0 = oldest (21-28d ago), 3 = this week (0-7d).
          const bucket = Math.min(3, 3 - Math.floor(daysAgo / 7));
          const arr = map.get(sh.staff_member_id) || [0, 0, 0, 0];
          arr[bucket] += mins;
          map.set(sh.staff_member_id, arr);
        }
        setWeeklyByStaff(map);
      } catch (e) {
        captureException(e, { level: "warning", tags: { companyId, route: "/admin/wages", step: "weekly_sparkline" } });
        if (!cancelled) setWeeklyByStaff(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, department]);

  // WAGE-A: realtime channel. Two surfaces this matters for: a
  // staff clock-out mid-period (kitchen tablet) should refresh the
  // owner's view; and a wage payment recorded elsewhere should
  // refresh wage and payment records. Debounced because multiple
  // clock events often arrive in rapid succession at shift boundary.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Bump the reload tick - the load effects list it as a dep.
        // (Spreading `range` did nothing: the effects depend on the
        // fromISO / toISO strings, which a spread leaves unchanged.)
        setReloadTick((n) => n + 1);
      }, 500);
    };
    const channel = supabase
      .channel(`wages:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_shifts", filter: `company_id=eq.${companyId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_staff_members", filter: `company_id=eq.${companyId}` }, refetch)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  // ── Derived: kitchen-style headlines ───────────────────────────
  // Wage sums accumulate in integer cents (Math.round(x * 100)) and
  // convert back once, so float drift can never make the headline
  // disagree with the by-person table's own total.
  const kitchenTotals = useMemo(() => {
    const cents = (n: number) => Math.round(Number(n || 0) * 100);
    const standard_min = staffRows.reduce((s, r) => s + r.standard_min, 0);
    const overtime_min = staffRows.reduce((s, r) => s + r.overtime_min, 0);
    const sunday_holiday_min = staffRows.reduce((s, r) => s + r.sunday_holiday_min, 0);
    const standard_wage = staffRows.reduce((s, r) => s + cents(r.standard_wage), 0) / 100;
    const overtime_wage = staffRows.reduce((s, r) => s + cents(r.overtime_wage), 0) / 100;
    const sunday_holiday_wage = staffRows.reduce((s, r) => s + cents(r.sunday_holiday_wage), 0) / 100;
    const total_wage = staffRows.reduce((s, r) => s + cents(r.total_wage), 0) / 100;
    const total_min = standard_min + overtime_min + sunday_holiday_min;
    return {
      standard_min, overtime_min, sunday_holiday_min, total_min,
      standard_wage, overtime_wage, sunday_holiday_wage, total_wage,
    };
  }, [staffRows]);

  // Public-holiday line breakdown (count of shifts on holiday rows + premium R).
  const publicHolidayLines = useMemo<PublicHolidayLine[]>(() => {
    const out: PublicHolidayLine[] = [];
    if (shifts.length === 0) return out;
    const staffById = new Map(staffRows.map((r) => [r.staff_id, r] as const));
    for (const sh of shifts) {
      const startDay = sh.shift_start.slice(0, 10);
      const isHoliday = holidaySet.has(startDay);
      const isSunday = new Date(sh.shift_start).getDay() === 0;
      if (!isHoliday && !isSunday) continue;
      const wageInfo = staffById.get(sh.staff_member_id);
      const sundayRate = wageInfo?.sunday_holiday_rate ?? null;
      const hourlyRate = wageInfo?.hourly_rate ?? null;
      const shiftRate = wageInfo?.shift_rate ?? null;
      const hours = ((sh.sunday_holiday_min || 0)) / 60;
      const needsReview = needsKitchenShiftReview(sh);
      // Premium = pay at 2x minus what the same hours would have cost at 1x.
      // Simplifies to (sundayRate - hourlyRate) * hours when both are set.
      const shiftHolidayRate = wageInfo?.sunday_holiday_shift_rate ?? (shiftRate != null ? shiftRate * 2 : null);
      const premium = needsReview ? 0 : wageInfo?.pay_type === "shift"
        ? shiftHolidayRate != null && shiftRate != null && hours > 0
          ? Math.max(0, shiftHolidayRate - shiftRate)
          : 0
        : sundayRate != null && hourlyRate != null
        ? Math.max(0, (Number(sundayRate) - Number(hourlyRate)) * hours)
        : sundayRate != null
          ? Number(sundayRate) * hours / 2  // best-effort if hourly not set: half the 2x pay
          : 0;
      out.push({
        staff_name: wageInfo?.full_name || "Staff",
        iso_date: startDay,
        hours: Math.round(hours * 10) / 10,
        premium: Math.round(premium * 100) / 100,
        rateMissing: hours > 0 && (wageInfo?.pay_type === "shift" ? shiftRate == null : sundayRate == null),
        needsReview,
      });
    }
    return out;
  }, [shifts, staffRows, holidaySet]);

  const publicHolidayTotalPremium = useMemo(
    // Premiums are 2dp-rounded per line; sum in cents to stay exact.
    () => publicHolidayLines.reduce((s, p) => s + Math.round(p.premium * 100), 0) / 100,
    [publicHolidayLines],
  );

  // Stacked bar chart by day.
  const chartData = useMemo<DailyChartRow[]>(() => {
    if (!shifts.length) return [];
    const monthlyBuckets = new Date(range.toISO).getTime() - new Date(range.fromISO).getTime() > 90 * 86_400_000;
    const map = new Map<string, DailyChartRow>();
    const staffById = new Map(staffRows.map((r) => [r.staff_id, r] as const));
    for (const sh of shifts) {
      if (needsKitchenShiftReview(sh)) continue;
      const startDay = sh.shift_start.slice(0, 10);
      const bucketKey = monthlyBuckets ? startDay.slice(0, 7) : startDay;
      const d = new Date(`${monthlyBuckets ? `${bucketKey}-01` : bucketKey}T12:00:00`);
      if (!map.has(bucketKey)) {
        map.set(bucketKey, {
          day: monthlyBuckets
            ? d.toLocaleDateString("en-ZA", { month: "short" })
            : d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric" }),
          iso: bucketKey,
          standard: 0,
          overtime: 0,
          publicHoliday: 0,
        });
      }
      const row = map.get(bucketKey)!;
      const wageInfo = staffById.get(sh.staff_member_id);
      const hourly = Number(wageInfo?.hourly_rate ?? 0);
      const otRate = Number(wageInfo?.overtime_rate ?? 0);
      const sunRate = Number(wageInfo?.sunday_holiday_rate ?? 0);
      const isFixedPay = wageInfo?.pay_type === "monthly";
      row.standard      += hourly > 0 ? (sh.standard_min || 0) / 60 * hourly        : 0;
      row.overtime      += otRate > 0 ? (sh.overtime_min || 0) / 60 * otRate        : 0;
      if (wageInfo?.pay_type === "shift") {
        const fullShiftRate = wageInfo.sunday_holiday_shift_rate ?? (wageInfo.shift_rate != null ? wageInfo.shift_rate * 2 : 0);
        row.publicHoliday += sh.sunday_holiday_min && wageInfo.shift_rate != null
          ? Math.max(0, fullShiftRate - wageInfo.shift_rate)
          : 0;
      } else {
        row.publicHoliday += sunRate > 0
          ? (sh.sunday_holiday_min || 0) / 60 * sunRate * (isFixedPay ? 0.5 : 1)
          : 0;
      }
    }
    // Round + sort.
    const out = Array.from(map.values()).map((r) => ({
      ...r,
      standard:      Math.round(r.standard),
      overtime:      Math.round(r.overtime),
      publicHoliday: Math.round(r.publicHoliday),
    }));
    out.sort((a, b) => a.iso.localeCompare(b.iso));
    return out;
  }, [shifts, staffRows, range.fromISO, range.toISO]);

  // Top-5 cost drivers (kitchen-style).
  const topFive = useMemo(() => {
    return [...staffRows].sort((a, b) => b.total_wage - a.total_wage).slice(0, 5);
  }, [staffRows]);

  const topEarner = useMemo(() => {
    const team = staffRows.map((row) => ({
      name: row.full_name,
      total: row.total_wage,
      detail: deptChipText(row.departments),
    }));
    const drivers = driverRows.map((row) => ({
      name: row.full_name,
      total: row.total,
      detail: "Drivers",
    }));
    return [...team, ...drivers].sort((a, b) => b.total - a.total)[0] || null;
  }, [staffRows, driverRows]);

  // By-Person sorted descending.
  const sortedByPerson = useMemo(
    () => [...staffRows].sort((a, b) => b.total_wage - a.total_wage),
    [staffRows],
  );

  // ── Driver derived ─────────────────────────────────────────────
  const driverTotals = useMemo(() => {
    // Same integer-cents rule as kitchenTotals.
    const cents = (n: number) => Math.round(Number(n || 0) * 100);
    const hourly = driverRows.reduce((s, r) => s + cents(r.hourly_pay), 0) / 100;
    const distance = driverRows.reduce((s, r) => s + cents(r.distance_pay), 0) / 100;
    const callout = driverRows.reduce((s, r) => s + cents(r.callout_pay), 0) / 100;
    return {
      hourly,
      distance,
      callout,
      combined: hourly + distance + callout,
    };
  }, [driverRows]);

  // Combined total when "All".
  const grandTotal = useMemo(() => {
    if (department === "drivers") return driverTotals.combined;
    if (department === "all") return kitchenTotals.total_wage + driverTotals.combined;
    return kitchenTotals.total_wage;
  }, [department, kitchenTotals.total_wage, driverTotals.combined]);

  const periodPaymentSummary = useMemo(() => {
    const from = range.fromISO.slice(0, 10);
    const to = toLocalISO(new Date(new Date(range.toISO).getTime() - 1));
    const kitchen = department === "drivers" ? [] : staffRows.map((row) => paidForEarningPeriod(paidWageRecords, {
      from, to, staffName: row.full_name, primarySource: "Kitchen payslip",
    }));
    const drivers = department === "drivers" || department === "all" ? driverRows.map((row) => paidForEarningPeriod(paidWageRecords, {
      from, to, staffName: row.full_name, staffId: row.driver_id, primarySource: "Driver settlement",
    })) : [];
    const paid = [...kitchen, ...drivers].reduce((sum, item) => sum + item.amount, 0);
    return {
      paid,
      balance: grandTotal - paid,
      overlapping: [...kitchen, ...drivers].some((item) => item.overlapping),
      partial: [...kitchen, ...drivers].some((item) => item.partial),
    };
  }, [range.fromISO, range.toISO, department, staffRows, driverRows, paidWageRecords, grandTotal]);

  // ── CSV export ─────────────────────────────────────────────────
  const handleExportCsv = () => {
    const tag = `${toDateInput(range.fromISO)}_to_${toDateInput(range.toISO)}`;
    const cur = tenantCurrency.code || "ZAR";
    if (sortedByPerson.length === 0 && driverRows.length === 0) return;
    const header = [
      "Name", "Team", "Role", "Shifts", "Hours", "Standard hours", "Overtime hours",
      "Public-holiday hours", "Distance km", `Hourly pay (${cur})`, `Distance pay (${cur})`,
      `Callout pay (${cur})`, `Total earnings (${cur})`,
    ];
    const lines = [header.join(",")];
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    for (const r of sortedByPerson) {
      const totalHours = (r.standard_min + r.overtime_min + r.sunday_holiday_min) / 60;
      lines.push([
        quote(r.full_name || ""), quote(deptChipText(r.departments)), quote(r.role_title || ""),
        r.shifts_count, totalHours.toFixed(2),
        (r.standard_min / 60).toFixed(2), (r.overtime_min / 60).toFixed(2),
        (r.sunday_holiday_min / 60).toFixed(2), "", "", "", "", r.total_wage.toFixed(2),
      ].join(","));
    }
    for (const r of driverRows) {
      lines.push([
        quote(r.full_name), "Drivers", "Driver", "", r.hours.toFixed(2), "", "", "",
        r.distance_km.toFixed(2), r.hourly_pay.toFixed(2), r.distance_pay.toFixed(2),
        r.callout_pay.toFixed(2), r.total.toFixed(2),
      ].join(","));
    }
    downloadCsv(lines.join("\n"), `wages-all-teams-${tag}.csv`);
  };

  const downloadCsv = (csv: string, filename: string) => {
    // WAGE-A: UTF-8 BOM so Excel-ZA renders R / £ / € symbols and
    // any non-ASCII names correctly. Matches the calendar /
    // refunds CSV exports.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────
  const isDriversTab = department === "drivers";
  // "All" waits for BOTH legs - pre-fix it only tracked the kitchen
  // load, so the hero total chip rendered kitchen-only for a beat
  // while driver pay was still in flight.
  const isLoading = authLoading || loadingPaidWages || (isDriversTab
    ? loadingDrivers
    : department === "all"
      ? loadingKitchen || loadingDrivers
      : loadingKitchen);
  // Failed loads must never fall through to the "No shifts in this
  // range" empty state - that reads as a zero wage bill.
  const activeLoadError = isDriversTab
    ? driverError
    : department === "all"
      ? kitchenError || driverError
      : kitchenError;
  // "All" is only empty when BOTH ledgers are empty. Pre-fix a tenant
  // with driver pay but no clocked shifts saw "No shifts in this
  // range" under a Period total tile that included the driver rand.
  const hasNoData = isDriversTab
    ? driverRows.length === 0 && !loadingDrivers
    : department === "all"
      ? staffRows.length === 0 && driverRows.length === 0 && paidWageRecords.length === 0 && !isLoading
      : staffRows.length === 0 && paidWageRecords.length === 0 && !loadingKitchen;

  const overtimePct = kitchenTotals.total_min > 0
    ? Math.round((kitchenTotals.overtime_min / kitchenTotals.total_min) * 100)
    : 0;

  const publicHolidayShiftCount = publicHolidayLines.length;
  const publicHolidayEligibleHours = publicHolidayLines.reduce((sum, line) => sum + line.hours, 0);
  const publicHolidayRateMissingHours = publicHolidayLines
    .filter((line) => line.rateMissing)
    .reduce((sum, line) => sum + line.hours, 0);
  const missingOvertimeRateHours = staffRows
    .filter((row) => row.pay_type === "hourly" && row.overtime_min > 0 && row.overtime_rate == null)
    .reduce((sum, row) => sum + row.overtime_min, 0) / 60;
  const fixedPayOvertimeHours = staffRows
    .filter((row) => (row.pay_type === "monthly" || row.pay_type === "shift") && row.overtime_min > 0)
    .reduce((sum, row) => sum + row.overtime_min, 0) / 60;

  // Tightened from ADMIN -> COMPANY_ADMIN-only because UserRole.ADMIN
  // in isAdmin() includes region_admin + sales_admin, which would
  // otherwise see every staff member's pay rate. Matches the
  // canAccessFinance gate the AdminNav now wraps the Wages section in.
  return (
    <ProtectedRoute allowedRoles={[UserRole.OWNER, UserRole.COMPANY_ADMIN]} denyRoles={[UserRole.SUPER_ADMIN]}>
      <NoIndexMeta />
      <Head><title>Wages - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title={
              <span className="flex items-center gap-2 flex-wrap">
                Wages
                <InfoTooltip
                  className="text-white/70 hover:text-white"
                  content="Hours x rates roll-up across every department. Drivers run on the dispatch ledger (hourly + distance + callout); kitchen / shopping / cleaning run on the clocked-shift ledger with a BCEA Sunday + public-holiday split.\n\nThis page is the only place rand values surface, the team tablet shows hours only."
                />
              </span>
            }
            icon={Banknote}
            subtitle="See wages for every team member, compare spending and export the full breakdown."
            meta={!isLoading && companyId && !activeLoadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {fmtZAR(grandTotal)} {range.label === "Custom" ? "in range" : range.label.toLowerCase()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    {staffRows.length + driverRows.length} team member{staffRows.length + driverRows.length === 1 ? "" : "s"} shown
                  </span>
                  {staffRows.some((r) => r.open_shift) && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {staffRows.filter((r) => r.open_shift).length} on shift now
                    </span>
                  )}
                </>
              ) : undefined}
            actions={
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <Button asChild variant="outline" size="sm" aria-label="Manage team" title="Manage team" className="h-10 w-10 justify-center p-0 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3">
                <Link href={withSlug("/admin/teams")}>
                  <Users className="h-4 w-4" /><span className="sr-only sm:not-sr-only sm:inline">Manage team</span>
                </Link>
                </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportCsv}
                aria-label="Export wages as CSV"
                title="Export CSV"
                disabled={sortedByPerson.length === 0 && driverRows.length === 0}
                className="h-10 w-10 justify-center p-0 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
              >
                <Download className="h-4 w-4" /><span className="sr-only sm:not-sr-only sm:inline">Export CSV</span>
              </Button>
            </div>
            }
          />
          <PageWorkbench />

          {/* Period selector */}
          <Card className="mb-4 sm:mb-5">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ["this_year", "Year to date"],
                    ["this_week", "This week"],
                    ["this_month", "This month"],
                    ["custom", "Custom"],
                  ] as Array<[Preset, string]>).map(([p, label]) => (
                    <Button
                      key={p}
                      variant={preset === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePresetChange(p)}
                      className={preset === p ? "bg-brand-primary hover:bg-brand-primary/90" : ""}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {preset === "custom" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">From</Label>
                      <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 w-full min-w-0 sm:w-40" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">To</Label>
                      <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10 w-full min-w-0 sm:w-40" />
                    </div>
                    <Button size="sm" onClick={handleApplyCustom} className="min-h-10 bg-brand-primary hover:bg-brand-primary/90">Apply</Button>
                  </div>
                )}
                <div className="text-xs text-slate-500 inline-flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" />
                  {range.fromISO && range.toISO
                    ? `${new Date(range.fromISO).toLocaleDateString("en-ZA")} -> ${new Date(new Date(range.toISO).getTime() - 1).toLocaleDateString("en-ZA")}`
                    : "Pick a range"}
                </div>
              </div>
            </CardContent>
          </Card>

          {!isLoading && companyId && !activeLoadError && <>
          {/* Headline tiles */}
          {isDriversTab ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Hourly</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums sm:text-xl">{fmtZAR(driverTotals.hourly)}</div>
                  <div className="text-xs text-slate-500 mt-1">On-shift hours x rate</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Distance</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums sm:text-xl">{fmtZAR(driverTotals.distance)}</div>
                  <div className="text-xs text-slate-500 mt-1">Per-km on completed runs</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Callouts</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums sm:text-xl">{fmtZAR(driverTotals.callout)}</div>
                  <div className="text-xs text-slate-500 mt-1">Flat fee per dispatch</div>
                </CardContent>
              </Card>
              <Card className="bg-brand-primary/10">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-brand-primary mb-1">Gross earned</div>
                  <div className="text-lg font-bold text-brand-primary tabular-nums sm:text-xl">{fmtZAR(driverTotals.combined)}</div>
                  <div className="text-xs text-brand-primary mt-1">{driverRows.length} driver{driverRows.length === 1 ? "" : "s"}</div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-5 md:grid-cols-3">
              <Card className="bg-brand-primary/10">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-brand-primary mb-1">Gross earned</div>
                  <div className="text-lg font-bold text-brand-primary tabular-nums sm:text-xl">{fmtZAR(grandTotal)}</div>
                  {/* WAGE-A intel: trend vs same-length previous
                      period. Hidden while loading or when prev was
                      0 (would divide by zero). */}
                  {prevPeriodTotal != null && prevPeriodTotal > 0 && (() => {
                    const diff = kitchenTotals.total_wage - prevPeriodTotal;
                    const pct = Math.round((diff / prevPeriodTotal) * 100);
                    if (Math.abs(pct) < 1) return (
                      <div className="text-xs text-brand-primary mt-1">Flat vs previous period</div>
                    );
                    const up = diff > 0;
                    return (
                      <div
                        className={`text-xs mt-1 inline-flex items-center gap-0.5 ${up ? "text-rose-700" : "text-brand-primary"}`}
                        // The previous-period query only covers the
                        // clocked-shift ledger, so compare kitchen-
                        // style vs kitchen-style. On the All tab the
                        // headline above also includes driver pay -
                        // flag the narrower basis instead of lying.
                        title={department === "all" ? "Trend covers clocked-shift departments only; driver pay is excluded." : undefined}
                      >
                        {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(pct)}% vs previous period{department === "all" ? " (excl. drivers)" : ""}
                      </div>
                    );
                  })()}
                  <div className="text-xs text-brand-primary mt-1">
                    All teams · {range.label.toLowerCase()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />Overtime split
                  </div>
                  <div className="text-lg font-bold text-amber-700 tabular-nums sm:text-xl">
                    {missingOvertimeRateHours > 0 && kitchenTotals.overtime_wage === 0 ? "Rate needed" : fmtZAR(kitchenTotals.overtime_wage)}
                  </div>
                  {missingOvertimeRateHours > 0 ? (
                    <div className="text-xs text-amber-800 mt-1">
                      Hourly rate missing for {fmtHours(missingOvertimeRateHours)}; this pay is not included.
                    </div>
                  ) : fixedPayOvertimeHours > 0 && kitchenTotals.overtime_wage === 0 ? (
                    <div className="text-xs text-slate-500 mt-1">
                      {fmtHours(fixedPayOvertimeHours)} on fixed-pay staff; no separate premium calculated.
                    </div>
                  ) : null}
                  <div className="text-xs text-slate-500 mt-1">
                    {fmtHours(kitchenTotals.overtime_min)} · {overtimePct}% of hours
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Sunday / holiday premium
                  </div>
                  <div className="text-lg font-bold text-rose-700 tabular-nums sm:text-xl">
                    {publicHolidayEligibleHours === 0 && publicHolidayShiftCount > 0
                      ? "No hours recorded"
                      : publicHolidayRateMissingHours > 0 && publicHolidayTotalPremium === 0
                        ? "Rate needed"
                        : fmtZAR(publicHolidayTotalPremium)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {publicHolidayEligibleHours === 0 && publicHolidayShiftCount > 0
                      ? `${publicHolidayShiftCount} Sunday/holiday shifts flagged, but no eligible hours are in the premium bucket`
                      : publicHolidayRateMissingHours > 0
                      ? `Hourly rate missing for ${fmtHours(publicHolidayRateMissingHours)} of eligible hours`
                      : `${fmtHours(publicHolidayEligibleHours)} eligible hours across ${publicHolidayShiftCount} Sunday/holiday shift${publicHolidayShiftCount === 1 ? "" : "s"}`}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-5 md:grid-cols-3">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="text-xs uppercase tracking-wider text-emerald-700 mb-1">Paid for this period</div>
                <div className="text-lg font-bold text-emerald-800 tabular-nums sm:text-xl">{fmtZAR(periodPaymentSummary.paid)}</div>
                <div className="text-xs text-slate-500 mt-1">Matched to recorded earning dates</div>
              </CardContent>
            </Card>
            <Card className={periodPaymentSummary.balance < 0 ? "border-amber-300 bg-amber-50" : ""}>
              <CardContent className="p-3 sm:p-4">
                <div className="text-xs uppercase tracking-wider text-slate-600 mb-1">Balance after payments</div>
                <div className={`text-lg font-bold tabular-nums sm:text-xl ${periodPaymentSummary.balance < 0 ? "text-amber-800" : "text-slate-900"}`}>{fmtZAR(periodPaymentSummary.balance)}</div>
                <div className="text-xs text-slate-500 mt-1">Gross earned minus period-matched payments</div>
              </CardContent>
            </Card>
            {(periodPaymentSummary.overlapping || periodPaymentSummary.partial) && <Card className="border-amber-300 bg-amber-50"><CardContent className="p-3 text-xs leading-5 text-amber-900">{periodPaymentSummary.overlapping && "Some paid settlement periods overlap. "}{periodPaymentSummary.partial && "A payment covers only part of this selected range and is not netted into the balance. "}Review those periods before relying on the remaining balance.</CardContent></Card>}
          </div>

          {/* WAGE-A intel: secondary insights row. Top earner +
              cost-per-event + wage-% + open shifts. Hidden when
              there's no wage activity at all (matches the empty-
              state below). */}
          {(staffRows.length > 0 || driverRows.length > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <Trophy className="w-3 h-3" />Top earner
                  </div>
                  {topEarner ? (
                    <>
                      <div className="text-base font-semibold text-slate-900 truncate">{topEarner.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {fmtZAR(topEarner.total)} · {topEarner.detail}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400">-</div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />Cost per event
                  </div>
                  {eventCount == null || eventCount === 0 ? (
                    <div className="text-xl sm:text-2xl font-bold text-slate-300 tabular-nums">-</div>
                  ) : (
                    <>
                      <div className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                        {fmtZAR(grandTotal / eventCount)}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {eventCount} event{eventCount === 1 ? "" : "s"} in range
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              {/* WAGE-B intel: wage-as-percent-of-revenue. The
                  catering industry benchmark sits between 25% and
                  35%; below that is great, above is a flag. We
                  tone the tile green (<= 35%), amber (36-45%), or
                  rose (> 45%) so the operator's eye lands on it
                  when things are off. Hidden when there's zero
                  revenue in the window. */}
              {(() => {
                const wagePct = (revenueInRange != null && revenueInRange > 0)
                  ? (grandTotal / revenueInRange) * 100
                  : null;
                let tone = "bg-white";
                let valueTone = "text-slate-900";
                if (wagePct != null) {
                  if (wagePct <= 35) { tone = "bg-brand-primary/10"; valueTone = "text-brand-primary"; }
                  else if (wagePct <= 45) { tone = "bg-amber-50/60"; valueTone = "text-amber-700"; }
                  else { tone = "bg-rose-50/60"; valueTone = "text-rose-700"; }
                }
                return (
                  <Card className={`${tone}`}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                        <Banknote className="w-3 h-3" />Wage % of revenue
                      </div>
                      {wagePct == null ? (
                        <>
                          <div className="text-xl sm:text-2xl font-bold text-slate-300 tabular-nums">-</div>
                          <div className="text-xs text-slate-500 mt-1">No invoiced events in range</div>
                        </>
                      ) : (
                        <>
                          <div className={`text-xl sm:text-2xl font-bold tabular-nums ${valueTone}`}>{wagePct.toFixed(1)}%</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {fmtZAR(grandTotal)} on {fmtZAR(revenueInRange || 0)}. Benchmark 25-35%.
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}
              {/* WAGE-A intel: open-shift exception card. Surfaces
                  any open shift older than 12h - probable forgot-
                  to-clock-out. Pulled straight off the open_shift
                  flag that's already on every StaffWageSummary. */}
              <Card className={`${staffRows.some((r) => r.open_shift) ? "bg-amber-50/60" : ""}`}>
                <CardContent className="p-3 sm:p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Open shifts
                  </div>
                  {(() => {
                    const open = staffRows.filter((r) => r.open_shift);
                    if (open.length === 0) {
                      return (
                        <>
                          <div className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">0</div>
                          <div className="text-xs text-slate-500 mt-1">All shifts closed out</div>
                        </>
                      );
                    }
                    return (
                      <>
                        <div className="text-xl sm:text-2xl font-bold text-amber-900 tabular-nums">{open.length}</div>
                        <div className="text-xs text-amber-800/80 mt-1 truncate" title={open.map((r) => r.full_name).join(", ")}>
                          Check: {open.slice(0, 2).map((r) => r.full_name).join(", ")}{open.length > 2 ? ` + ${open.length - 2}` : ""}
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          )}
          </>}

          {authLoading ? (
            <PageLoader
              label={`Opening ${companyName}'s payroll workspace`}
              detail="Checking your company access and wage settings."
              brandName={companyName}
              brandLogoUrl={companyLogoUrl}
            />
          ) : !companyId ? (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-6 text-sm text-amber-950">
                <p className="font-semibold">This account isn&apos;t linked to a company.</p>
                <p className="mt-1 text-amber-900">Sign in with a company owner or company admin account to view wages.</p>
              </CardContent>
            </Card>
          ) : isLoading ? (
            <PageLoader
              label={`Loading ${companyName}'s wages and payments`}
              detail={`Gathering earnings and recorded payouts for ${range.label.toLowerCase()}.`}
              brandName={companyName}
              brandLogoUrl={companyLogoUrl}
            />
          ) : activeLoadError ? (
            <WageLoadError message={activeLoadError} onRetry={() => setReloadTick((n) => n + 1)} />
          ) : hasNoData ? (
            <EmptyState department="all" />
          ) : (
            <div className="space-y-8">
              <section aria-labelledby="wages-paid-heading" className="space-y-3">
                <div>
                  <h2 id="wages-paid-heading" className="text-lg font-semibold tracking-tight text-slate-900">Payments marked paid</h2>
                  <p className="mt-1 text-sm text-slate-500">Payments covering work dates in {range.label.toLowerCase()}. Paid amounts are shown separately from gross earnings.</p>
                </div>
                {paidWagesError ? (
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="p-4 text-sm text-amber-950">
                      <p className="font-medium">Recorded payments could not be loaded.</p>
                      <p className="mt-1 text-amber-900">{paidWagesError}</p>
                    </CardContent>
                  </Card>
                ) : paidWageRecords.length === 0 ? (
                  <Card><CardContent className="p-5 text-sm text-slate-500">No payments were marked paid in this period.</CardContent></Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y divide-slate-100">
                        {paidWageRecords.map((payment) => (
                          <div key={payment.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{payment.staffName}</p>
                              <p className="text-xs text-slate-500">
                                {payment.source} · paid {new Date(payment.paidAt).toLocaleDateString("en-ZA")}
                                {payment.periodFrom && payment.periodTo ? ` · covers ${payment.periodFrom} to ${payment.periodTo}` : " · earning period not recorded"}
                                {payment.reference ? ` · Ref ${payment.reference}` : ""}
                              </p>
                            </div>
                            <p className="text-sm font-bold tabular-nums text-emerald-700">{fmtZAR(payment.amount)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
                        {paidWageRecords.length} payment record{paidWageRecords.length === 1 ? "" : "s"}. Sources stay separate so a payment recorded in more than one workflow is not silently counted twice.
                      </div>
                    </CardContent>
                  </Card>
                )}
              </section>
              <section aria-labelledby="wages-trends-heading" className="space-y-3">
                <div>
                  <h2 id="wages-trends-heading" className="text-lg font-semibold tracking-tight text-slate-900">Wage trends</h2>
                  <p className="mt-1 text-sm text-slate-500">See how staff and driver costs add up over the selected period.</p>
                </div>
                {staffRows.length > 0 && (
                  <KitchenSummaryView
                    chartData={chartData}
                    topFive={topFive}
                    publicHolidayLines={publicHolidayLines}
                    staffRows={staffRows}
                    totalWage={kitchenTotals.total_wage}
                    fmtZAR={fmtZAR}
                    fmtZARDetailed={fmtZARDetailed}
                  />
                )}
                {driverRows.length > 0 && (
                  <DriverSummaryView rows={driverRows} totals={driverTotals} fmtZAR={fmtZAR} fmtZARDetailed={fmtZARDetailed} />
                )}
              </section>

              <section aria-labelledby="wages-members-heading" className="space-y-3">
                <div>
                  <h2 id="wages-members-heading" className="text-lg font-semibold tracking-tight text-slate-900">Earnings by team member</h2>
                  <p className="mt-1 text-sm text-slate-500">Every team member is listed, including people with no earnings in this period.</p>
                </div>
                {staffRows.some((row) => row.review_shifts_count > 0) && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
                    <strong>{staffRows.reduce((sum, row) => sum + row.review_shifts_count, 0)} kitchen shift(s) need clock-time review.</strong>{" "}
                    Rows over 24 hours or whose stored hour buckets disagree with their timestamps are excluded from hourly and holiday wage calculations until corrected. Expand the person&apos;s details to see the clock dates.
                  </div>
                )}
                {sortedByPerson.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">Kitchen, shopping and cleaning</h3>
                    <KitchenByPersonTable rows={sortedByPerson} totals={kitchenTotals} weeklyByStaff={weeklyByStaff} shifts={shifts} holidaySet={holidaySet} paidRecords={paidWageRecords} rangeFrom={range.fromISO.slice(0, 10)} rangeTo={toLocalISO(new Date(new Date(range.toISO).getTime() - 1))} rangeLabel={range.label} onCorrectShift={openKitchenShiftCorrection} fmtZAR={fmtZAR} fmtZARDetailed={fmtZARDetailed} />
                  </div>
                )}
                {driverRows.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700">Drivers</h3>
                    <DriverByPersonTable rows={driverRows} companyId={companyId} fromDate={range.fromISO.slice(0, 10)} toDate={toLocalISO(new Date(new Date(range.toISO).getTime() - 1))} rangeLabel={range.label} paidRecords={paidWageRecords} fmtZAR={fmtZAR} withSlug={withSlug} />
                  </div>
                )}
              </section>
            </div>
          )}
          <Card id="order-coverage-audit" className="mt-8 border-slate-200">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">Order coverage &amp; hours audit</h2>
                  <p className="mt-1 text-sm text-slate-500">Uses the same date range selected above. Order coverage hours and payable clock hours are shown separately.</p>
                </div>
                <Button type="button" variant="outline" className="h-10 shrink-0" aria-expanded={orderAuditOpen} onClick={() => setOrderAuditOpen((open) => !open)}>
                  {orderAuditOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                  {orderAuditOpen ? "Hide audit" : "Open order audit"}
                </Button>
              </div>
              {orderAuditOpen && <div className="mt-5 border-t border-slate-100 pt-4"><MonthlyPayrollAudit companyId={companyId} fromISO={range.fromISO} toISO={range.toISO} rangeLabel={visibleRangeLabel} kitchenWages={staffRows} driverWages={driverRows} kitchenShifts={shifts} onCorrectKitchenShift={openKitchenShiftCorrection} onSourceChanged={() => setReloadTick((value) => value + 1)} /></div>}
            </CardContent>
          </Card>
        </PortalShell>

        <Dialog open={!!editingKitchenShift} onOpenChange={(open) => !open && !savingKitchenShift && setEditingKitchenShift(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit shift clock times</DialogTitle>
              <DialogDescription>Update this shift’s clock-in, clock-out, or break. Enter a reason for the audit record; wage totals recalculate after saving.</DialogDescription>
            </DialogHeader>
            {editingKitchenShift && <div className="space-y-3">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Saved interval: {new Date(editingKitchenShift.shift_start).toLocaleString("en-ZA")} – {editingKitchenShift.shift_end ? new Date(editingKitchenShift.shift_end).toLocaleString("en-ZA") : "still open"}. Verify both dates before saving.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="wages-kitchen-shift-start">Clock in</Label><Input id="wages-kitchen-shift-start" type="datetime-local" value={kitchenShiftDraft.start} onChange={(event) => setKitchenShiftDraft((draft) => ({ ...draft, start: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="wages-kitchen-shift-end">Clock out</Label><Input id="wages-kitchen-shift-end" type="datetime-local" value={kitchenShiftDraft.end} onChange={(event) => setKitchenShiftDraft((draft) => ({ ...draft, end: event.target.value }))} /></div>
                <div className="space-y-1.5"><Label htmlFor="wages-kitchen-shift-break">Break minutes</Label><Input id="wages-kitchen-shift-break" type="number" min="0" step="1" value={kitchenShiftDraft.breakMin} onChange={(event) => setKitchenShiftDraft((draft) => ({ ...draft, breakMin: event.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="wages-kitchen-shift-notes">Shift notes</Label><Textarea id="wages-kitchen-shift-notes" value={kitchenShiftDraft.notes} onChange={(event) => setKitchenShiftDraft((draft) => ({ ...draft, notes: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="wages-kitchen-shift-reason">Reason for change *</Label><Textarea id="wages-kitchen-shift-reason" required value={kitchenShiftDraft.reason} onChange={(event) => setKitchenShiftDraft((draft) => ({ ...draft, reason: event.target.value }))} placeholder="For example: clock-out was missed; time confirmed with the shift lead." /></div>
            </div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingKitchenShift(null)} disabled={savingKitchenShift}>Cancel</Button>
              <Button type="button" onClick={() => void saveKitchenShiftCorrection()} disabled={savingKitchenShift || !kitchenShiftDraft.start || !kitchenShiftDraft.end || !kitchenShiftDraft.reason.trim()}>
                {savingKitchenShift ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function WageLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-rose-200">
      <CardContent className="py-12 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <p className="text-slate-900 font-medium">Couldn&apos;t load wages</p>
        <p className="text-sm text-slate-500 mt-1">{message}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ department }: { department: DepartmentKey }) {
  const Icon = department === "drivers" ? Truck : ChefHat;
  return (
    <Card className="border-2 border-dashed">
      <CardContent className="py-16 text-center">
        <Icon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-medium">No wages recorded in this period</p>
        <p className="text-sm text-slate-500 mt-1">
          {department === "drivers"
            ? "Pay will appear here when driver shifts and completed deliveries are recorded."
            : "Add team members or widen the date range to see earnings here."}
        </p>
      </CardContent>
    </Card>
  );
}

function KitchenSummaryView({
  chartData,
  topFive,
  publicHolidayLines,
  staffRows,
  totalWage,
  fmtZAR = fmtZARDefault,
  fmtZARDetailed = fmtZARDetailedDefault,
}: {
  chartData: DailyChartRow[];
  topFive: StaffWageSummary[];
  publicHolidayLines: PublicHolidayLine[];
  staffRows: StaffWageSummary[];
  totalWage: number;
  // TIGHTEN I.91: tenant-aware formatters from the parent.
  fmtZAR?: (n: number | null | undefined) => string;
  fmtZARDetailed?: (n: number | null | undefined) => string;
}) {
  // WAGE-A: when the chart has nothing to plot but the period total
  // is > 0, the page WAS lying with "No daily breakdown available."
  // The real cause is salaried staff: getWageSummary prorates their
  // monthly salary into the buckets but they don't generate shift
  // rows, so the day-by-day chart sees zero shifts. Surface that
  // explicitly instead of the misleading copy.
  const salariedTotal = staffRows
    .filter((r) => r.pay_type === "monthly")
    .reduce((s, r) => s + r.total_wage, 0);
  const salariedStaffCount = staffRows.filter((r) => r.pay_type === "monthly").length;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardContent className="p-3 sm:p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Clocked team wage spend</div>
          {chartData.length === 0 ? (
            totalWage > 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <p>
                  No hourly shifts in this range, but{" "}
                  <strong className="text-slate-700">{fmtZAR(salariedTotal)}</strong>
                  {" "}in monthly salaries was prorated across{" "}
                  {salariedStaffCount} staff member{salariedStaffCount === 1 ? "" : "s"}.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Salary lines don&apos;t generate per-day breakdown - check By person for the totals.
                </p>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">No daily breakdown available.</div>
            )
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  {/* TIGHTEN I.91: tenant-aware Y-axis tick label. */}
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtZAR(v)} />
                  <Tooltip formatter={(v: number) => fmtZARDetailed(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="standard"      name="Standard"        stackId="a" fill="#10b981" />
                  <Bar dataKey="overtime"      name="Overtime"        stackId="a" fill="#f59e0b" />
                  <Bar dataKey="publicHoliday" name="Public holiday"  stackId="a" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Top 5 cost drivers</div>
          {topFive.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No data yet.</div>
          ) : (
            <ul className="space-y-2">
              {topFive.map((r, i) => (
                <li key={r.staff_id} className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{r.full_name}</div>
                      {/* WAGE-A: department badge stacks above the
                          role_title text. Pre-WAGE-A only role_title
                          was shown - tenants entering "Other" for
                          everyone gave the owner no idea which team
                          a line belonged to. */}
                      <div className="text-xs text-slate-500 truncate flex items-center gap-1 flex-wrap">
                        {r.departments && r.departments.length > 0 && (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs px-1 py-0">
                            {deptChipText(r.departments)}
                          </Badge>
                        )}
                        {r.role_title && <span>{r.role_title}</span>}{r.login_status === "none" && <Badge variant="outline" className="border-sky-200 bg-sky-50 text-xs text-sky-800">No login · roster tracked</Badge>}{r.login_status === "unlinked" && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-800">Profile unlinked</Badge>}{r.login_status === "ambiguous" && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-xs text-rose-800">Email shared · review identity</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-brand-primary tabular-nums">{fmtZAR(r.total_wage)}</div>
                </li>
              ))}
            </ul>
          )}

          {publicHolidayLines.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-sm font-semibold text-slate-700 mb-2">Public-holiday 2x lines</div>
              <ul className="space-y-1.5">
                {publicHolidayLines.slice(0, 6).map((p, i) => (
                  <li key={`${p.staff_name}_${p.iso_date}_${i}`} className="flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-800">{p.staff_name}</span>
                      <span className="text-slate-500 ml-2">{new Date(p.iso_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-rose-700 tabular-nums">+{fmtZAR(p.premium)}</div>
                      <div className={`text-xs ${p.needsReview ? "text-amber-800" : "text-slate-500"}`}>{p.needsReview ? "Clock dates need review" : `${p.hours.toFixed(1)}h`}</div>
                    </div>
                  </li>
                ))}
                {publicHolidayLines.length > 6 && (
                  <li className="text-xs text-slate-500 pt-1">
                    + {publicHolidayLines.length - 6} more on the by-person tab
                  </li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DriverSummaryView({ rows, totals, fmtZAR = fmtZARDefault, fmtZARDetailed = fmtZARDetailedDefault }: {
  rows: DriverPayRow[];
  totals: { hourly: number; distance: number; callout: number; combined: number };
  // TIGHTEN I.91: tenant-aware formatters from the parent.
  fmtZAR?: (n: number | null | undefined) => string;
  fmtZARDetailed?: (n: number | null | undefined) => string;
}) {
  // Build a "pay component" chart per driver - top 8 drivers by total.
  const top = [...rows].sort((a, b) => b.total - a.total).slice(0, 8);
  const data = top.map((r) => ({
    name: r.full_name.length > 18 ? r.full_name.slice(0, 16) + "..." : r.full_name,
    Hourly: Math.round(r.hourly_pay),
    Distance: Math.round(r.distance_pay),
    Callouts: Math.round(r.callout_pay),
  }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardContent className="p-3 sm:p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Pay by component, top drivers</div>
          {data.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No driver pay yet.</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  {/* TIGHTEN I.91: tenant-aware Y-axis tick label. */}
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtZAR(v)} />
                  <Tooltip formatter={(v: number) => fmtZARDetailed(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Hourly"   stackId="a" fill="#10b981" />
                  <Bar dataKey="Distance" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Callouts" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Top 5 drivers by total</div>
          <ul className="space-y-2">
            {[...rows].sort((a, b) => b.total - a.total).slice(0, 5).map((r, i) => (
              <li key={r.driver_id} className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="text-sm font-medium text-slate-900 truncate">{r.full_name}</div>
                </div>
                <div className="text-sm font-bold text-brand-primary tabular-nums">{fmtZAR(r.total)}</div>
              </li>
            ))}
            {rows.length === 0 && <li className="text-sm text-slate-500 text-center py-4">No drivers in range.</li>}
          </ul>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Combined: <span className="font-bold text-brand-primary tabular-nums">{fmtZAR(totals.combined)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// WAGE-B: tiny bar sparkline. 4 weekly hour totals -> 4 vertical
// bars. Renders inline next to a by-person row so the operator
// can see whether a staff member's hours are creeping up or down
// over the last month. SVG sized to fit a narrow table column.
function HoursSparkline({ values, title }: { values: number[]; title: string }) {
  if (!values || values.length === 0 || values.every((v) => v === 0)) {
    return <span className="text-slate-300 text-xs">-</span>;
  }
  const max = Math.max(1, ...values);
  const width = 56;
  const height = 18;
  const barW = (width - 3 * 2) / values.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      <title>{title}</title>
      {values.map((v, i) => {
        const h = max > 0 ? Math.max(1, (v / max) * (height - 2)) : 1;
        const x = i * (barW + 2);
        const y = height - h;
        // Latest bar = darker so the eye lands there.
        const fill = i === values.length - 1 ? "#0f766e" : "#94a3b8";
        return <rect key={i} x={x} y={y} width={barW} height={h} rx={1} fill={fill} />;
      })}
    </svg>
  );
}

function WageMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-2.5 py-2">
      <p className="text-xs leading-4 text-slate-600">{label}</p>
      <p className="mt-0.5 break-words text-sm font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function KitchenByPersonTable({
  rows,
  totals,
  weeklyByStaff,
  shifts,
  holidaySet,
  paidRecords,
  rangeFrom,
  rangeTo,
  rangeLabel,
  onCorrectShift,
  fmtZAR = fmtZARDefault,
  fmtZARDetailed = fmtZARDetailedDefault,
}: {
  rows: StaffWageSummary[];
  totals: { standard_min: number; overtime_min: number; sunday_holiday_min: number; total_wage: number; total_min: number };
  weeklyByStaff: Map<string, number[]>;
  shifts: KitchenShift[];
  holidaySet: Set<string>;
  paidRecords: PaidWageRecord[];
  rangeFrom: string;
  rangeTo: string;
  rangeLabel: string;
  onCorrectShift: (shift: KitchenShift) => void;
  // TIGHTEN I.91: tenant-aware formatters from the parent.
  fmtZAR?: (n: number | null | undefined) => string;
  fmtZARDetailed?: (n: number | null | undefined) => string;
}) {
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(() => new Set());
  const toggleStaff = (id: string) => setExpandedStaff((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  if (rows.length === 0) {
    return <EmptyState department={"all"} />;
  }
  const totalPaid = rows.reduce((sum, row) => sum + paidForEarningPeriod(paidRecords, {
    from: rangeFrom, to: rangeTo, staffName: row.full_name, primarySource: "Kitchen payslip",
  }).amount, 0);
  return (
    <Card>
      <CardContent className="p-0">
        <div className="space-y-2 p-3 lg:hidden">
          {rows.map((r) => {
            const totalHours = (r.standard_min + r.overtime_min + r.sunday_holiday_min) / 60;
            const effectiveRate = totalHours > 0 ? r.total_wage / totalHours : 0;
            const weekMins = weeklyByStaff.get(r.staff_id) || [0, 0, 0, 0];
            const weekHours = weekMins.map((mins) => +(mins / 60).toFixed(1));
            const weekTitle = `Hours by week, oldest to newest: ${weekHours.map((hours) => `${hours.toFixed(1)}h`).join(" / ")}`;
            const paid = paidForEarningPeriod(paidRecords, { from: rangeFrom, to: rangeTo, staffName: r.full_name, primarySource: "Kitchen payslip" });
            return (
              <article key={`mobile-${r.staff_id}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><ChefHat className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-slate-900">{r.full_name}</p>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-slate-600">
                        {r.departments?.length ? <Badge variant="outline" className="text-xs">{deptChipText(r.departments)}</Badge> : null}
                        {r.role_title && <span className="break-words">{r.role_title}</span>}{r.login_status === "none" && <Badge variant="outline" className="border-sky-200 bg-sky-50 text-xs text-sky-800">No login · roster tracked</Badge>}{r.login_status === "unlinked" && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-800">Profile unlinked</Badge>}{r.login_status === "ambiguous" && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-xs text-rose-800">Email shared · review identity</Badge>}
                        {r.open_shift && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-800">On shift</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-600">Wage</p>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{fmtZAR(r.total_wage)}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <WageMiniMetric label="Shifts" value={String(r.shifts_count)} />
                  <WageMiniMetric label="Standard hours" value={`${(r.standard_min / 60).toFixed(1)}h`} />
                  <WageMiniMetric label="Overtime" value={`${(r.overtime_min / 60).toFixed(1)}h`} />
                  <WageMiniMetric label="Effective rate" value={effectiveRate > 0 ? fmtZAR(effectiveRate) : "Not set"} />
                  <WageMiniMetric label="Gross earned" value={fmtZAR(r.total_wage)} />
                  <WageMiniMetric label="Paid for period" value={fmtZAR(paid.amount)} />
                  <WageMiniMetric label="Remaining" value={fmtZAR(r.total_wage - paid.amount)} />
                </div>
                {(paid.overlapping || paid.partial) && <p className="mt-2 text-xs text-amber-800">{paid.overlapping ? "Paid period ranges overlap. " : "A payment covers only part of this selected range and is not netted. "}Check payment history before treating the remaining amount as final.</p>}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  <span>Last 4 weeks</span>
                  <HoursSparkline values={weekMins} title={weekTitle} />
                </div>
                <button type="button" aria-expanded={expandedStaff.has(r.staff_id)} onClick={() => toggleStaff(r.staff_id)} className="mt-3 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {expandedStaff.has(r.staff_id) ? "Hide details" : "View details"}
                </button>
                {expandedStaff.has(r.staff_id) && <KitchenShiftDetails row={r} shifts={shifts} holidaySet={holidaySet} paidRecords={paidRecords} rangeLabel={rangeLabel} onCorrectShift={onCorrectShift} fmtZAR={fmtZAR} />}
              </article>
            );
          })}
          <div className="flex items-center justify-between gap-3 border-t-2 border-slate-200 px-1 pt-3 text-sm font-semibold">
            <span className="text-slate-700">Period total</span>
            <span className="tabular-nums text-brand-primary">{fmtZAR(totals.total_wage)}</span>
          </div>
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-2 py-2.5 font-medium text-right">Shifts</th>
                <th className="px-2 py-2.5 font-medium text-right">Standard h</th>
                <th className="px-2 py-2.5 font-medium text-right">OT h</th>
                <th className="px-2 py-2.5 font-medium text-center">Last 4w</th>
                <th className="px-2 py-2.5 font-medium text-right">Effective rate</th>
                <th className="px-3 py-2.5 font-medium text-right">Earned R</th>
                <th className="px-2 py-2.5 font-medium text-right">Paid R</th>
                <th className="px-2 py-2.5 font-medium text-right">Balance R</th>
                <th className="px-2 py-2.5 font-medium text-right"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const totalHours = (r.standard_min + r.overtime_min + r.sunday_holiday_min) / 60;
                const effectiveRate = totalHours > 0 ? r.total_wage / totalHours : 0;
                const paid = paidForEarningPeriod(paidRecords, { from: rangeFrom, to: rangeTo, staffName: r.full_name, primarySource: "Kitchen payslip" });
                return (
                  <Fragment key={r.staff_id}><tr className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <ChefHat className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{r.full_name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 flex-wrap">
                            {/* WAGE-A: department badge so the
                                bookkeeper can tell Kitchen from
                                Drivers etc when role_title is
                                generic. */}
                            {r.departments && r.departments.length > 0 && (
                              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs px-1 py-0">
                                {deptChipText(r.departments)}
                              </Badge>
                            )}
                            {r.role_title && <span>{r.role_title}</span>}{r.login_status === "none" && <Badge variant="outline" className="border-sky-200 bg-sky-50 text-xs text-sky-800">No login · roster tracked</Badge>}{r.login_status === "unlinked" && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-800">Profile unlinked</Badge>}{r.login_status === "ambiguous" && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-xs text-rose-800">Email shared · review identity</Badge>}
                            {r.open_shift && (
                              <Badge variant="outline" className="bg-brand-primary/10 text-brand-primary border-brand-primary/20 text-xs px-1 py-0">On shift now</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-600 tabular-nums">{r.shifts_count}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{(r.standard_min / 60).toFixed(1)}h</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${r.overtime_min > 0 ? "text-amber-700" : "text-slate-500"}`}>
                      {(r.overtime_min / 60).toFixed(1)}h
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {(() => {
                        const mins = weeklyByStaff.get(r.staff_id) || [0, 0, 0, 0];
                        const hrs = mins.map((m) => +(m / 60).toFixed(1));
                        const total = hrs.reduce((s, h) => s + h, 0);
                        const title = total === 0
                          ? "No hours in the trailing 4 weeks"
                          : `Hours by week (oldest -> newest): ${hrs.map((h) => `${h.toFixed(1)}h`).join(" / ")}`;
                        return (
                          <div className="inline-flex items-center justify-center" title={title}>
                            <HoursSparkline values={mins} title={title} />
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">
                      {effectiveRate > 0 ? fmtZARDetailed(effectiveRate) : <span className="text-amber-600 text-xs">not set</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">
                      {fmtZAR(r.total_wage)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">{fmtZAR(paid.amount)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{fmtZAR(r.total_wage - paid.amount)}{(paid.overlapping || paid.partial) && <span className="block text-[10px] font-normal text-amber-800">Check periods</span>}</td>
                    <td className="px-2 py-2.5 text-right">
                      <button type="button" aria-expanded={expandedStaff.has(r.staff_id)} onClick={() => toggleStaff(r.staff_id)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        {expandedStaff.has(r.staff_id) ? "Hide details" : "View details"}
                      </button>
                    </td>
                  </tr>
                  {expandedStaff.has(r.staff_id) && <tr><td colSpan={10} className="border-b border-slate-200 bg-slate-50/60 p-3"><KitchenShiftDetails row={r} shifts={shifts} holidaySet={holidaySet} paidRecords={paidRecords} rangeLabel={rangeLabel} onCorrectShift={onCorrectShift} fmtZAR={fmtZAR} /></td></tr>}</Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                <td className="px-4 py-3 text-slate-900">Totals</td>
                <td className="px-2 py-3"></td>
                <td className="px-2 py-3 text-right tabular-nums">{(totals.standard_min / 60).toFixed(1)}h</td>
                <td className={`px-2 py-3 text-right tabular-nums ${totals.overtime_min > 0 ? "text-amber-700" : ""}`}>
                  {(totals.overtime_min / 60).toFixed(1)}h
                </td>
                <td className="px-2 py-3"></td>
                <td className="px-2 py-3"></td>
                <td className="px-3 py-3 text-right text-brand-primary tabular-nums">{fmtZAR(totals.total_wage)}</td>
                <td className="px-2 py-3 text-right tabular-nums text-emerald-700">{fmtZAR(totalPaid)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{fmtZAR(totals.total_wage - totalPaid)}</td>
                <td className="px-2 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function KitchenShiftDetails({ row, shifts, holidaySet, paidRecords, rangeLabel, onCorrectShift, fmtZAR }: {
  row: StaffWageSummary;
  shifts: KitchenShift[];
  holidaySet: Set<string>;
  paidRecords: PaidWageRecord[];
  rangeLabel: string;
  onCorrectShift: (shift: KitchenShift) => void;
  fmtZAR: (n: number | null | undefined) => string;
}) {
  const rows = shifts.filter((shift) => shift.staff_member_id === row.staff_id)
    .sort((a, b) => b.shift_start.localeCompare(a.shift_start));
  const staffPayments = paidRecords.filter((payment) => payment.staffName.trim().toLocaleLowerCase() === row.full_name.trim().toLocaleLowerCase());
  const fmtDateTime = (value: string | null) => value
    ? new Date(value).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "In progress";
  const fmtDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Earnings details · {rangeLabel}</p>
        <p className="text-xs text-slate-600">{rows.length} recorded shift{rows.length === 1 ? "" : "s"} · standard, overtime and Sunday/holiday amounts</p>
      </div>
      {rows.length === 0 ? <p className="py-3 text-sm text-slate-600">No clocked shifts in this selected range.</p> : (
        <div className="space-y-2">
          {rows.map((shift) => {
            const day = shift.shift_start.slice(0, 10);
            const sundayOrHoliday = holidaySet.has(day) || new Date(shift.shift_start).getDay() === 0;
            const needsReview = needsKitchenShiftReview(shift);
            const liveMinutes = shift.shift_end ? 0 : liveWorkedMinutes(shift);
            const standardHours = (shift.standard_min || 0) / 60;
            const overtimeHours = (shift.overtime_min || 0) / 60;
            const holidayHours = (shift.sunday_holiday_min || 0) / 60;
            const holidayPay = needsReview ? 0 : row.pay_type === "shift"
              ? holidayHours > 0 && row.shift_rate != null
                ? Math.max(0, (row.sunday_holiday_shift_rate ?? row.shift_rate * 2) - row.shift_rate)
                : 0
              : holidayHours * (row.sunday_holiday_rate || 0) * (row.pay_type === "monthly" ? 0.5 : 1);
            const standardPay = row.pay_type === "hourly" && !needsReview ? standardHours * (row.hourly_rate || 0)
              : row.pay_type === "shift" ? (shift.shift_end ? row.shift_rate || 0 : 0) : 0;
            const overtimePay = row.pay_type === "hourly" && !needsReview ? overtimeHours * (row.overtime_rate || 0) : 0;
            const linePay = standardPay + overtimePay + holidayPay;
            const timestampHours = shift.shift_end
              ? Math.max(0, (new Date(shift.shift_end).getTime() - new Date(shift.shift_start).getTime()) / 3_600_000 - (shift.total_break_min || 0) / 60)
              : liveMinutes / 60;
            return (
              <article key={shift.id} className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{fmtDate(day)}</p>
                    <p className="text-xs text-slate-600">{fmtDateTime(shift.shift_start)} – {fmtDateTime(shift.shift_end)}{shift.total_break_min > 0 ? ` · ${shift.total_break_min}m break` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sundayOrHoliday && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">{holidaySet.has(day) ? "Public holiday" : "Sunday"}</Badge>}
                    {needsReview && <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">Review clock times</Badge>}
                    {!shift.shift_end && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">In progress</Badge>}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {!shift.shift_end ? <WageMiniMetric label="Elapsed (live)" value={`${(liveMinutes / 60).toFixed(1)}h · not finalized`} /> : <WageMiniMetric label="Standard" value={`${standardHours.toFixed(1)}h${row.pay_type === "hourly" ? ` · ${fmtZAR(standardPay)}` : ""}`} />}
                  <WageMiniMetric label="Overtime" value={shift.shift_end ? `${overtimeHours.toFixed(1)}h${row.pay_type === "hourly" ? ` · ${fmtZAR(overtimePay)}` : ""}` : "Finalized at clock-out"} />
                  <WageMiniMetric label="Sunday / holiday" value={shift.shift_end ? `${holidayHours.toFixed(1)}h · ${fmtZAR(holidayPay)}` : "Finalized at clock-out"} />
                  <WageMiniMetric label={row.pay_type === "monthly" ? "Monthly base" : "Shift earnings"} value={!shift.shift_end ? "Not payable until closed" : row.pay_type === "monthly" ? "Included in period salary" : fmtZAR(linePay)} />
                </div>
                {needsReview && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">{!shift.shift_end
                  ? `This shift is still open and has ${timestampHours.toFixed(1)} elapsed hours. Close or correct it before these hours can be finalized.`
                  : `This clock row spans ${timestampHours.toFixed(1)} worked hours and exceeds 24 hours or disagrees with its saved hour buckets. Its recorded hours and holiday premium are excluded from wage totals until corrected.`}{" "}The ordinary per-shift fee remains included for a completed shift-paid shift.</p>}
                <Button type="button" size="sm" variant="outline" className={`mt-2 h-9 gap-1.5 ${needsReview ? "border-amber-300 text-amber-900 hover:bg-amber-100" : ""}`} onClick={() => onCorrectShift(shift)}><Pencil className="h-3.5 w-3.5" />{needsReview ? "Correct clock times" : "Edit shift"}</Button>
                {shift.shift_end && sundayOrHoliday && holidayHours === 0 && <p className="mt-2 text-xs text-amber-800">No Sunday/public-holiday minutes were recorded for this shift, so no holiday premium was calculated.</p>}
              </article>
            );
          })}
        </div>
      )}
      <PaymentHistory rows={staffPayments} fmtZAR={fmtZAR} />
    </div>
  );
}

const driverDetailKey = (driverId: string, fromDate: string, toDate: string) => `${driverId}:${fromDate}:${toDate}`;

function DriverByPersonTable({ rows, companyId, fromDate, toDate, rangeLabel, paidRecords, fmtZAR = fmtZARDefault, withSlug = (p: string) => p }: {
  rows: DriverPayRow[];
  companyId?: string;
  fromDate: string;
  toDate: string;
  rangeLabel: string;
  paidRecords: PaidWageRecord[];
  // TIGHTEN I.91: tenant-aware formatter from the parent.
  fmtZAR?: (n: number | null | undefined) => string;
  /** Tenant-slug wrapper from useTenantHref. The raw hrefs here used
   *  to drop the ?company_slug context on every deep-link. */
  withSlug?: (path: string) => string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [details, setDetails] = useState<Record<string, DriverPaySummary>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(() => new Set());
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [detailRetryToken, setDetailRetryToken] = useState(0);
  const detailRequests = useRef(new Set<string>());
  const totalPaid = rows.reduce((sum, row) => sum + paidForEarningPeriod(paidRecords, {
    from: fromDate, to: toDate, staffName: row.full_name, staffId: row.driver_id, primarySource: "Driver settlement",
  }).amount, 0);
  useEffect(() => {
    if (!companyId) return;
    for (const driverId of expanded) {
      const key = driverDetailKey(driverId, fromDate, toDate);
      if (details[key] || detailRequests.current.has(key)) continue;
      detailRequests.current.add(key);
      setLoadingDetails((current) => new Set(current).add(key));
      setDetailErrors((current) => { const next = { ...current }; delete next[key]; return next; });
      void driverPayService.getPaySummary({ companyId, driverId, range: { from: fromDate, to: toDate } })
        .then((summary) => setDetails((current) => ({ ...current, [key]: summary })))
        .catch((error) => setDetailErrors((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : "Could not load date details.",
        })))
        .finally(() => {
          detailRequests.current.delete(key);
          setLoadingDetails((current) => { const next = new Set(current); next.delete(key); return next; });
        });
    }
  }, [expanded, details, companyId, fromDate, toDate, detailRetryToken]);
  const toggleDetails = (driverId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(driverId)) next.delete(driverId); else next.add(driverId);
    return next;
  });
  const retryDetails = (driverId: string) => {
    const key = driverDetailKey(driverId, fromDate, toDate);
    setDetailErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    setDetailRetryToken((current) => current + 1);
  };
  // DRV-B (driver-settlement deferred, 2026-05-24): this tab is the
  // roll-up view. The action surface (drill-down, payslip PDF +
  // email, mark-as-paid) lives on /admin/driver-settlement so we
  // deep-link each row there. Pre-DRV-B operators bounced between
  // the two pages without a clear "where do I act" signal.
  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 text-xs text-slate-600 flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-blue-600" />
          <span>
            Driver wages shown as gross earned. Paid and balance use settlement work periods; full drill-down and settlement actions live on{" "}
            <Link href={withSlug("/admin/driver-settlement")} className="text-blue-700 hover:underline font-medium">
              /admin/driver-settlement
            </Link>
            .
          </span>
        </div>
        <div className="space-y-2 p-3 lg:hidden">
          {rows.map((r) => {
            const paid = paidForEarningPeriod(paidRecords, { from: fromDate, to: toDate, staffName: r.full_name, staffId: r.driver_id, primarySource: "Driver settlement" });
            const key = driverDetailKey(r.driver_id, fromDate, toDate);
            return (
            <article key={`mobile-${r.driver_id}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Truck className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">{r.full_name}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{r.hours.toFixed(1)}h · {r.distance_km.toFixed(1)} km</p>
                  </div>
                </div>
                <Link href={withSlug(`/admin/driver-settlement?driver=${r.driver_id}`)} className="min-h-10 shrink-0 inline-flex items-center rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
                  Open settlement
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <WageMiniMetric label="Hourly pay" value={fmtZAR(r.hourly_pay)} />
                <WageMiniMetric label="Distance pay" value={fmtZAR(r.distance_pay)} />
                <WageMiniMetric label="Callouts" value={fmtZAR(r.callout_pay)} />
                <WageMiniMetric label="Gross earned" value={fmtZAR(r.total)} />
                <WageMiniMetric label="Paid for period" value={fmtZAR(paid.amount)} />
                <WageMiniMetric label="Remaining" value={fmtZAR(r.total - paid.amount)} />
              </div>
              {(paid.overlapping || paid.partial) && <p className="mt-2 text-xs text-amber-800">{paid.overlapping ? "Paid settlement periods overlap. " : "A payment covers only part of this selected range and is not netted. "}Review payment periods before treating the remaining amount as final.</p>}
              <button type="button" aria-expanded={expanded.has(r.driver_id)} onClick={() => toggleDetails(r.driver_id)} className="mt-3 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {expanded.has(r.driver_id) ? "Hide details" : "View details"}
              </button>
              {expanded.has(r.driver_id) && <DriverDetailPanel summary={details[key]} loading={loadingDetails.has(key)} error={detailErrors[key]} onRetry={() => retryDetails(r.driver_id)} paidRecords={paidRecords.filter((payment) => payment.staffId === r.driver_id || payment.staffName.trim().toLocaleLowerCase() === r.full_name.trim().toLocaleLowerCase())} driverId={r.driver_id} fromDate={fromDate} toDate={toDate} rangeLabel={rangeLabel} withSlug={withSlug} fmtZAR={fmtZAR} />}
            </article>
          ); })}
          {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-600">No drivers in range.</p>}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-2 py-2.5 font-medium text-right">Hours</th>
                <th className="px-2 py-2.5 font-medium text-right">Hourly R</th>
                <th className="px-2 py-2.5 font-medium text-right">Distance R</th>
                <th className="px-2 py-2.5 font-medium text-right">Callouts R</th>
                <th className="px-3 py-2.5 font-medium text-right">Earned R</th>
                <th className="px-2 py-2.5 font-medium text-right">Paid R</th>
                <th className="px-2 py-2.5 font-medium text-right">Balance R</th>
                <th className="px-2 py-2.5 font-medium text-right w-16"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const paid = paidForEarningPeriod(paidRecords, { from: fromDate, to: toDate, staffName: r.full_name, staffId: r.driver_id, primarySource: "Driver settlement" });
                const key = driverDetailKey(r.driver_id, fromDate, toDate);
                return (
                <Fragment key={r.driver_id}><tr className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Truck className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{r.full_name}</div>
                        <div className="text-xs text-slate-500">{r.distance_km.toFixed(1)} km</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.hours.toFixed(1)}h</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtZAR(r.hourly_pay)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtZAR(r.distance_pay)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtZAR(r.callout_pay)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">{fmtZAR(r.total)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">{fmtZAR(paid.amount)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{fmtZAR(r.total - paid.amount)}{(paid.overlapping || paid.partial) && <span className="block text-[10px] font-normal text-amber-800">Check periods</span>}</td>
                  <td className="px-2 py-2.5 text-right">
                    {/* DRV-B: deep-link. driver-settlement.tsx reads
                        ?driver=<id> and auto-expands the matching
                        row + scrolls it into view. Link + withSlug so
                        the tenant slug context survives (the old raw
                        <a> dropped it and forced a full reload). */}
                    <button type="button" aria-expanded={expanded.has(r.driver_id)} onClick={() => toggleDetails(r.driver_id)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      {expanded.has(r.driver_id) ? "Hide details" : "View details"}
                    </button>
                  </td>
                </tr>
                {expanded.has(r.driver_id) && <tr><td colSpan={9} className="border-b border-slate-200 bg-slate-50/60 p-3"><DriverDetailPanel summary={details[key]} loading={loadingDetails.has(key)} error={detailErrors[key]} onRetry={() => retryDetails(r.driver_id)} paidRecords={paidRecords.filter((payment) => payment.staffId === r.driver_id || payment.staffName.trim().toLocaleLowerCase() === r.full_name.trim().toLocaleLowerCase())} driverId={r.driver_id} fromDate={fromDate} toDate={toDate} rangeLabel={rangeLabel} withSlug={withSlug} fmtZAR={fmtZAR} /></td></tr>}</Fragment>
              ); })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                <td className="px-4 py-3 text-slate-900">Totals</td>
                <td className="px-2 py-3 text-right tabular-nums">
                  {rows.reduce((s, r) => s + r.hours, 0).toFixed(1)}h
                </td>
                <td className="px-2 py-3 text-right tabular-nums">
                  {fmtZAR(rows.reduce((s, r) => s + r.hourly_pay, 0))}
                </td>
                <td className="px-2 py-3 text-right tabular-nums">
                  {fmtZAR(rows.reduce((s, r) => s + r.distance_pay, 0))}
                </td>
                <td className="px-2 py-3 text-right tabular-nums">
                  {fmtZAR(rows.reduce((s, r) => s + r.callout_pay, 0))}
                </td>
                <td className="px-3 py-3 text-right text-brand-primary tabular-nums">
                  {fmtZAR(rows.reduce((s, r) => s + r.total, 0))}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-emerald-700">{fmtZAR(totalPaid)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{fmtZAR(rows.reduce((s, r) => s + r.total, 0) - totalPaid)}</td>
                <td className="px-2 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DriverDetailPanel({ summary, loading, error, onRetry, paidRecords, driverId, fromDate, toDate, rangeLabel, withSlug, fmtZAR }: {
  summary?: DriverPaySummary;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  paidRecords: PaidWageRecord[];
  driverId: string;
  fromDate: string;
  toDate: string;
  rangeLabel: string;
  withSlug: (path: string) => string;
  fmtZAR: (n: number | null | undefined) => string;
}) {
  const settlementHref = withSlug(`/admin/driver-settlement?driver=${driverId}&from=${fromDate}&to=${toDate}`);
  const fmtDate = (value?: string | null) => value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "Date not recorded";
  const fmtDateTime = (value?: string | null) => value
    ? new Date(value).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Time not recorded";
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Earnings details · {rangeLabel}</p>
        {summary && <p className="text-xs text-slate-600">{summary.shifts.length} recorded shift{summary.shifts.length === 1 ? "" : "s"} · {summary.deliveries.length} deliver{summary.deliveries.length === 1 ? "y" : "ies"}</p>}
      </div>
      {!summary && (loading || !error) && <div role="status" aria-live="polite" className="space-y-2 py-1"><span className="sr-only">Loading driver wage details</span><div className="h-12 animate-pulse rounded-md bg-slate-200/70" /><div className="h-12 animate-pulse rounded-md bg-slate-200/70" /></div>}
      {!summary && !loading && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><span>{error || "Driver details are not available yet."}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button></div>}
      {summary && <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">Shift rows include Sunday and public-holiday multipliers. Delivery rows show distance and callout amounts.</p>
        <Link href={settlementHref} className="inline-flex min-h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-50">Open settlement</Link>
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Shifts ({summary.shifts.length})</h4>
          {summary.shifts.length === 0 ? <p className="py-2 text-sm text-slate-600">No shifts in this selected range.</p> : summary.shifts.map((shift) => {
            const dayWisePay = shift.bcea_buckets?.reduce((total, bucket) => total + bucket.pay, 0);
            const payDiffersFromDayBreakdown = !shift.needs_review && dayWisePay != null && Math.abs(dayWisePay - shift.pay) > 0.01;
            return (
              <article key={shift.shift_id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{fmtDate(shift.shift_date || shift.actual_start)}</p>
                {(shift.actual_start || shift.actual_end) && <p className="text-xs text-slate-600">{fmtDateTime(shift.actual_start)} – {fmtDateTime(shift.actual_end)}</p>}
              </div>
              <p className="text-sm font-semibold tabular-nums text-slate-900">{fmtZAR(shift.pay)}</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <WageMiniMetric label="Hours" value={`${shift.hours.toFixed(2)}h`} />
              <WageMiniMetric label="Hourly rate" value={shift.hourly_rate > 0 ? `${fmtZAR(shift.hourly_rate)}/h` : "Not set"} />
              <WageMiniMetric label="Saved multiplier" value={`${shift.multiplier.toFixed(2)}×`} />
              <WageMiniMetric label="Shift earnings" value={fmtZAR(shift.pay)} />
            </div>
            {shift.needs_review && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">{shift.review_reason || "This shift's clock times need checking. It is excluded from payable driver earnings until corrected."}</p>}
            {shift.bcea_buckets?.map((bucket) => {
              const date = new Date(`${bucket.date}T12:00:00`);
              const dayLabel = date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
              const tags = [
                bucket.dayMultiplier === 2 ? "Sunday/public holiday ×2" : null,
                bucket.overtimeHours > 0 ? `${bucket.overtimeHours.toFixed(2)}h overtime ×1.5` : null,
              ].filter(Boolean);
              return <p key={`${shift.shift_id}-${bucket.date}`} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-700"><span>{dayLabel}: {bucket.hours.toFixed(2)}h{tags.length > 0 && <span className="text-amber-800"> ({tags.join(" + ")})</span>}</span><span className="tabular-nums">{fmtZAR(bucket.pay)}</span></p>;
            })}
            {payDiffersFromDayBreakdown && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">Day-by-day rate breakdown totals {fmtZAR(dayWisePay)}; saved shift earnings are {fmtZAR(shift.pay)}. Check the saved multiplier before payout.</p>}
            <Link href={withSlug(`/admin/driver-settlement?driver=${driverId}&shift=${shift.shift_id}&from=${fromDate}&to=${toDate}`)} className={`mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold ${shift.needs_review ? "border-amber-300 text-amber-900 hover:bg-amber-100" : "border-slate-200 text-blue-700 hover:bg-blue-50"}`}><Pencil className="h-3.5 w-3.5" />{shift.needs_review ? "Correct this shift" : "Edit shift"}</Link>
          </article>
            );
          })}
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Deliveries ({summary.deliveries.length})</h4>
        {summary.deliveries.length === 0 ? <p className="text-sm text-slate-600">No completed deliveries in this selected range.</p> : summary.deliveries.map((delivery) => (
          <article key={delivery.line_id || delivery.order_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{fmtDate(delivery.event_date)} · {delivery.event_name || delivery.order_number || "Delivery"}</p>
                  <p className="text-xs text-slate-600">{delivery.order_number ? `${delivery.order_number} · ` : ""}{delivery.distance_km.toFixed(1)} km · distance {fmtZAR(delivery.distance_pay)} + callout {fmtZAR(delivery.callout_fee)}</p>
                  <p className="text-xs text-slate-500">
                    {delivery.gps_trip_duration_minutes != null ? `GPS trip timer ${Math.floor(delivery.gps_trip_duration_minutes / 60)}h ${delivery.gps_trip_duration_minutes % 60}m · ` : ""}
                    {delivery.distance_source === "gps_actual" ? "Actual GPS distance" : delivery.distance_source === "booking_route_split" ? "Allocated route estimate" : "Saved round-trip route estimate"}
                  </p>
                  {delivery.gps_distance_status === "partial" && <p className="text-xs text-amber-800">GPS capture was partial, so the route estimate is used for settlement.</p>}
                  {delivery.gps_distance_review_required && <p className="text-xs font-medium text-rose-700">Review actual GPS route · expected {delivery.gps_expected_distance_km?.toFixed(1) ?? "unknown"} km</p>}
            </div>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{fmtZAR(delivery.total)}</p>
          </article>
        ))}
      </div>
      <PaymentHistory rows={paidRecords} fmtZAR={fmtZAR} />
      </>}
    </div>
  );
}

function PaymentHistory({ rows, fmtZAR }: { rows: PaidWageRecord[]; fmtZAR: (n: number | null | undefined) => string }) {
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Payments covering this period ({rows.length})</h4>
      {rows.length === 0 ? <p className="text-sm text-slate-600">No payments recorded for this person in the selected range.</p> : rows.map((payment) => (
        <div key={`${payment.source}-${payment.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-3">
          <div>
            <p className="text-sm font-medium text-slate-900">{new Date(payment.paidAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })} · {payment.source}</p>
            {payment.periodFrom && payment.periodTo && <p className="text-xs text-slate-600">Covers {payment.periodFrom} to {payment.periodTo}</p>}
            {payment.reference && <p className="text-xs text-slate-600">{payment.reference}</p>}
          </div>
          <p className="text-sm font-semibold tabular-nums text-slate-900">{fmtZAR(payment.amount)}</p>
        </div>
      ))}
    </div>
  );
}

export default WageDashboardPage;
