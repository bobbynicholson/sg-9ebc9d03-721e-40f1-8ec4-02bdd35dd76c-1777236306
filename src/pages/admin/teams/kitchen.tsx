/**
 * Kitchen team landing - hero + live intel cards + tile shortcuts.
 *
 * KIT-A (task #210, 2026-05-25): expanded from a sparse 3-tile
 * page to a manager's-eye-view of the day. Surfaces today's prep
 * pipeline, who's clocked, tomorrow's load, recent kitchen issues
 * and stock-at-risk - all the things the kitchen manager would
 * otherwise have to open 5 tabs to see.
 *
 * Must-fix from the audit:
 *   - OWNER + REGION_ADMIN admitted on ProtectedRoute. Pre-fix the
 *     owner persona was 403'd on their own kitchen page.
 *   - regionFilterId honoured on every query so a regional admin
 *     sees their region's numbers, not company-wide.
 *   - captureException on load failure (was console.error swallow).
 *   - Slug-wrap on every internal href via withSlug.
 *   - 3 stat badges now link to their drilldown surfaces.
 *
 * Intel additions on the audit's "more intelligence" ask:
 *   - Today's prep pipeline: pending / in_progress / done / overdue
 *     counts off kitchen_prep_tasks, with an overdue chip when any
 *     task's (start_at + duration_min) is past + status != done.
 *   - Clocked-in vs rostered: kitchen_duty_shifts is_active vs the
 *     staff_byRole headcount.
 *   - Wage burn today (finance-gated to OWNER / COMPANY_ADMIN /
 *     ADMIN / SUPER_ADMIN per feedback_finance_visibility).
 *   - Tomorrow's prep load: events count + sum of prep_duration via
 *     kitchen_prep_tasks.duration_min already created for tomorrow.
 *   - Recent kitchen issues: equipment_damages count in the last 7d.
 *   - Stock at risk: perishable inventory_items either at/below
 *     minimum or expiring in the next 3 days (via batches).
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  ChefHat, ArrowLeft, Users, Clock, ClipboardList, BookOpen, Loader2,
  DollarSign, CalendarDays, Wrench, Package, Flame,
  CheckCircle2, ArrowRight,
} from "lucide-react";

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface KitchenStats {
  active: number;
  hoursWeek: number;
  jobsToday: number;
  // KIT-A: clocked-in now from kitchen_duty_shifts where is_active=true.
  clockedNow: number;
  // KIT-A: today's prep pipeline. status from the kitchen_prep_tasks
  // CHECK constraint: 'pending' | 'in_progress' | 'done' | 'skipped'.
  prepPending: number;
  prepInProgress: number;
  prepDone: number;
  prepOverdue: number;
  // KIT-A: wage burn today (finance-gated at render).
  burnTodayZar: number;
  // KIT-A: tomorrow's prep load - event count + minutes of prep on
  // the kitchen_prep_tasks rows already created for tomorrow.
  tomorrowEvents: number;
  tomorrowPrepMin: number;
  // KIT-A: recent issues - equipment_damages count in last 7d.
  issuesThisWeek: number;
  // KIT-A: stock at risk - perishable items at or below minimum
  // OR with a batch expiring in the next 3 days.
  stockAtRisk: number;
}

function KitchenTeamPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user, profile } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const { regionFilterId } = useRegionFilter();
  const companyId = profile?.company_id || user?.company_id;
  const userRole = (profile?.active_role || profile?.role) as UserRole | undefined;
  const canSeeFinance = userRole ? canAccessFinance(userRole) : false;
  const tenantCurrency = useTenantCurrency(companyId);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<KitchenStats>({
    active: 0, hoursWeek: 0, jobsToday: 0,
    clockedNow: 0,
    prepPending: 0, prepInProgress: 0, prepDone: 0, prepOverdue: 0,
    burnTodayZar: 0,
    tomorrowEvents: 0, tomorrowPrepMin: 0,
    issuesThisWeek: 0,
    stockAtRisk: 0,
  });

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
        const todayStartISO = `${todayISO}T00:00:00`;
        const todayEndISO = `${todayISO}T23:59:59`;
        const threeDaysISO = toLocalISO(new Date(Date.now() + 3 * 24 * 3600 * 1000));

        // Active kitchen staff. KIT-A: region scope via region_id
        // on profiles when active.
        let staffQ = supabase.from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("role", "kitchen_staff");
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          staffQ = (staffQ as any).eq("region_id", regionFilterId);
        }

        // Week shift hours via kitchen_staff_shifts (canonical wage
        // record). Region scope via the joined kitchen_staff_members.
        const staffShiftsSelect = regionFilterId
          ? "standard_min, overtime_min, sunday_holiday_min, shift_start, kitchen_staff_members!inner(region_id, hourly_rate)"
          : "standard_min, overtime_min, sunday_holiday_min, shift_start, kitchen_staff_members!inner(hourly_rate)";
        let shiftsWeekQ = supabase.from("kitchen_staff_shifts")
          .select(staffShiftsSelect)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("shift_start", weekStartISO);
        if (regionFilterId) {
          shiftsWeekQ = shiftsWeekQ.eq("kitchen_staff_members.region_id", regionFilterId);
        }

        // Jobs today via orders. Matches the hub's query exactly
        // for consistency.
        let jobsTodayQ = supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null)
          .eq("event_date", todayISO)
          .not("status", "in", "(cancelled,completed)");
        if (regionFilterId) jobsTodayQ = jobsTodayQ.eq("region_id", regionFilterId);

        // Tomorrow's events count for the prep-load card.
        let tomorrowJobsQ = supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null)
          .eq("event_date", tomorrowISO)
          .not("status", "in", "(cancelled,completed)");
        if (regionFilterId) tomorrowJobsQ = tomorrowJobsQ.eq("region_id", regionFilterId);

        // Today's prep pipeline. Pull every kitchen_prep_tasks row
        // whose start_at is within today and roll up by status. The
        // overdue derivation needs duration_min on each row.
        let prepTodayQ = supabase.from("kitchen_prep_tasks")
          .select("status, start_at, duration_min")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("start_at", todayStartISO)
          .lte("start_at", todayEndISO);
        if (regionFilterId) prepTodayQ = prepTodayQ.eq("region_id", regionFilterId);

        // Tomorrow's prep minutes total for the load card.
        let prepTomorrowQ = supabase.from("kitchen_prep_tasks")
          .select("duration_min")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("start_at", `${tomorrowISO}T00:00:00`)
          .lte("start_at", `${tomorrowISO}T23:59:59`);
        if (regionFilterId) prepTomorrowQ = prepTomorrowQ.eq("region_id", regionFilterId);

        // Clocked-in now. kitchen_duty_shifts is_active=true within
        // the week window catches both clean clock-ins and stale
        // sessions (missing clock-out > 16h is filtered out on the
        // hub; here we just count any is_active).
        let activeDutyQ = supabase.from("kitchen_duty_shifts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true);
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          activeDutyQ = (activeDutyQ as any).eq("region_id", regionFilterId);
        }

        // Issues this week - equipment_damages logged in the last 7d.
        let damagesQ = supabase.from("equipment_damages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("created_at", weekAgoISO);
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          damagesQ = (damagesQ as any).eq("region_id", regionFilterId);
        }

        // Stock at risk - two signals:
        //   (a) perishable items at or below minimum_stock
        //   (b) perishable batches expiring within the next 3 days
        // We count distinct inventory_item_ids that satisfy either.
        const lowStockQ = supabase.from("inventory_items")
          .select("id, current_stock, minimum_stock, is_perishable")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("is_perishable", true);
        const expiringBatchesQ = supabase.from("inventory_batches")
          .select("inventory_item_id, expiry_date")
          .eq("company_id", companyId)
          .gte("expiry_date", todayISO)
          .lte("expiry_date", threeDaysISO);

        const [
          staffRes, shiftsWeekRes, jobsTodayRes, tomorrowJobsRes,
          prepTodayRes, prepTomorrowRes, activeDutyRes, damagesRes,
          lowStockRes, expiringBatchesRes,
        ] = await Promise.all([
          staffQ, shiftsWeekQ, jobsTodayQ, tomorrowJobsQ,
          prepTodayQ, prepTomorrowQ, activeDutyQ, damagesQ,
          lowStockQ, expiringBatchesQ,
        ]);

        // Hours-this-week + wage burn today, walking the same rows.
        let hours = 0;
        let burnToday = 0;
        const todayMs = new Date(todayStartISO).getTime();
        const todayEndMs = new Date(todayEndISO).getTime();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (shiftsWeekRes.data || []) as any[]) {
          const mins =
            Number(s.standard_min || 0) +
            Number(s.overtime_min || 0) +
            Number(s.sunday_holiday_min || 0);
          if (mins <= 0) continue;
          hours += mins / 60;
          const start = s.shift_start ? new Date(s.shift_start).getTime() : 0;
          if (start >= todayMs && start <= todayEndMs) {
            const rate = Number(s.kitchen_staff_members?.hourly_rate || 0);
            if (rate > 0) burnToday += (mins / 60) * rate;
          }
        }

        // Prep pipeline rollup. Status from the CHECK constraint:
        // pending / in_progress / done / skipped. We bucket skipped
        // into the done count for the "this isn't going to happen
        // any more" frame.
        const prepRows = (prepTodayRes.data || []) as Array<{
          status: string | null; start_at: string | null; duration_min: number | null;
        }>;
        let prepPending = 0, prepInProgress = 0, prepDone = 0, prepOverdue = 0;
        const nowMs = Date.now();
        for (const r of prepRows) {
          const s = String(r.status || "").toLowerCase();
          if (s === "done" || s === "skipped") {
            prepDone += 1;
            continue;
          }
          if (s === "in_progress") prepInProgress += 1;
          else prepPending += 1;
          // Overdue: start_at + duration_min has passed and status
          // isn't done/skipped.
          if (r.start_at) {
            const eta = new Date(r.start_at).getTime() + Number(r.duration_min || 0) * 60_000;
            if (eta < nowMs) prepOverdue += 1;
          }
        }

        // Tomorrow's prep load.
        const prepTomorrowMin = ((prepTomorrowRes.data || []) as Array<{ duration_min: number | null }>)
          .reduce((sum, r) => sum + Number(r.duration_min || 0), 0);

        // Stock at risk - union of low-stock perishables + expiring batches.
        const lowStockIds = new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (lowStockRes.data || []) as any[]) {
          const s = Number(r.current_stock || 0);
          const m = Number(r.minimum_stock || 0);
          if (m > 0 && s <= m) lowStockIds.add(r.id);
        }
        for (const b of (expiringBatchesRes.data || []) as Array<{ inventory_item_id: string | null }>) {
          if (b.inventory_item_id) lowStockIds.add(b.inventory_item_id);
        }

        if (!cancelled) {
          setStats({
            active: staffRes.count ?? 0,
            hoursWeek: Math.round(hours),
            jobsToday: jobsTodayRes.count ?? 0,
            clockedNow: activeDutyRes.count ?? 0,
            prepPending,
            prepInProgress,
            prepDone,
            prepOverdue,
            burnTodayZar: burnToday,
            tomorrowEvents: tomorrowJobsRes.count ?? 0,
            tomorrowPrepMin: prepTomorrowMin,
            issuesThisWeek: damagesRes.count ?? 0,
            stockAtRisk: lowStockIds.size,
          });
        }
      } catch (e) {
        captureException(e, { tags: { route: "/admin/teams/kitchen", step: "load", companyId: companyId || "" } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId, regionFilterId]);

  const tiles = [
    { href: "/admin/kitchen-staff", icon: Users, label: "Kitchen staff", sub: "Roster, rates, departments", bg: "from-amber-50 to-orange-50", iconColor: "text-amber-600" },
    // Phase 3 admin sweep note: /admin/kitchen-duty-tracking redirects
    // to the kitchen portal; /admin/kitchen-schedule is the live admin
    // view with late/missed badges, so we route there directly.
    { href: "/admin/kitchen-schedule", icon: ClipboardList, label: "Schedule + clock-ins", sub: "Weekly roster, late/missed badges", bg: "from-rose-50 to-pink-50", iconColor: "text-rose-600" },
    { href: "/admin/inventory-recipes", icon: BookOpen, label: "Recipes & inventory", sub: "Link recipes to stock", bg: "from-emerald-50 to-teal-50", iconColor: "text-emerald-600" },
  ];

  const totalPrep = stats.prepPending + stats.prepInProgress + stats.prepDone;
  const prepDonePct = totalPrep > 0 ? Math.round((stats.prepDone / totalPrep) * 100) : 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Kitchen team | CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <Link href={withSlug("/admin/teams")} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-3">
            <ArrowLeft className="w-4 h-4" /> All teams
          </Link>

          <div className="relative h-[200px] rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
            <div className="relative h-full flex items-end p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <ChefHat className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl xl:text-4xl font-serif text-white">Kitchen</h1>
                  <p className="text-sm text-white/90 mt-0.5">Prep, plating and pass-through.</p>
                </div>
              </div>
            </div>
          </div>

          {/* KIT-A: linkified quick-stat badges. The hub already lets
              the operator drill in; the landing page should too. */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Link href={withSlug("/admin/kitchen-staff")}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                {stats.active} active
              </Badge>
            </Link>
            <Link href={withSlug("/admin/staff-hours")}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                <Clock className="w-3 h-3 mr-1" />
                {stats.hoursWeek}h this week
              </Badge>
            </Link>
            <Link href={withSlug(`/admin/calendar?date=${toLocalISO(new Date())}`)}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                <ClipboardList className="w-3 h-3 mr-1" />
                {stats.jobsToday} job{stats.jobsToday === 1 ? "" : "s"} today
              </Badge>
            </Link>
            {/* KIT-A: clocked-now chip. Reads is_active off the duty
                board; "X of Y in" if both numbers are known. Tinted by
                gap so the manager spots understaffing fast. */}
            {stats.active > 0 && (
              <Badge
                variant="outline"
                className={`px-3 py-1.5 text-sm ${
                  stats.clockedNow >= stats.active
                    ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                    : stats.clockedNow === 0
                      ? "border-rose-300 text-rose-700 bg-rose-50"
                      : "border-amber-300 text-amber-700 bg-amber-50"
                }`}
              >
                <Flame className="w-3 h-3 mr-1" />
                Clocked {stats.clockedNow} / {stats.active}
              </Badge>
            )}
            {/* KIT-A: wage burn today, finance-gated. */}
            {canSeeFinance && stats.burnTodayZar > 0 && (
              <Badge variant="outline" className="px-3 py-1.5 text-sm border-emerald-300 text-emerald-700 bg-emerald-50 tabular-nums">
                <DollarSign className="w-3 h-3 mr-1" />
                {tenantCurrency.format(stats.burnTodayZar)} burn today
              </Badge>
            )}
          </div>

          {/* KIT-A: intel grid - 4 cards above the 3 tile shortcuts.
              Mirrors the cleaning landing's pattern (damages + supplies)
              but kitchen-shaped. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            {/* Today's prep pipeline. Bar + status counts + overdue
                chip. Done-percent caption frames where the kitchen
                actually is right now. */}
            <Link href={withSlug("/admin/kitchen-schedule")}>
              <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow ${stats.prepOverdue > 0 ? "bg-gradient-to-br from-rose-50 to-amber-50" : "bg-gradient-to-br from-amber-50 to-orange-50"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Flame className={`w-6 h-6 ${stats.prepOverdue > 0 ? "text-rose-600" : "text-amber-600"} flex-shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">
                          {totalPrep === 0
                            ? "No prep tasks today"
                            : `${stats.prepDone} of ${totalPrep} prep tasks done`}
                        </p>
                        {stats.prepOverdue > 0 && (
                          <Badge variant="destructive" className="text-[10px] uppercase">
                            {stats.prepOverdue} overdue
                          </Badge>
                        )}
                      </div>
                      {totalPrep > 0 ? (
                        <>
                          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden mt-2">
                            <div
                              className={`h-full rounded-full ${prepDonePct >= 75 ? "bg-emerald-500" : prepDonePct >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                              style={{ width: `${prepDonePct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1.5">
                            {stats.prepInProgress > 0 && <span className="text-amber-700 font-medium">{stats.prepInProgress} in progress</span>}
                            {stats.prepInProgress > 0 && stats.prepPending > 0 && <span className="text-slate-400 mx-1">·</span>}
                            {stats.prepPending > 0 && <span>{stats.prepPending} not started</span>}
                            {stats.prepInProgress === 0 && stats.prepPending === 0 && (
                              <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> All caught up</span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-600 mt-1">
                          No tasks scheduled for today. Tap to open the schedule grid.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Tomorrow's prep load. Helps the manager call extra
                staff in before the day arrives. */}
            <Link href={withSlug(`/admin/calendar?date=${toLocalISO(new Date(Date.now() + 24 * 3600 * 1000))}`)}>
              <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br ${stats.tomorrowEvents > 0 ? "from-blue-50 to-indigo-50" : "from-slate-50 to-slate-100"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <CalendarDays className={`w-6 h-6 ${stats.tomorrowEvents > 0 ? "text-blue-700" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {stats.tomorrowEvents === 0
                          ? "Light day tomorrow"
                          : `Tomorrow: ${stats.tomorrowEvents} event${stats.tomorrowEvents === 1 ? "" : "s"}`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {stats.tomorrowPrepMin > 0
                          ? `${Math.round(stats.tomorrowPrepMin / 60 * 10) / 10}h of prep already scheduled. Call extra hands in now if needed.`
                          : "No events booked. Quiet kitchen day."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Recent kitchen issues. equipment_damages is the cleaning
                team's primary signal too - we surface the same number
                so the kitchen manager isn't blindsided. */}
            <Link href={withSlug("/admin/equipment?tab=shortages")}>
              <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow ${stats.issuesThisWeek > 0 ? "bg-gradient-to-br from-rose-50 to-pink-50" : "bg-gradient-to-br from-slate-50 to-slate-100"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Wrench className={`w-6 h-6 ${stats.issuesThisWeek > 0 ? "text-rose-600" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {stats.issuesThisWeek === 0
                          ? "Clean week, no damages"
                          : `${stats.issuesThisWeek} equipment issue${stats.issuesThisWeek === 1 ? "" : "s"} this week`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {stats.issuesThisWeek === 0
                          ? "Nothing logged in the last 7 days."
                          : "Damages logged in the last 7 days. Tap to review."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Stock at risk - perishable. The manager's "what do I
                need to check on the fly today" prompt. */}
            <Link href={withSlug("/admin/stock?filter=perishable-risk")}>
              <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow ${stats.stockAtRisk > 0 ? "bg-gradient-to-br from-amber-50 to-yellow-50" : "bg-gradient-to-br from-slate-50 to-slate-100"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Package className={`w-6 h-6 ${stats.stockAtRisk > 0 ? "text-amber-700" : "text-slate-400"} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {stats.stockAtRisk === 0
                          ? "Perishables on par"
                          : `${stats.stockAtRisk} perishable${stats.stockAtRisk === 1 ? "" : "s"} at risk`}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {stats.stockAtRisk === 0
                          ? "Nothing low and nothing expiring in the next 3 days."
                          : "Low stock or expiring within 3 days. Tap to triage."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Tile shortcuts - unchanged routing, slug-wrapped now. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {tiles.map((t) => (
              <Link key={t.label} href={withSlug(t.href)}>
                <Card className={`border-0 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br ${t.bg}`}>
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

          {/* KIT-A: an at-a-glance "what's surfaced where" hint at
              the bottom so a new operator knows the deeper drilldowns
              exist (handovers / wages / live ops). */}
          <p className="text-xs text-slate-500 text-center mt-6">
            Detailed live ops live at <Link href={withSlug("/admin/live-operations")} className="text-amber-700 hover:underline">/admin/live-operations</Link> ·
            wage reports at <Link href={withSlug("/admin/wages")} className="text-amber-700 hover:underline">/admin/wages</Link> ·
            kitchen handover history at <Link href={withSlug("/team-portal/kitchen/handovers")} className="text-amber-700 hover:underline">/team-portal/kitchen/handovers</Link>.
          </p>
        </div>
      </div>
    </>
  );
}

export default function AdminKitchenTeamPage() {
  return (
    // KIT-A (task #210, 2026-05-25): admit OWNER + REGION_ADMIN.
    // Pre-fix the owner persona was 403'd on their own kitchen page
    // despite seeing finance everywhere else, and a regional admin
    // couldn't open this even though the page now respects their
    // region filter.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.REGION_ADMIN]}>
      <KitchenTeamPage />
    </ProtectedRoute>
  );
}
