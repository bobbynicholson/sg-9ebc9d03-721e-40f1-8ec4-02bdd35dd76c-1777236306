/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/wages -- payroll roll-up for the whole operation.
 *
 * Owner-only surface. Department tabs flip between Kitchen, Drivers,
 * Shopping, Cleaning and All. Drivers run on driverPayService (hourly +
 * distance + callout); the other departments run on
 * kitchenStaffService.getWageSummary (clocked time x rates with a BCEA
 * Sunday/holiday split).
 *
 * The page never enters or stores rate data -- it only reads. Region
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
import { DollarSign, Calendar as CalendarIcon, Download, Loader2, Users, ChefHat, Truck, ShoppingBag, Sparkles, TrendingUp, AlertTriangle, Building2 } from "lucide-react";
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
  return d.toISOString().slice(0, 10);
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

function WageDashboardPage() {
  const { profile } = useAuth() as any;
  const { toast } = useToast();
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
          (supabase as any)
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
        const { data: drivers } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, name, email, hourly_rate, distance_rate_per_km, base_callout_fee")
          .eq("company_id", companyId)
          .eq("role", "driver");
        const driverList = (drivers || []) as Array<any>;
        const fromDate = range.fromISO.slice(0, 10);
        const toDate = range.toISO.slice(0, 10);
        const rows = await Promise.all(driverList.map(async (d) => {
          const sum = await driverPayService.getPaySummary({
            companyId,
            driverId: d.id,
            range: { from: fromDate, to: toDate },
          });
          return {
            driver_id: d.id,
            full_name: (d.full_name as string) || (d.name as string) || (d.email as string) || "Driver",
            hours: sum.totals.hours_total,
            hourly_pay: sum.totals.hourly_pay,
            distance_km: sum.totals.distance_total_km,
            distance_pay: sum.totals.distance_pay,
            callout_pay: sum.totals.callout_pay,
            total: sum.totals.grand_total,
            rates: sum.rates,
          } as DriverPayRow;
        }));
        if (!cancelled) setDriverRows(rows.sort((a, b) => b.total - a.total));
      } catch (e: any) {
        if (!cancelled) toast({ title: "Could not load driver pay", description: e?.message ?? "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, range.fromISO, range.toISO, department, toast]);

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
    const header = [
      "Staff", "Role", "Shifts",
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
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
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
              <Link href="/admin/kitchen-staff">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <Card className="border-0 shadow-sm bg-emerald-50">
                <CardContent className="p-4">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 mb-1">Period total</div>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">{fmtZAR(grandTotal)}</div>
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
                <KitchenByPersonTable rows={sortedByPerson} totals={kitchenTotals} />
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
}: {
  chartData: DailyChartRow[];
  topFive: StaffWageSummary[];
  publicHolidayLines: PublicHolidayLine[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="border-0 shadow-sm lg:col-span-2">
        <CardContent className="p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Daily wage spend</div>
          {chartData.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No daily breakdown available.</div>
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
                      {r.role_title && <div className="text-[10px] text-slate-500 truncate">{r.role_title}</div>}
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
  // Build a "pay component" chart per driver -- top 8 drivers by total.
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

function KitchenByPersonTable({
  rows,
  totals,
}: {
  rows: StaffWageSummary[];
  totals: { standard_min: number; overtime_min: number; sunday_holiday_min: number; total_wage: number; total_min: number };
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
