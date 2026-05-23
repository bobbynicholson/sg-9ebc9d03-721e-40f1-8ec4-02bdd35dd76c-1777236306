/**
 * /admin/wages - payroll roll-up for the whole operation.
 *
 * Owner-only surface. Department tabs flip between Kitchen, Drivers,
 * Shopping, Cleaning and All. Drivers run on driverPayService (hourly +
 * distance + callout); the other departments run on
 * kitchenStaffService.getWageSummary (clocked time x rates with a BCEA
 * Sunday/holiday split).
 *
 * The page never enters or stores rate data - it only reads. Region
 * pill is informational; kitchen_staff_members aren't region-tagged
 * yet, so the wage figures stay company-wide and the pill simply
 * notes which branch the user has scoped to.
 */
import { UserRole } from "@/types/app";
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { DollarSign, Calendar as CalendarIcon, Download, Loader2, Users, ChefHat, Truck, ShoppingBag, Sparkles, TrendingUp, AlertTriangle, Building2, Trophy, Clock as ClockIcon, ArrowUp, ArrowDown, Wallet } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import {
  kitchenStaffService, type StaffWageSummary, type KitchenShift,
} from "@/services/kitchenStaffService";
import { driverPayService, type DriverPayRates } from "@/services/driverPayService";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { captureException } from "@/lib/observability";

// ── Helpers ─────────────────────────────────────────────────────────

type Preset = "this_week" | "this_month" | "custom";

interface Range { fromISO: string; toISO: string; label: string; }

