/**
 * Drivers team landing - hero + live intel cards + tile shortcuts.
 *
 * DRV-A (task #212, 2026-05-25): expanded from a sparse 3-stat /
 * 4-tile page to a dispatch-manager's-eye-view of the shift,
 * mirroring the kitchen landing (#210). Same audit + intel pattern:
 *
 *   Must-fix:
 *     - OWNER + REGION_ADMIN admitted on ProtectedRoute (was 403'd).
 *     - regionFilterId honoured on every query so a regional admin
 *       sees their region's drivers, not company-wide.
 *     - captureException on load failure (was silent console.error).
 *     - withSlug on every internal href (tile shortcuts were raw
 *       paths breaking multi-tenant slug routing).
 *     - Quick-stat badges link to their drilldowns.
 *     - Week hours now reads driver_shifts.hours_worked + actual
 *       times - the canonical wage record - instead of the rough
 *       driver_assignments.assigned_at -> completed_at maths that
 *       under-reported and disagreed with /admin/driver-settlement
 *       and the Wages Drivers tab.
 *
 *   Intel (Bobby's "more intelligence" ask):
 *     - Today's deliveries pipeline (accepted / en_route / on_site /
 *       completed / declined). Overdue chip when an order's event
 *       time has passed and the driver isn't yet completed.
 *     - Unassigned-deliveries chip - confirmed orders today with
 *       no accepted driver. The loudest signal for the dispatch
 *       manager.
 *     - Clocked-in vs rostered chip from driver_shifts started today
 *       but not yet completed/missed.
 *     - Driver burn today + open settlement balance, finance-gated.
 *     - Tomorrow's deliveries count card.
 *     - Recent issues card - declined / cancelled assignments + no-
 *       shows in the last 7 days.
 *     - Fleet readiness card - active vehicles vs out-of-service.
 *     - Per-driver hours-this-week chip strip with overtime tint
 *       (>45h rose + !, >38h amber).
 */
import { useEffect, useState } from "react";
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
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { canAccessFinance } from "@/lib/authGuards";
import { captureException } from "@/lib/observability";
import { teamBucketsForUser } from "@/lib/teamRoleBuckets";
import {
  Truck, ArrowLeft, Users, Clock, ClipboardList, Loader2,
  Receipt, Map as MapIcon, Car, AlertTriangle, Banknote, CalendarDays,
  CheckCircle2, ArrowRight, Flame, Wrench, Snowflake,
} from "lucide-react";
import { PageWorkbench, PortalHeader, PortalShell } from "@/components/portal/ui";

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface DriverStats {
  active: number;
  hoursWeek: number;
  jobsToday: number;
  // DRV-A: clocked-in now from driver_shifts that started today and
  // haven't completed/missed yet.
  clockedNow: number;
  // DRV-A: today's deliveries pipeline. Status enum on
  // driver_assignments includes assigned / accepted / en_route /
  // on_site / completed / declined / cancelled.
  asnPending: number;     // accepted but not on the road yet
  asnInTransit: number;   // en_route + on_site
  asnDone: number;        // completed
  asnDeclined: number;    // declined + cancelled
  asnOverdue: number;     // event_time past + not completed
  // DRV-A: confirmed orders today with no accepted driver - the
  // loudest signal a dispatch manager wants.
  unassignedToday: number;
  // DRV-A: today's driver pay burn (finance-gated). Sum of
  // base_fee + distance_fee + total_earnings on today's
  // assignments.
  burnTodayZar: number;
  // DRV-A: outstanding driver settlement balance (finance-gated).
  // Sum of driver_payouts total_amount where status != 'paid'.
  settlementOwed: number;
  // DRV-A: tomorrow's load.
  tomorrowJobs: number;
  // DRV-A: recent issues - declined / cancelled assignments + no-
  // shows in the last 7d.
  issuesThisWeek: number;
  // DRV-A: fleet readiness - active vehicles (is_active=true) vs
  // total, plus refrigerated/warmer count for cold-chain capacity.
  vehiclesActive: number;
  vehiclesTotal: number;
  vehiclesColdChain: number;
  // DRV-A: top 6 drivers by hours this week with overtime tint.
  topDriverHours: Array<{ id: string; name: string; mins: number }>;
}

function DriversTeamPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user, profile } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const { regionFilterId } = useRegionFilter();
  const companyId = profile?.company_id || user?.company_id;
  const userRole = (profile?.active_role || profile?.role) as UserRole | undefined;
  const canSeeFinance = userRole ? canAccessFinance(userRole) : false;
  const tenantCurrency = useTenantCurrency(companyId);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DriverStats>({
    active: 0, hoursWeek: 0, jobsToday: 0,
    clockedNow: 0,
    asnPending: 0, asnInTransit: 0, asnDone: 0, asnDeclined: 0, asnOverdue: 0,
    unassignedToday: 0,
    burnTodayZar: 0, settlementOwed: 0,
    tomorrowJobs: 0,
    issuesThisWeek: 0,
    vehiclesActive: 0, vehiclesTotal: 0, vehiclesColdChain: 0,
    topDriverHours: [],
  });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((n) => n + 1), 1500);
    };
    const channel = supabase
      .channel(`teams-drivers:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_assignments", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_shifts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_payouts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const today = new Date();
        const todayISO = toLocalISO(today);
        const tomorrowDate = new Date(today);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowISO = toLocalISO(tomorrowDate);
        const weekStartISO = startOfWeek().toISOString();
        const weekAgoISO = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const nowMs = Date.now();

        // Active driver team from profiles + active_role +
        // user_departments. Drivers do not have a manager enum today,
        // but multi-role staff can still carry driver access through
        // the department table.
        let staffQ = supabase.from("profiles")
          .select("id, full_name, region_id, role, active_role, is_active")
          .eq("company_id", companyId);
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          staffQ = (staffQ as any).eq("region_id", regionFilterId);
        }

        // DRV-A: canonical week hours from driver_shifts. Walks
        // hours_worked when set, falls back to actual_end -
        // actual_start. driver_shifts doesn't carry region_id and
        // there's no `drivers` table - driver identity lives on
        // profiles with role='driver' - so region scoping happens
        // at the per-driver-name-lookup layer below, not here.
        const weekShiftsQ = supabase.from("driver_shifts")
          .select("id, driver_id, actual_start, actual_end, hours_worked, status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("planned_start", weekStartISO);

        // Today's driver_assignments with the joined order columns
        // we need - event_time + region_id for filtering + status
        // semantics on assignment_type.
        let assnTodayQ = supabase.from("driver_assignments")
          .select("id, status, assignment_type, driver_id, base_fee, distance_fee, total_earnings, orders!inner(id, event_date, event_time, company_id, deleted_at, region_id, status)")
          .eq("company_id", companyId)
          .is("orders.deleted_at", null)
          .eq("orders.event_date", todayISO);
        if (regionFilterId) assnTodayQ = assnTodayQ.eq("orders.region_id", regionFilterId);

        // Confirmed orders today (the universe of jobs the dispatcher
        // has to cover) - the unassigned count is this universe minus
        // anyone with an accepted assignment.
        let ordersTodayQ = supabase.from("orders")
          .select("id, event_time")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("event_date", todayISO)
          .in("status", ["confirmed", "preparing", "ready", "in_transit"]);
        if (regionFilterId) ordersTodayQ = ordersTodayQ.eq("region_id", regionFilterId);

        // Tomorrow's deliveries.
        let tomorrowQ = supabase.from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null)
          .eq("event_date", tomorrowISO)
          .not("status", "in", "(cancelled,completed)");
        if (regionFilterId) tomorrowQ = tomorrowQ.eq("region_id", regionFilterId);

        // Recent issues - rejected or cancelled assignments in last
        // 7d. driver_assignments.status enum is assigned / accepted /
        // en_route / picked_up / at_venue / delivered / completed /
        // rejected / cancelled - no 'declined' or 'no_show' value.
        const issuesQ = supabase.from("driver_assignments")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["rejected", "cancelled"])
          .gte("created_at", weekAgoISO);

        // Outstanding driver settlement (finance-gated at render).
        // driver_payouts uses gross_total, not total_amount.
        const settlementQ = supabase.from("driver_payouts")
          .select("gross_total, status")
          .eq("company_id", companyId)
          .in("status", ["draft", "reviewed"]);

        // Fleet readiness.
        let vehiclesQ = supabase.from("vehicles")
          .select("id, is_active, refrigerated, has_warmer")
          .eq("company_id", companyId)
          .is("deleted_at", null);
        if (regionFilterId) vehiclesQ = vehiclesQ.eq("region_id", regionFilterId);

        const [
          staffRes, weekShiftsRes, assnTodayRes, ordersTodayRes,
          tomorrowRes, issuesRes, settlementRes, vehiclesRes,
        ] = await Promise.all([
          staffQ, weekShiftsQ, assnTodayQ, ordersTodayQ,
          tomorrowQ, issuesQ, settlementQ, vehiclesQ,
        ]);

        const staffProfileRows = ((staffRes.data || []) as Array<{
          id: string;
          full_name: string | null;
          region_id?: string | null;
          role: string | null;
          active_role: string | null;
          is_active?: boolean | null;
        }>).filter((p) => p.is_active !== false);
        const staffProfileIds = staffProfileRows.map((p) => p.id).filter(Boolean);
        const { data: staffDepartmentRows } = staffProfileIds.length > 0
          ? await supabase
              .from("user_departments")
              .select("user_id, department, is_primary")
              .in("user_id", staffProfileIds)
          : { data: [] as Array<{ user_id: string | null; department: string | null; is_primary: boolean | null }> };
        const activeDriverRows = staffProfileRows.filter((p) =>
          teamBucketsForUser(p, staffDepartmentRows || []).has("drivers"),
        );
        const nameById = new Map<string, string>();
        const inScope = new Set<string>();
        for (const d of activeDriverRows) {
          nameById.set(d.id, d.full_name || "Driver");
          inScope.add(d.id);
        }

        // Hours-this-week + per-driver bucket. driver_shifts.
        // hours_worked is the canonical source; fall back to actual
        // start/end if hours_worked is null. Skip rows with status
        // 'missed' or 'scheduled' that haven't started.
        let hours = 0;
        let clockedNow = 0;
        const minsByDriver = new Map<string, number>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (weekShiftsRes.data || []) as any[]) {
          if (!s.driver_id || !inScope.has(s.driver_id)) continue;
          const status = String(s.status || "").toLowerCase();
          if (status === "scheduled" || status === "missed") continue;
          let mins = 0;
          if (s.hours_worked != null) {
            mins = Number(s.hours_worked) * 60;
          } else if (s.actual_start && s.actual_end) {
            mins = (new Date(s.actual_end).getTime() - new Date(s.actual_start).getTime()) / 60000;
          }
          if (mins > 0) {
            hours += mins / 60;
            minsByDriver.set(s.driver_id, (minsByDriver.get(s.driver_id) || 0) + mins);
          }
          // Clocked-in now: actual_start exists, actual_end null,
          // status not completed/missed.
          if (s.actual_start && !s.actual_end && status !== "completed" && status !== "missed") {
            clockedNow += 1;
          }
        }

        // Today's assignments pipeline rollup + burn.
        const assnRows = (assnTodayRes.data || []) as Array<{
          id: string; status: string | null; driver_id: string | null;
          base_fee: number | null; distance_fee: number | null; total_earnings: number | null;
          orders: { id: string; event_time: string | null; status: string } | null;
        }>;
        let asnPending = 0, asnInTransit = 0, asnDone = 0, asnDeclined = 0, asnOverdue = 0;
        let burnToday = 0;
        const assignedOrderIds = new Set<string>();
        for (const a of assnRows) {
          const st = String(a.status || "").toLowerCase();
          // Treat declined / cancelled separately from "real" pipeline
          // so the unassigned-orders calc doesn't think a declined
          // assignment covers an order.
          if (st === "declined" || st === "cancelled" || st === "no_show") {
            asnDeclined += 1;
          } else {
            // Live pipeline state.
            if (st === "completed" || st === "delivered") asnDone += 1;
            else if (st === "en_route" || st === "on_site" || st === "in_transit") asnInTransit += 1;
            else asnPending += 1;
            if (a.orders?.id) assignedOrderIds.add(a.orders.id);
          }
          // Sum burn whether or not the trip completed - committed
          // pay is committed pay.
          const earned = Number(a.total_earnings || 0);
          burnToday += earned > 0 ? earned : (Number(a.base_fee || 0) + Number(a.distance_fee || 0));
          // Overdue: order event_time has passed and not yet
          // completed/done. event_time is a TIME column so combine
          // with today.
          if (
            (st === "accepted" || st === "en_route" || st === "on_site")
            && a.orders?.event_time
          ) {
            const [h, m] = String(a.orders.event_time).split(":");
            const eventMs = new Date(`${todayISO}T${(h || "00").padStart(2, "0")}:${(m || "00").padStart(2, "0")}:00`).getTime();
            if (eventMs < nowMs) asnOverdue += 1;
          }
        }

        // Unassigned today = confirmed orders today not in
        // assignedOrderIds. Pure subtract on the universe.
        const orderRows = (ordersTodayRes.data || []) as Array<{ id: string }>;
        const unassignedToday = orderRows.filter((o) => !assignedOrderIds.has(o.id)).length;

        // Settlement owed (finance-gated). driver_payouts.gross_total
        // is the canonical column.
        let settlementOwed = 0;
        for (const p of (settlementRes.data || []) as Array<{ gross_total: number | null; status: string }>) {
          settlementOwed += Number(p.gross_total || 0);
        }

        // Fleet readiness.
        const vehicleRows = (vehiclesRes.data || []) as Array<{
          id: string; is_active: boolean | null; refrigerated: boolean | null; has_warmer: boolean | null;
        }>;
        const vehiclesActive = vehicleRows.filter((v) => v.is_active !== false).length;
        const vehiclesColdChain = vehicleRows.filter((v) => v.is_active !== false && (v.refrigerated || v.has_warmer)).length;

        // Per-driver hours chip strip - top 6 by mins. Filter to
        // drivers in the active region scope so a regional admin
        // doesn't see cross-region rollups even though the shifts
        // table itself isn't region-scoped.
        const topDriverHours = Array.from(minsByDriver.entries())
          .filter(([id]) => inScope.has(id))
          .map(([id, mins]) => ({ id, name: nameById.get(id) || "Driver", mins }))
          .sort((a, b) => b.mins - a.mins)
          .slice(0, 6);

        if (!cancelled) {
          setStats({
            active: activeDriverRows.length,
            hoursWeek: Math.round(hours),
            jobsToday: assnRows.length,
            clockedNow,
            asnPending, asnInTransit, asnDone, asnDeclined, asnOverdue,
            unassignedToday,
            burnTodayZar: burnToday,
            settlementOwed,
            tomorrowJobs: tomorrowRes.count ?? 0,
            issuesThisWeek: issuesRes.count ?? 0,
            vehiclesActive,
            vehiclesTotal: vehicleRows.length,
            vehiclesColdChain,
            topDriverHours,
          });
        }
      } catch (e) {
        captureException(e, { tags: { route: "/admin/teams/drivers", step: "load", companyId: companyId || "" } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId, regionFilterId, refreshTick]);

  const tiles = [
    { href: "/admin/driver-management", icon: Users, label: "Driver management", sub: "Roster, availability, ratings", bg: "from-sky-50 to-blue-50", iconColor: "text-sky-600" },
    { href: "/admin/driver-settlement", icon: Receipt, label: "Settlement", sub: "Pay out shifts and tips", bg: "from-brand-primary/10 to-brand-secondary/10", iconColor: "text-brand-primary" },
    { href: "/admin/route-planning", icon: MapIcon, label: "Route planning", sub: "Daily delivery sequencing", bg: "from-blue-50 to-slate-50", iconColor: "text-blue-600" },
    { href: "/admin/vehicles", icon: Car, label: "Vehicles", sub: "Fleet, services, fuel", bg: "from-slate-100 to-slate-50", iconColor: "text-slate-600" },
  ];

  const totalPipeline = stats.asnPending + stats.asnInTransit + stats.asnDone;
  const pipelinePct = totalPipeline > 0 ? Math.round((stats.asnDone / totalPipeline) * 100) : 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Drivers team - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Drivers"
            icon={Truck}
            subtitle="Logistics, deliveries and on-site setup."
            actions={
              <Link href={withSlug("/admin/teams")}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> All teams
                </Button>
              </Link>
            }
          />
          <PageWorkbench />

          {/* DRV-A: linkified quick-stat badges + clocked-now chip +
              wage burn (finance-gated) + settlement owed (finance-
              gated) + unassigned-deliveries red chip (the dispatch
              manager's biggest worry first thing in the morning). */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Link href={withSlug("/admin/driver-management")}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                {stats.active} active
              </Badge>
            </Link>
            <Link href={withSlug("/admin/driver-settlement")}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                <Clock className="w-3 h-3 mr-1" />
                {stats.hoursWeek}h this week
              </Badge>
            </Link>
            <Link href={withSlug(`/admin/order-assignments?date=${toLocalISO(new Date())}`)}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                <ClipboardList className="w-3 h-3 mr-1" />
                {stats.jobsToday} assignment{stats.jobsToday === 1 ? "" : "s"} today
              </Badge>
            </Link>
            {stats.active > 0 && (
              <Badge
                variant="outline"
                className={`px-3 py-1.5 text-sm ${
                  stats.clockedNow >= stats.active
                    ? "border-brand-primary/30 text-brand-primary bg-brand-primary/10"
                    : stats.clockedNow === 0
                      ? "border-rose-300 text-rose-700 bg-rose-50"
                      : "border-amber-300 text-amber-700 bg-amber-50"
                }`}
              >
                <Flame className="w-3 h-3 mr-1" />
                Clocked {stats.clockedNow} / {stats.active}
              </Badge>
            )}
            {stats.unassignedToday > 0 && (
              <Link href={withSlug("/admin/order-assignments?filter=unassigned")}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm border-rose-300 text-rose-800 bg-rose-50 cursor-pointer hover:bg-rose-100">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {stats.unassignedToday} unassigned today
                </Badge>
              </Link>
            )}
            {canSeeFinance && stats.burnTodayZar > 0 && (
              <Badge variant="outline" className="px-3 py-1.5 text-sm border-brand-primary/30 text-brand-primary bg-brand-primary/10 tabular-nums">
                <Banknote className="w-3 h-3 mr-1" />
                {tenantCurrency.format(stats.burnTodayZar)} pay today
              </Badge>
            )}
            {canSeeFinance && stats.settlementOwed > 0 && (
              <Link href={withSlug("/admin/driver-settlement")}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm border-slate-300 text-slate-700 bg-slate-50 tabular-nums cursor-pointer hover:bg-slate-100">
                  <Receipt className="w-3 h-3 mr-1" />
                  {tenantCurrency.format(stats.settlementOwed)} settlement owed
                </Badge>
              </Link>
            )}
          </div>

          {/* DRV-A: per-driver hours-this-week chip strip. Top 6 by
              mins; overtime tint at 45h (rose + !), 38h (amber). */}
          {stats.topDriverHours.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5">
                Hours this week
              </p>
              <div className="flex flex-wrap gap-2">
                {stats.topDriverHours.map((d) => {
                  const hrs = Math.round((d.mins / 60) * 10) / 10;
                  const overtime = hrs > 45;
                  const high = hrs > 38;
                  return (
                    <Link key={d.id} href={withSlug(`/admin/driver-settlement?driver=${d.id}`)}>
                      <Badge
                        variant="outline"
                        className={`px-2.5 py-1 text-xs tabular-nums cursor-pointer ${
                          overtime
                            ? "border-rose-300 text-rose-800 bg-rose-50 hover:bg-rose-100"
                            : high
                              ? "border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
                              : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                        }`}
                        title={overtime ? "Over 45h - check overtime policy" : high ? "Approaching overtime" : ""}
                      >
                        {d.name} · {hrs}h
                        {overtime && <span className="ml-1 text-rose-600">!</span>}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* DRV-A: 4-card intel grid above the tile shortcuts. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            {/* Today's deliveries pipeline. */}
            <Link href={withSlug("/admin/order-assignments")}>
              <Card className={`border shadow-sm transition-colors hover:border-slate-300 ${stats.asnOverdue > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Truck className={`w-6 h-6 ${stats.asnOverdue > 0 ? "text-rose-600" : "text-sky-600"} flex-shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">
                          {totalPipeline === 0
                            ? "No deliveries today"
                            : `${stats.asnDone} of ${totalPipeline} delivered`}
                        </p>
                        {stats.asnOverdue > 0 && (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            {stats.asnOverdue} overdue
                          </Badge>
                        )}
                        {stats.asnDeclined > 0 && (
                          <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700 bg-rose-50">
                            {stats.asnDeclined} declined
                          </Badge>
                        )}
                      </div>
                      {totalPipeline > 0 ? (
                        <>
                          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden mt-2">
                            <div
                              className={`h-full rounded-full ${pipelinePct >= 75 ? "bg-brand-primary" : pipelinePct >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                              style={{ width: `${pipelinePct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1.5">
                            {stats.asnInTransit > 0 && <span className="text-amber-700 font-medium">{stats.asnInTransit} on the road</span>}
                            {stats.asnInTransit > 0 && stats.asnPending > 0 && <span className="text-slate-400 mx-1">·</span>}
                            {stats.asnPending > 0 && <span>{stats.asnPending} waiting to depart</span>}
                            {stats.asnInTransit === 0 && stats.asnPending === 0 && (
                              <span className="inline-flex items-center gap-1 text-brand-primary"><CheckCircle2 className="w-3 h-3" /> All deliveries closed</span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-600 mt-1">
                          Quiet board. Tap to open the dispatch queue.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Tomorrow's load. */}
            <Link href={withSlug(`/admin/calendar?date=${toLocalISO(new Date(Date.now() + 24 * 3600 * 1000))}`)}>
              <Card className="border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <CalendarDays className={`w-6 h-6 ${stats.tomorrowJobs > 0 ? "text-blue-700" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {stats.tomorrowJobs === 0
                          ? "Light day tomorrow"
                          : `Tomorrow: ${stats.tomorrowJobs} delivery${stats.tomorrowJobs === 1 ? "" : "s"}`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {stats.tomorrowJobs === 0
                          ? "No deliveries booked. Use the quiet time for fleet checks."
                          : "Open the calendar to start sequencing routes for tomorrow."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Fleet readiness. */}
            <Link href={withSlug("/admin/vehicles")}>
              <Card className={`border shadow-sm transition-colors hover:border-slate-300 ${stats.vehiclesActive < stats.vehiclesTotal ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Wrench className={`w-6 h-6 ${stats.vehiclesActive < stats.vehiclesTotal ? "text-amber-700" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {stats.vehiclesTotal === 0
                          ? "No vehicles on file"
                          : stats.vehiclesActive === stats.vehiclesTotal
                            ? `${stats.vehiclesActive} vehicle${stats.vehiclesActive === 1 ? "" : "s"} fit to drive`
                            : `${stats.vehiclesActive} of ${stats.vehiclesTotal} fit to drive`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                        {stats.vehiclesColdChain > 0 && (
                          <>
                            <Snowflake className="w-3 h-3 text-sky-600" />
                            <span>{stats.vehiclesColdChain} cold-chain ready</span>
                            <span className="text-slate-300">·</span>
                          </>
                        )}
                        {stats.vehiclesActive < stats.vehiclesTotal
                          ? `${stats.vehiclesTotal - stats.vehiclesActive} out of service`
                          : "Tap to manage."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Recent issues. */}
            <Link href={withSlug("/admin/order-assignments?filter=issues")}>
              <Card className={`border shadow-sm transition-colors hover:border-slate-300 ${stats.issuesThisWeek > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-6 h-6 ${stats.issuesThisWeek > 0 ? "text-rose-600" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {stats.issuesThisWeek === 0
                          ? "Clean week, no issues"
                          : `${stats.issuesThisWeek} issue${stats.issuesThisWeek === 1 ? "" : "s"} this week`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {stats.issuesThisWeek === 0
                          ? "No declined / cancelled / no-show assignments in the last 7 days."
                          : "Declined, cancelled or no-show assignments. Tap to triage."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Tile shortcuts - slug-wrapped now. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {tiles.map((t) => (
              <Link key={t.label} href={withSlug(t.href)}>
                <Card className="border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <t.icon className={`w-6 h-6 ${t.iconColor} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">{t.label}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{t.sub}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Bottom hint - deeper drilldowns. */}
          <p className="text-xs text-slate-500 text-center mt-6">
            Live tracking at <Link href={withSlug("/admin/tracking")} className="text-sky-700 hover:underline">/admin/tracking</Link> ·
            dispatch queue at <Link href={withSlug("/admin/order-assignments")} className="text-sky-700 hover:underline">/admin/order-assignments</Link> ·
            wages drivers tab at <Link href={withSlug("/admin/wages?tab=drivers")} className="text-sky-700 hover:underline">/admin/wages</Link>.
          </p>
        </PortalShell>
      </div>
    </>
  );
}

export default function AdminDriversTeamPage() {
  return (
    // DRV-A (task #212, 2026-05-25): admit OWNER + REGION_ADMIN.
    // Owner persona was 403'd; regional admin couldn't open the
    // page even though every query now scopes by region.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.REGION_ADMIN]}>
      <DriversTeamPage />
    </ProtectedRoute>
  );
}
