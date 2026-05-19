/**
 * Teams glance - one row per operational team. Manager Monday-morning
 * view: head count, hours logged this week, jobs today, anomalies.
 * Conservative metrics where deep joins would be expensive; this page
 * is meant for triage, not analytics.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import {
  ChefHat, Truck, ShoppingBag, Sparkles, Users, AlertTriangle,
  Loader2, ArrowRight, MapPin, TrendingUp, Calendar,
} from "lucide-react";

interface TeamRow {
  key: "kitchen" | "drivers" | "shopping" | "cleaning";
  name: string;
  icon: any;
  iconColor: string;
  bg: string;
  href: string;
  headCount: number;
  hoursThisWeek: number;
  jobsToday: number;
  anomalies: number;
  anomalyHint: string;
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();           // 0 = Sunday
  const diff = (day + 6) % 7;       // Monday-anchored
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function TeamsIndexPage() {
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const { regionFilterId, options: regionOptions } = useRegionFilter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TeamRow[]>([]);

  const regionLabel = useMemo(() => {
    if (!regionFilterId) return null;
    return (regionOptions.find((r: any) => r.id === regionFilterId) as any)?.label || null;
  }, [regionFilterId, regionOptions]);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" }),
    [],
  );

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const todayISO = toLocalISO(new Date());
      const weekStartISO = startOfWeek().toISOString();

      // Active staff per role (profiles)
      const { data: staffRows } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("company_id", companyId);

      const staffByRole: Record<string, number> = {};
      for (const s of (staffRows || []) as any[]) {
        const r = String(s.role || "").toLowerCase();
        staffByRole[r] = (staffByRole[r] || 0) + 1;
      }

      // Two shift tables, two purposes:
      //   * kitchen_duty_shifts - the live duty board (per-order,
      //     `is_active`, who's currently clocked in). Used here only
      //     for missing-clock-out anomaly detection.
      //   * kitchen_staff_shifts - the canonical wage record. Carries
      //     standard / overtime / sunday-holiday breakdowns the Wages
      //     dashboard reads. We use it for "Hours logged this week"
      //     so the Teams Hub number always agrees with what Wages
      //     reports for the same period.
      const stale = Date.now() - 16 * 3600 * 1000;

      // Region filter narrows kitchen_staff_shifts via the parent
      // kitchen_staff_members.region_id (added in the
      // kitchen_staff_members_add_region_id migration). When no region
      // is active we skip the join. Active duty shifts (the live board)
      // stay company-wide - "is anyone clocked-in past 16h" doesn't
      // segment by region.
      const staffShiftsSelect = regionFilterId
        ? "standard_min, overtime_min, sunday_holiday_min, shift_start, kitchen_staff_members!inner(region_id)"
        : "standard_min, overtime_min, sunday_holiday_min, shift_start";
      let staffShiftsQ = supabase
        .from("kitchen_staff_shifts")
        .select(staffShiftsSelect)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("shift_start", weekStartISO);
      if (regionFilterId) {
        staffShiftsQ = staffShiftsQ.eq("kitchen_staff_members.region_id", regionFilterId);
      }

      const [activeDuty, staffShiftsThisWeek] = await Promise.all([
        supabase
          .from("kitchen_duty_shifts")
          .select("id, shift_start, is_active")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .gte("shift_start", weekStartISO),
        staffShiftsQ,
      ]);

      let kitchenMissingClockOut = 0;
      for (const s of (activeDuty.data || []) as any[]) {
        const start = s.shift_start ? new Date(s.shift_start).getTime() : 0;
        if (start && start < stale) kitchenMissingClockOut += 1;
      }

      let kitchenHours = 0;
      for (const s of (staffShiftsThisWeek.data || []) as any[]) {
        const mins =
          Number(s.standard_min || 0) +
          Number(s.overtime_min || 0) +
          Number(s.sunday_holiday_min || 0);
        if (mins > 0) kitchenHours += mins / 60;
      }

      // Today's orders for kitchen jobs. Region filter respected --
      // the orders table is the only one in this hub that carries
      // region_id natively; the rest are scoped indirectly via order.
      let kitchenJobsQ = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("event_date", todayISO)
        .not("status", "in", "(cancelled,completed)");
      if (regionFilterId) kitchenJobsQ = kitchenJobsQ.eq("region_id", regionFilterId);
      const { count: kitchenJobs } = await kitchenJobsQ;

      // Driver assignments today + anomalies. Region filter applied
      // via the joined orders.region_id when active.
      let drvAssnQ = supabase
        .from("driver_assignments")
        .select("id, status, assigned_at, accepted_at, completed_at, orders!inner(event_date, company_id, deleted_at, region_id)")
        .eq("company_id", companyId)
        .is("orders.deleted_at", null)
        .eq("orders.event_date", todayISO);
      if (regionFilterId) drvAssnQ = drvAssnQ.eq("orders.region_id", regionFilterId);
      const { data: drvAssn } = await drvAssnQ;

      const drvRows = (drvAssn || []) as any[];
      const driverJobs = drvRows.length;
      const driverAnomalies = drvRows.filter((a) => {
        const s = String(a.status || "").toLowerCase();
        return s === "rejected" || s === "declined" || s === "no_show";
      }).length;

      // Driver hours this week (rough: based on completed assignments
      // with assigned_at -> completed_at). Conservative - lots of
      // assignments don't have both timestamps so this under-reports.
      const { data: drvWeek } = await supabase
        .from("driver_assignments")
        .select("assigned_at, completed_at")
        .eq("company_id", companyId)
        .gte("assigned_at", weekStartISO);
      let driverHours = 0;
      for (const a of (drvWeek || []) as any[]) {
        const s = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
        const e = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        if (s && e && e > s) driverHours += (e - s) / 3600000;
      }

      // Shopping lists today + pending overdue
      const { data: shoppingToday } = await supabase
        .from("shopping_lists")
        .select("id, status, list_date")
        .eq("company_id", companyId)
        .eq("list_date", todayISO);
      const shoppingJobs = (shoppingToday || []).length;

      const { data: shoppingOverdue } = await supabase
        .from("shopping_lists")
        .select("id")
        .eq("company_id", companyId)
        .lt("list_date", todayISO)
        .in("status", ["pending", "draft"]);
      const shoppingAnomalies = (shoppingOverdue || []).length;

      // Cleaning: no first-class table - use cleaning staff count and the
      // overall completed-events count today as a proxy for "jobs".
      let cleaningJobsQ = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("event_date", todayISO)
        .in("status", ["completed", "ready", "in_transit"]);
      if (regionFilterId) cleaningJobsQ = cleaningJobsQ.eq("region_id", regionFilterId);
      const { count: cleaningJobs } = await cleaningJobsQ;

      const teamRows: TeamRow[] = [
        {
          key: "kitchen",
          name: "Kitchen",
          icon: ChefHat,
          iconColor: "text-amber-600",
          bg: "from-amber-50 to-orange-50",
          href: "/admin/teams/kitchen",
          headCount: staffByRole["kitchen_staff"] || 0,
          hoursThisWeek: Math.round(kitchenHours),
          jobsToday: kitchenJobs ?? 0,
          anomalies: kitchenMissingClockOut,
          anomalyHint: kitchenMissingClockOut > 0
            ? `${kitchenMissingClockOut} missing clock-out`
            : "All clocked",
        },
        {
          key: "drivers",
          name: "Drivers",
          icon: Truck,
          iconColor: "text-sky-600",
          bg: "from-sky-50 to-blue-50",
          href: "/admin/teams/drivers",
          headCount: staffByRole["driver"] || 0,
          hoursThisWeek: Math.round(driverHours),
          jobsToday: driverJobs,
          anomalies: driverAnomalies,
          anomalyHint: driverAnomalies > 0 ? `${driverAnomalies} declined / no-show` : "All accepted",
        },
        {
          key: "shopping",
          name: "Shopping",
          icon: ShoppingBag,
          iconColor: "text-orange-600",
          bg: "from-orange-50 to-rose-50",
          href: "/admin/shopping",
          headCount: staffByRole["shopping_staff"] || 0,
          hoursThisWeek: 0,
          jobsToday: shoppingJobs,
          anomalies: shoppingAnomalies,
          anomalyHint: shoppingAnomalies > 0 ? `${shoppingAnomalies} overdue list${shoppingAnomalies === 1 ? "" : "s"}` : "On track",
        },
        {
          key: "cleaning",
          name: "Cleaning",
          icon: Sparkles,
          iconColor: "text-purple-600",
          bg: "from-purple-50 to-fuchsia-50",
          href: "/admin/teams/cleaning",
          headCount: staffByRole["cleaning_staff"] || 0,
          hoursThisWeek: 0,
          jobsToday: cleaningJobs ?? 0,
          anomalies: 0,
          anomalyHint: "On track",
        },
      ];

      setRows(teamRows);
    } catch (err: any) {
      console.error("Teams index load failed:", err);
      toast({
        title: "Could not load teams",
        description: err?.message || "Check your connection and retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId, regionFilterId]);

  const totalAnomalies = rows.reduce((sum, r) => sum + r.anomalies, 0);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Teams | CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
                  Teams
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Cross-team glance. Where everyone is on today's prep, dispatch, cleaning, and shopping. Click any tile to open that team.
                </p>
                <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> {todayLabel}
                  </span>
                  {regionLabel && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {regionLabel}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
              {totalAnomalies > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {totalAnomalies} anomal{totalAnomalies === 1 ? "y" : "ies"}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Refresh
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((r) => (
              <Link key={r.key} href={r.href} className="block">
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${r.bg} flex items-center justify-center flex-shrink-0`}>
                        <r.icon className={`w-6 h-6 ${r.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg sm:text-xl font-bold text-slate-900">{r.name}</h2>
                          {r.anomalies > 0 && (
                            <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                              {r.anomalies} {r.anomalies === 1 ? "issue" : "issues"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{r.anomalyHint}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 sm:gap-6 flex-shrink-0 w-full sm:w-auto">
                        <Stat label="Active" value={loading ? "--" : String(r.headCount)} />
                        <Stat label="Hours wk" value={loading ? "--" : String(r.hoursThisWeek)} />
                        <Stat label="Jobs today" value={loading ? "--" : String(r.jobsToday)} />
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0 hidden sm:block" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center sm:text-right">
      <p className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

export default function AdminTeamsIndexPage() {
  return (
    // TMS-A (teams audit, TMS-2): teams hub has a region filter
    // built in - admit region_admin so they see their regional team
    // metrics. RLS narrows the staff query per region.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.REGION_ADMIN]}>
      <TeamsIndexPage />
    </ProtectedRoute>
  );
}