const zarFmt = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});
const fmtZAR = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "R 0";
  return zarFmt.format(v);
};
const fmtZARDetailed = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "R 0.00";
  return `R ${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
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
  const { profile } = useAuth();
  const { toast } = useToast();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id as string | undefined;
  const { regionFilterId, options: regionOptions } = useRegionFilter();
  const activeRegion = regionOptions.find((r) => r.id === regionFilterId) || null;

  const [preset, setPreset] = useState<Preset>("this_week");
  const [range, setRange] = useState<Range>(presetRange("this_week"));
  const [customFrom, setCustomFrom] = useState<string>(toDateInput(presetRange("this_week").fromISO));
  const [customTo, setCustomTo] = useState<string>(toDateInput(presetRange("this_week").toISO));

  const [department, setDepartment] = useState<DepartmentKey>("all");
  const [subTab, setSubTab] = useState<"summary" | "by-person">("summary");

  // Kitchen-style data (used for all / kitchen / shopping / cleaning).
  const [staffRows, setStaffRows] = useState<StaffWageSummary[]>([]);
  const [shifts, setShifts] = useState<KitchenShift[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [loadingKitchen, setLoadingKitchen] = useState(true);

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
  const [owedToStaff, setOwedToStaff] = useState<number | null>(null);
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

  const handlePresetChange = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setRange(r);
      setCustomFrom(toDateInput(r.fromISO));
      setCustomTo(toDateInput(r.toISO));
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
      try {
        const dept = department === "all" ? undefined : department;
        const [summary, shiftRows, holidayRows] = await Promise.all([
          kitchenStaffService.getWageSummary(companyId, range.fromISO, range.toISO, {
            department: dept,
            region_id: regionFilterId || null,
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
        if (!cancelled) toast({ title: "Could not load wages", description: e?.message ?? "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingKitchen(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, department, regionFilterId, toast]);

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
      try {
        // Pull drivers via the profiles table (matches driverService.getAllDrivers).
        // WAGE-A: dropped the legacy `name` column (typed `as any`
        // pre-WAGE-A to bypass schema mismatch; profiles only has
        // full_name + display_name). The driverPayService just
        // needs id, full_name, email for the fallback chain.
        const { data: drivers } = await supabase
          .from("profiles")
          .select("id, full_name, email, hourly_rate, distance_rate_per_km, base_callout_fee")
          .eq("company_id", companyId)
          .eq("role", "driver");
        const driverList = (drivers || []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          hourly_rate: number | null;
          distance_rate_per_km: number | null;
          base_callout_fee: number | null;
        }>;
        const fromDate = range.fromISO.slice(0, 10);
        const toDate = range.toISO.slice(0, 10);
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
        if (!cancelled) toast({ title: "Could not load driver pay", description: e?.message ?? "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, department, toast]);

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
          region_id: regionFilterId || null,
        });
        if (cancelled) return;
        setPrevPeriodTotal(summary.reduce((s, r) => s + r.total_wage, 0));
      } catch (e) {
        captureException(e, { level: "warning", tags: { companyId, route: "/admin/wages", step: "prev_period" } });
        if (!cancelled) setPrevPeriodTotal(null);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, department, regionFilterId]);

  // WAGE-A intel: owed-to-staff total. Reuses the same source the
  // financial-dashboard uses (paymentLedgerService.getTotalOwed), so
  // the two surfaces never disagree.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const ledger = await paymentLedgerService.getPaymentLedger(companyId);
        if (!cancelled) setOwedToStaff(ledger.totalOwed);
      } catch (e) {
        captureException(e, { level: "warning", tags: { companyId, route: "/admin/wages", step: "owed_to_staff" } });
        if (!cancelled) setOwedToStaff(null);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

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
        const toDate = range.toISO.slice(0, 10);
        const { data, error } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("company_id", companyId)
          .gte("event_date", fromDate)
          .lt("event_date", toDate)
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
  }, [companyId, range.fromISO, range.toISO]);

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
  // refresh owedToStaff. Debounced because multiple clock events
  // often arrive in rapid succession at the shift boundary.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Bump the range state by recreating it - the load effects
        // re-fire when their dependencies change. Cheap, no extra
        // refs needed.
        setRange((r) => ({ ...r }));
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
  const kitchenTotals = useMemo(() => {
    const standard_min = staffRows.reduce((s, r) => s + r.standard_min, 0);
    const overtime_min = staffRows.reduce((s, r) => s + r.overtime_min, 0);
    const sunday_holiday_min = staffRows.reduce((s, r) => s + r.sunday_holiday_min, 0);
    const standard_wage = staffRows.reduce((s, r) => s + r.standard_wage, 0);
    const overtime_wage = staffRows.reduce((s, r) => s + r.overtime_wage, 0);
    const sunday_holiday_wage = staffRows.reduce((s, r) => s + r.sunday_holiday_wage, 0);
    const total_wage = staffRows.reduce((s, r) => s + r.total_wage, 0);
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
      const hours = ((sh.sunday_holiday_min || 0)) / 60;
      // Premium = pay at 2x minus what the same hours would have cost at 1x.
      // Simplifies to (sundayRate - hourlyRate) * hours when both are set.
      const premium = sundayRate != null && hourlyRate != null
        ? Math.max(0, (Number(sundayRate) - Number(hourlyRate)) * hours)
        : sundayRate != null
          ? Number(sundayRate) * hours / 2  // best-effort if hourly not set: half the 2x pay
          : 0;
      out.push({
        staff_name: wageInfo?.full_name || "Staff",
        iso_date: startDay,
        hours: Math.round(hours * 10) / 10,
        premium: Math.round(premium * 100) / 100,
      });
    }
    return out;
  }, [shifts, staffRows, holidaySet]);

  const publicHolidayTotalPremium = useMemo(
    () => publicHolidayLines.reduce((s, p) => s + p.premium, 0),
    [publicHolidayLines],
  );

  // Stacked bar chart by day.
  const chartData = useMemo<DailyChartRow[]>(() => {
    if (!shifts.length) return [];
    const map = new Map<string, DailyChartRow>();
    const staffById = new Map(staffRows.map((r) => [r.staff_id, r] as const));
    for (const sh of shifts) {
      const startDay = sh.shift_start.slice(0, 10);
      const d = new Date(startDay);
      if (!map.has(startDay)) {
        map.set(startDay, {
          day: d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric" }),
          iso: startDay,
          standard: 0,
          overtime: 0,
          publicHoliday: 0,
        });
      }
      const row = map.get(startDay)!;
      const wageInfo = staffById.get(sh.staff_member_id);
      const hourly = Number(wageInfo?.hourly_rate ?? 0);
      const otRate = Number(wageInfo?.overtime_rate ?? 0);
      const sunRate = Number(wageInfo?.sunday_holiday_rate ?? 0);
      row.standard      += hourly > 0 ? (sh.standard_min || 0) / 60 * hourly        : 0;
      row.overtime      += otRate > 0 ? (sh.overtime_min || 0) / 60 * otRate        : 0;
      row.publicHoliday += sunRate > 0 ? (sh.sunday_holiday_min || 0) / 60 * sunRate : 0;
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
  }, [shifts, staffRows]);

  // Top-5 cost drivers (kitchen-style).
  const topFive = useMemo(() => {
    return [...staffRows].sort((a, b) => b.total_wage - a.total_wage).slice(0, 5);
  }, [staffRows]);

  // By-Person sorted descending.
  const sortedByPerson = useMemo(
    () => [...staffRows].sort((a, b) => b.total_wage - a.total_wage),
    [staffRows],
  );

  // ── Driver derived ─────────────────────────────────────────────
  const driverTotals = useMemo(() => {
    const hourly = driverRows.reduce((s, r) => s + r.hourly_pay, 0);
    const distance = driverRows.reduce((s, r) => s + r.distance_pay, 0);
    const callout = driverRows.reduce((s, r) => s + r.callout_pay, 0);
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

  // ── CSV export ─────────────────────────────────────────────────
  const handleExportCsv = () => {
    const tag = `${toDateInput(range.fromISO)}_to_${toDateInput(range.toISO)}`;
    if (department === "drivers") {
      if (driverRows.length === 0) return;
      const header = [
        "Driver", "Hours", "Hourly pay (R)", "Distance km", "Distance pay (R)",
        "Callout pay (R)", "Total (R)",
      ];
      const lines = [header.join(",")];
      for (const r of driverRows) {
        lines.push([
          `"${r.full_name.replace(/"/g, '""')}"`,
          r.hours.toFixed(2),
          r.hourly_pay.toFixed(2),
          r.distance_km.toFixed(2),
          r.distance_pay.toFixed(2),
          r.callout_pay.toFixed(2),
          r.total.toFixed(2),
        ].join(","));
      }
      downloadCsv(lines.join("\n"), `wages-drivers-${tag}.csv`);
      return;
    }
    if (sortedByPerson.length === 0) return;
    // WAGE-A: added Departments column so the bookkeeper can see
    // which team a wage line belongs to. role_title is free-text
    // ("Other" is common) and was the only label pre-WAGE-A.
    const header = [
      "Staff", "Role", "Departments", "Shifts",
      "Standard hours", "Overtime hours", "Public-holiday hours",
      "Hourly rate (R)", "Effective rate (R)",
      "Standard wage (R)", "Overtime wage (R)", "Holiday wage (R)", "Total wage (R)",
    ];
    const lines = [header.join(",")];
    for (const r of sortedByPerson) {
      const totalHours = (r.standard_min + r.overtime_min + r.sunday_holiday_min) / 60;
      const effectiveRate = totalHours > 0 ? r.total_wage / totalHours : 0;
      lines.push([
        `"${(r.full_name || "").replace(/"/g, '""')}"`,
        `"${(r.role_title || "").replace(/"/g, '""')}"`,
        `"${deptChipText(r.departments).replace(/"/g, '""')}"`,
        r.shifts_count,
        (r.standard_min / 60).toFixed(2),
        (r.overtime_min / 60).toFixed(2),
        (r.sunday_holiday_min / 60).toFixed(2),
        r.hourly_rate ?? "",
        effectiveRate.toFixed(2),
        r.standard_wage.toFixed(2),
        r.overtime_wage.toFixed(2),
        r.sunday_holiday_wage.toFixed(2),
        r.total_wage.toFixed(2),
      ].join(","));
    }
    downloadCsv(lines.join("\n"), `wages-${department}-${tag}.csv`);
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
  const isLoading = isDriversTab ? loadingDrivers : loadingKitchen;
  const hasNoData = isDriversTab
    ? driverRows.length === 0 && !loadingDrivers
    : staffRows.length === 0 && !loadingKitchen;

  const overtimePct = kitchenTotals.total_min > 0
    ? Math.round((kitchenTotals.overtime_min / kitchenTotals.total_min) * 100)
    : 0;

  const publicHolidayShiftCount = publicHolidayLines.length;

  // Tightened from ADMIN -> COMPANY_ADMIN-only because UserRole.ADMIN
  // in isAdmin() includes region_admin + sales_admin, which would
  // otherwise see every staff member's pay rate. Matches the
  // canAccessFinance gate the AdminNav now wraps the Wages section in.
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN]}>
      <NoIndexMeta />
      <Head><title>Wage dashboard | CateringMS Admin</title></Head>
      <AdminNav />

      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                  Wage dashboard
                  <InfoTooltip content="Hours x rates roll-up across every department. Drivers run on the dispatch ledger (hourly + distance + callout); kitchen / shopping / cleaning run on the clocked-shift ledger with a BCEA Sunday + public-holiday split.\n\nThis page is the only place rand values surface, the team tablet shows hours only." />
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Hours and wages, owner-only. The kitchen and dispatch tablets never see rates.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeRegion && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                  <Building2 className="w-3 h-3" />
                  Filtered by region {activeRegion.name}
                </span>
              )}
              {/* WAGE-A: dynamic destination. When the Drivers tab
                  is active, Manage staff points at driver-management;
                  every other tab manages kitchen-style staff. Pre-
                  WAGE-A this always linked to /admin/kitchen-staff
                  which is the wrong place when looking at drivers. */}
              <Link href={withSlug(department === "drivers" ? "/admin/driver-management" : "/admin/kitchen-staff")}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Users className="w-4 h-4" />Manage staff
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportCsv}
                disabled={isDriversTab ? driverRows.length === 0 : sortedByPerson.length === 0}
                className="gap-1.5"
              >
                <Download className="w-4 h-4" />Export CSV
              </Button>
            </div>
          </div>

          {/* Department tabs */}
          <Tabs value={department} onValueChange={(v) => setDepartment(v as DepartmentKey)} className="mb-4">
            <TabsList className="grid grid-cols-5 w-full md:w-auto">
              <TabsTrigger value="all" className="gap-1.5 text-xs md:text-sm">
                <Users className="w-3.5 h-3.5" />All
              </TabsTrigger>
              <TabsTrigger value="kitchen" className="gap-1.5 text-xs md:text-sm">
                <ChefHat className="w-3.5 h-3.5" />Kitchen
              </TabsTrigger>
              <TabsTrigger value="drivers" className="gap-1.5 text-xs md:text-sm">
                <Truck className="w-3.5 h-3.5" />Drivers
              </TabsTrigger>
              <TabsTrigger value="shopping" className="gap-1.5 text-xs md:text-sm">
                <ShoppingBag className="w-3.5 h-3.5" />Shopping
              </TabsTrigger>
              <TabsTrigger value="cleaning" className="gap-1.5 text-xs md:text-sm">
                <Sparkles className="w-3.5 h-3.5" />Cleaning
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Period selector */}
          <Card className="border-0 shadow-sm mb-5">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ["this_week", "This week"],
                    ["this_month", "This month"],
                    ["custom", "Custom"],
                  ] as Array<[Preset, string]>).map(([p, label]) => (
                    <Button
                      key={p}
                      variant={preset === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePresetChange(p)}
                      className={preset === p ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {preset === "custom" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">From</Label>
                      <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">To</Label>
                      <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
                    </div>
                    <Button size="sm" onClick={handleApplyCustom} className="bg-emerald-600 hover:bg-emerald-700">Apply</Button>
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

          {/* Headline tiles */}
          {isDriversTab ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Hourly</div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{fmtZAR(driverTotals.hourly)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">On-shift hours x rate</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Distance</div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{fmtZAR(driverTotals.distance)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Per-km on completed runs</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Callouts</div>
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{fmtZAR(driverTotals.callout)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Flat fee per dispatch</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-emerald-50">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 mb-1">Combined</div>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">{fmtZAR(driverTotals.combined)}</div>
                  <div className="text-[10px] text-emerald-700 mt-1">{driverRows.length} driver{driverRows.length === 1 ? "" : "s"}</div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Card className="border-0 shadow-sm bg-emerald-50">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 mb-1">Period total</div>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">{fmtZAR(grandTotal)}</div>
                  {/* WAGE-A intel: trend vs same-length previous
                      period. Hidden while loading or when prev was
                      0 (would divide by zero). */}
                  {prevPeriodTotal != null && prevPeriodTotal > 0 && (() => {
                    const diff = kitchenTotals.total_wage - prevPeriodTotal;
                    const pct = Math.round((diff / prevPeriodTotal) * 100);
                    if (Math.abs(pct) < 1) return (
                      <div className="text-[10px] text-emerald-700 mt-1">Flat vs previous period</div>
                    );
                    const up = diff > 0;
                    return (
                      <div className={`text-[10px] mt-1 inline-flex items-center gap-0.5 ${up ? "text-rose-700" : "text-emerald-800"}`}>
                        {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(pct)}% vs previous period
                      </div>
                    );
                  })()}
                  <div className="text-[10px] text-emerald-700 mt-1">
                    {department === "all"
                      ? "Kitchen + drivers + shopping + cleaning"
                      : `${capitalise(department)} department`}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />Overtime split
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-amber-700 tabular-nums">{fmtZAR(kitchenTotals.overtime_wage)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {fmtHours(kitchenTotals.overtime_min)}, {overtimePct}% of total
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Public-holiday 2x
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-rose-700 tabular-nums">{fmtZAR(publicHolidayTotalPremium)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {publicHolidayShiftCount} shift{publicHolidayShiftCount === 1 ? "" : "s"} on holiday rows
                  </div>
                </CardContent>
              </Card>
              {/* WAGE-A intel: owed-to-staff tile. Same number the
                  financial-dashboard surfaces as staffPaymentsOwed.
                  Sits next to the period total so "we paid X" and
                  "we owe Y" read as one picture. */}
              <Card className="border-0 shadow-sm bg-amber-50/60">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-amber-800 mb-1 inline-flex items-center gap-1">
                    <Wallet className="w-3 h-3" />Owed to staff
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-amber-900 tabular-nums">
                    {owedToStaff == null ? <span className="text-slate-300">—</span> : fmtZAR(owedToStaff)}
                  </div>
                  <div className="text-[10px] text-amber-800/80 mt-1">
                    Unpaid clock-in sessions across every department
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* WAGE-A intel: secondary insights row. Top earner +
              cost-per-event + wage-% + open shifts. Hidden when
              there's no wage activity at all (matches the empty-
              state below). */}
          {!isDriversTab && staffRows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <Trophy className="w-3 h-3" />Top earner
                  </div>
                  {topFive[0] ? (
                    <>
                      <div className="text-base font-semibold text-slate-900 truncate">{topFive[0].full_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {fmtZAR(topFive[0].total_wage)} . {deptChipText(topFive[0].departments)}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-400">—</div>
                  )}
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />Cost per event
                  </div>
                  {eventCount == null || eventCount === 0 ? (
                    <div className="text-2xl font-bold text-slate-300 tabular-nums">—</div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-slate-900 tabular-nums">
                        {fmtZAR(grandTotal / eventCount)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
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
                  if (wagePct <= 35) { tone = "bg-emerald-50/60"; valueTone = "text-emerald-700"; }
                  else if (wagePct <= 45) { tone = "bg-amber-50/60"; valueTone = "text-amber-700"; }
                  else { tone = "bg-rose-50/60"; valueTone = "text-rose-700"; }
                }
                return (
                  <Card className={`border-0 shadow-sm ${tone}`}>
                    <CardContent className="p-4">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />Wage % of revenue
                      </div>
                      {wagePct == null ? (
                        <>
                          <div className="text-2xl font-bold text-slate-300 tabular-nums">—</div>
                          <div className="text-[10px] text-slate-500 mt-1">No invoiced events in range</div>
                        </>
                      ) : (
                        <>
                          <div className={`text-2xl font-bold tabular-nums ${valueTone}`}>{wagePct.toFixed(1)}%</div>
                          <div className="text-[10px] text-slate-500 mt-1">
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
              <Card className={`border-0 shadow-sm ${staffRows.some((r) => r.open_shift) ? "bg-amber-50/60" : ""}`}>
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Open shifts
                  </div>
                  {(() => {
                    const open = staffRows.filter((r) => r.open_shift);
                    if (open.length === 0) {
                      return (
                        <>
                          <div className="text-2xl font-bold text-slate-900 tabular-nums">0</div>
                          <div className="text-[10px] text-slate-500 mt-1">All shifts closed out</div>
                        </>
                      );
                    }
                    return (
                      <>
                        <div className="text-2xl font-bold text-amber-900 tabular-nums">{open.length}</div>
                        <div className="text-[10px] text-amber-800/80 mt-1 truncate" title={open.map((r) => r.full_name).join(", ")}>
                          Check: {open.slice(0, 2).map((r) => r.full_name).join(", ")}{open.length > 2 ? ` + ${open.length - 2}` : ""}
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Sub-tabs */}
          <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "summary" | "by-person")} className="w-full">
            <TabsList className="grid grid-cols-2 w-full md:w-72 mb-4">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="by-person">By person</TabsTrigger>
            </TabsList>

            <TabsContent value="summary">
              {isLoading ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-12 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />
                    Loading wages...
                  </CardContent>
                </Card>
              ) : hasNoData ? (
                <EmptyState department={department} />
              ) : isDriversTab ? (
                <DriverSummaryView rows={driverRows} totals={driverTotals} />
              ) : (
                <KitchenSummaryView
                  chartData={chartData}
                  topFive={topFive}
                  publicHolidayLines={publicHolidayLines}
                  staffRows={staffRows}
                  totalWage={kitchenTotals.total_wage}
                />
              )}
            </TabsContent>

            <TabsContent value="by-person">
              {isLoading ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-12 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />
                    Loading staff...
                  </CardContent>
                </Card>
              ) : hasNoData ? (
                <EmptyState department={department} />
              ) : isDriversTab ? (
                <DriverByPersonTable rows={driverRows} />
              ) : (
                <KitchenByPersonTable rows={sortedByPerson} totals={kitchenTotals} weeklyByStaff={weeklyByStaff} />
              )}
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </main>
    </ProtectedRoute>
  );
}

function capitalise(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

// ── Sub-components ─────────────────────────────────────────────────

function EmptyState({ department }: { department: DepartmentKey }) {
  return (
    <Card className="border-2 border-dashed">
      <CardContent className="py-16 text-center">
        <ChefHat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-medium">No shifts in this range</p>
        <p className="text-sm text-slate-500 mt-1">
          {department === "drivers"
            ? "Once your drivers complete deliveries, pay will appear here."
            : "Once the team starts clocking in, wages will appear here."}
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
}: {
  chartData: DailyChartRow[];
  topFive: StaffWageSummary[];
  publicHolidayLines: PublicHolidayLine[];
  staffRows: StaffWageSummary[];
  totalWage: number;
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
      <Card className="border-0 shadow-sm lg:col-span-2">
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Daily wage spend</div>
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
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R${v.toLocaleString("en-ZA")}`} />
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

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Top 5 cost drivers</div>
          {topFive.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No data yet.</div>
          ) : (
            <ul className="space-y-2">
              {topFive.map((r, i) => (
                <li key={r.staff_id} className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{r.full_name}</div>
                      {/* WAGE-A: department badge stacks above the
                          role_title text. Pre-WAGE-A only role_title
                          was shown - tenants entering "Other" for
                          everyone gave the owner no idea which team
                          a line belonged to. */}
                      <div className="text-[10px] text-slate-500 truncate flex items-center gap-1 flex-wrap">
                        {r.departments && r.departments.length > 0 && (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[9px] px-1 py-0">
                            {deptChipText(r.departments)}
                          </Badge>
                        )}
                        {r.role_title && <span>{r.role_title}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-emerald-700 tabular-nums">{fmtZAR(r.total_wage)}</div>
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
                      <div className="text-[10px] text-slate-500">{p.hours.toFixed(1)}h</div>
                    </div>
                  </li>
                ))}
                {publicHolidayLines.length > 6 && (
                  <li className="text-[11px] text-slate-500 pt-1">
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

function DriverSummaryView({ rows, totals }: { rows: DriverPayRow[]; totals: { hourly: number; distance: number; callout: number; combined: number } }) {
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
      <Card className="border-0 shadow-sm lg:col-span-2">
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Pay by component, top drivers</div>
          {data.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No driver pay yet.</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R${v.toLocaleString("en-ZA")}`} />
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

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Top 5 drivers by total</div>
          <ul className="space-y-2">
            {[...rows].sort((a, b) => b.total - a.total).slice(0, 5).map((r, i) => (
              <li key={r.driver_id} className="flex items-center justify-between border-b border-slate-100 last:border-0 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="text-sm font-medium text-slate-900 truncate">{r.full_name}</div>
                </div>
                <div className="text-sm font-bold text-emerald-700 tabular-nums">{fmtZAR(r.total)}</div>
              </li>
            ))}
            {rows.length === 0 && <li className="text-sm text-slate-500 text-center py-4">No drivers in range.</li>}
          </ul>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Combined: <span className="font-bold text-emerald-700 tabular-nums">{fmtZAR(totals.combined)}</span>
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
    return <span className="text-slate-300 text-[10px]">—</span>;
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

function KitchenByPersonTable({
  rows,
  totals,
  weeklyByStaff,
}: {
  rows: StaffWageSummary[];
  totals: { standard_min: number; overtime_min: number; sunday_holiday_min: number; total_wage: number; total_min: number };
  weeklyByStaff: Map<string, number[]>;
}) {
  if (rows.length === 0) {
    return <EmptyState department={"all"} />;
  }
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-2 py-2.5 font-medium text-right">Shifts</th>
                <th className="px-2 py-2.5 font-medium text-right">Standard h</th>
                <th className="px-2 py-2.5 font-medium text-right">OT h</th>
                <th className="px-2 py-2.5 font-medium text-center">Last 4w</th>
                <th className="px-2 py-2.5 font-medium text-right">Effective rate</th>
                <th className="px-3 py-2.5 font-medium text-right">Wage R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const totalHours = (r.standard_min + r.overtime_min + r.sunday_holiday_min) / 60;
                const effectiveRate = totalHours > 0 ? r.total_wage / totalHours : 0;
                return (
                  <tr key={r.staff_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <ChefHat className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{r.full_name}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                            {/* WAGE-A: department badge so the
                                bookkeeper can tell Kitchen from
                                Drivers etc when role_title is
                                generic. */}
                            {r.departments && r.departments.length > 0 && (
                              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[9px] px-1 py-0">
                                {deptChipText(r.departments)}
                              </Badge>
                            )}
                            {r.role_title && <span>{r.role_title}</span>}
                            {r.open_shift && (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] px-1 py-0">On shift now</Badge>
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
                  </tr>
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
                <td className="px-3 py-3 text-right text-emerald-700 tabular-nums">{fmtZAR(totals.total_wage)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DriverByPersonTable({ rows }: { rows: DriverPayRow[] }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-2 py-2.5 font-medium text-right">Hours</th>
                <th className="px-2 py-2.5 font-medium text-right">Hourly R</th>
                <th className="px-2 py-2.5 font-medium text-right">Distance R</th>
                <th className="px-2 py-2.5 font-medium text-right">Callouts R</th>
                <th className="px-3 py-2.5 font-medium text-right">Total R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.driver_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Truck className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{r.full_name}</div>
                        <div className="text-[10px] text-slate-500">{r.distance_km.toFixed(1)} km</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.hours.toFixed(1)}h</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtZAR(r.hourly_pay)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtZAR(r.distance_pay)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtZAR(r.callout_pay)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">{fmtZAR(r.total)}</td>
                </tr>
              ))}
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
                <td className="px-3 py-3 text-right text-emerald-700 tabular-nums">
                  {fmtZAR(rows.reduce((s, r) => s + r.total, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default WageDashboardPage;
