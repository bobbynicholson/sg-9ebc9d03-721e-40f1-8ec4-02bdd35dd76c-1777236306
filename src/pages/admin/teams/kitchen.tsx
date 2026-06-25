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
import { DynamicNav } from "@/components/DynamicNav";
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
import { useToast } from "@/hooks/use-toast"; // used by PrepBroadcastDialog below
import { whatsappIntegrationService } from "@/services/whatsappIntegrationService";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ChefHat, ArrowLeft, Users, Clock, ClipboardList, BookOpen, Loader2,
  Banknote, CalendarDays, Wrench, Package, Flame,
  CheckCircle2, ArrowRight, MessageCircle, Printer, FileText,
  Settings as SettingsIcon, ChevronDown, ChevronUp,
} from "lucide-react";
import { KitchenRulesPanel } from "@/components/admin/KitchenRulesPanel";

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
  // KIT-B (task #211, 2026-05-25): equipment handovers waiting on a
  // kitchen receive (to_stage='kitchen' AND received_by_user_id IS
  // NULL). Surfaces gear that the kitchen needs to acknowledge.
  handoversWaiting: number;
  // KIT-B: top 6 kitchen_staff_members by this week's mins. Lets
  // the manager spot who's racking up overtime before payroll
  // surfaces it. Sorted desc by minutes.
  topStaffHours: Array<{ id: string; name: string; mins: number }>;
}

// KIT-B (task #211, 2026-05-25): today's prep schedule snapshot for
// the printable view. One row per task with the data the manager
// needs at the pass: name, start time, duration, station, status.
interface PrepRow {
  id: string;
  menu_item_name: string | null;
  start_at: string | null;
  duration_min: number | null;
  task_type: string | null;
  status: string | null;
  notes: string | null;
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
    handoversWaiting: 0,
    topStaffHours: [],
  });
  // KIT-B (task #211, 2026-05-25): today's prep rows for the
  // print view. Loaded alongside the pipeline rollup.
  const [prepRows, setPrepRows] = useState<PrepRow[]>([]);
  // KIT-B: send-prep-list WhatsApp dialog state.
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  // KIT-B: tick bumped by the realtime channel below; gates the
  // existing load() useEffect so realtime fan-out re-runs the
  // payload without re-mounting.
  const [refreshTick, setRefreshTick] = useState(0);

  // KIT-B (task #211, 2026-05-25): realtime subscription on the
  // tables that drive every card above the fold. Debounced 1500ms
  // so a prep-task bulk insert doesn't thrash the page.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((n) => n + 1), 1500);
    };
    const channel = supabase
      .channel(`teams-kitchen:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_prep_tasks", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_duty_shifts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_staff_shifts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_damages", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_handovers" }, bump)
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
        // KIT-B (task #211, 2026-05-25): include member id so the
        // per-staff hours roll-up can map back to a name without a
        // second query.
        const staffShiftsSelect = regionFilterId
          ? "standard_min, overtime_min, sunday_holiday_min, shift_start, kitchen_staff_members!inner(id, region_id, hourly_rate)"
          : "standard_min, overtime_min, sunday_holiday_min, shift_start, kitchen_staff_members!inner(id, hourly_rate)";
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
        // KIT-B (task #211, 2026-05-25): also fetch menu_item_name +
        // task_type + notes so the print view can render them.
        let prepTodayQ = supabase.from("kitchen_prep_tasks")
          .select("id, status, start_at, duration_min, menu_item_name, task_type, notes")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("start_at", todayStartISO)
          .lte("start_at", todayEndISO)
          .order("start_at", { ascending: true });
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

        // KIT-B (task #211, 2026-05-25): equipment handovers waiting
        // on a kitchen-side receive. The schema models stage hand-
        // offs (kitchen -> cleaning, prep -> service); we count rows
        // headed into the kitchen that haven't been acknowledged.
        const handoverWaitingQ = supabase.from("equipment_handovers")
          .select("id", { count: "exact", head: true })
          .eq("to_stage", "kitchen")
          .is("received_by_user_id", null);

        // KIT-B: per-staff hours-this-week. Fetch the member list to
        // map id -> name; we then walk the shiftsWeekRes payload
        // client-side (already pulled, no extra round trip).
        let kitchenMembersQ = supabase.from("kitchen_staff_members")
          .select("id, full_name")
          .eq("company_id", companyId)
          .is("deleted_at", null);
        if (regionFilterId) kitchenMembersQ = kitchenMembersQ.eq("region_id", regionFilterId);

        const [
          staffRes, shiftsWeekRes, jobsTodayRes, tomorrowJobsRes,
          prepTodayRes, prepTomorrowRes, activeDutyRes, damagesRes,
          lowStockRes, expiringBatchesRes,
          handoverWaitingRes, membersRes,
        ] = await Promise.all([
          staffQ, shiftsWeekQ, jobsTodayQ, tomorrowJobsQ,
          prepTodayQ, prepTomorrowQ, activeDutyQ, damagesQ,
          lowStockQ, expiringBatchesQ,
          handoverWaitingQ, kitchenMembersQ,
        ]);

        // Hours-this-week + wage burn today, walking the same rows.
        // KIT-B (task #211, 2026-05-25): also bucket mins per member
        // so we can render the per-staff overtime chips below.
        let hours = 0;
        let burnToday = 0;
        const todayMs = new Date(todayStartISO).getTime();
        const todayEndMs = new Date(todayEndISO).getTime();
        const minsByMember = new Map<string, number>();
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
          // The shift row's member id needs to come off the joined
          // row; the existing select syntax returns the joined
          // object as kitchen_staff_members. Use whichever key the
          // PostgREST shape gives us.
          const memberId = s.kitchen_staff_members?.id || s.member_id || null;
          if (memberId) minsByMember.set(memberId, (minsByMember.get(memberId) || 0) + mins);
        }

        // KIT-B: build the top-staff-hours sorted desc, slicing 6.
        // We need both the id->name map (from membersRes) and the
        // minsByMember rollup above. Members with zero shifts this
        // week don't appear.
        const nameById = new Map<string, string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const m of (membersRes.data || []) as any[]) {
          nameById.set(m.id, m.full_name || "Unnamed");
        }
        const topStaffHours = Array.from(minsByMember.entries())
          .map(([id, mins]) => ({ id, name: nameById.get(id) || "Member", mins }))
          .sort((a, b) => b.mins - a.mins)
          .slice(0, 6);

        // Prep pipeline rollup. Status from the CHECK constraint:
        // pending / in_progress / done / skipped. We bucket skipped
        // into the done count for the "this isn't going to happen
        // any more" frame.
        // KIT-B (task #211, 2026-05-25): the prep query now includes
        // the print-view fields too (id, menu_item_name, task_type,
        // notes). Keep the local var typed strictly enough to walk
        // for the rollup; we pass the full payload to setPrepRows
        // below.
        const prepRowsLocal = (prepTodayRes.data || []) as PrepRow[];
        let prepPending = 0, prepInProgress = 0, prepDone = 0, prepOverdue = 0;
        const nowMs = Date.now();
        for (const r of prepRowsLocal) {
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
            handoversWaiting: handoverWaitingRes.count ?? 0,
            topStaffHours,
          });
          setPrepRows(prepRowsLocal);
        }
      } catch (e) {
        captureException(e, { tags: { route: "/admin/teams/kitchen", step: "load", companyId: companyId || "" } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId, regionFilterId, refreshTick]);

  const tiles = [
    { href: "/admin/kitchen-staff", icon: Users, label: "Kitchen staff", sub: "Roster, rates, departments", bg: "from-amber-50 to-orange-50", iconColor: "text-amber-600" },
    // Phase 3 admin sweep note: /admin/kitchen-duty-tracking redirects
    // to the kitchen portal; /admin/kitchen-schedule is the live admin
    // view with late/missed badges, so we route there directly.
    { href: "/admin/kitchen-schedule", icon: ClipboardList, label: "Schedule + clock-ins", sub: "Weekly roster, late/missed badges", bg: "from-rose-50 to-pink-50", iconColor: "text-rose-600" },
    { href: "/admin/inventory-recipes", icon: BookOpen, label: "Recipes & inventory", sub: "Link recipes to stock", bg: "from-brand-primary/10 to-brand-secondary/10", iconColor: "text-brand-primary" },
  ];

  const totalPrep = stats.prepPending + stats.prepInProgress + stats.prepDone;
  const prepDonePct = totalPrep > 0 ? Math.round((stats.prepDone / totalPrep) * 100) : 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Kitchen team - CateringMS</title></Head>
      <DynamicNav userRole={(userRole || UserRole.ADMIN).toString()} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-full">

          {/* KIT-B (task #211, 2026-05-25): top toolbar - All teams
              back link + Print prep schedule + Send prep list to
              clocked-in. Hidden in print via no-print. */}
          <div className="flex items-center justify-between gap-3 mb-3 no-print flex-wrap">
            <Link
              href={withSlug(userRole === UserRole.KITCHEN_MANAGER ? "/team-portal/kitchen/today" : "/admin/teams")}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" /> {userRole === UserRole.KITCHEN_MANAGER ? "Kitchen today" : "All teams"}
            </Link>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBroadcastOpen(true)}
                className="gap-1.5 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                title="Send today's prep list to every kitchen staff member with a phone on file."
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Send prep list
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5"
                title="Print-friendly view of today's prep schedule."
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </Button>
            </div>
          </div>

          <div className="relative h-[200px] rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-brand-primary to-brand-secondary">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
            <div className="relative h-full flex items-end p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <ChefHat className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold text-white">Kitchen</h1>
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
            {/* KIT-A: wage burn today, finance-gated. */}
            {canSeeFinance && stats.burnTodayZar > 0 && (
              <Badge variant="outline" className="px-3 py-1.5 text-sm border-brand-primary/30 text-brand-primary bg-brand-primary/10 tabular-nums">
                <Banknote className="w-3 h-3 mr-1" />
                {tenantCurrency.format(stats.burnTodayZar)} burn today
              </Badge>
            )}
            {/* KIT-B (task #211, 2026-05-25): handover queue chip.
                Equipment handovers waiting on a kitchen-side receive
                are usually small but high-impact - a missed handover
                means gear didn't move stations. */}
            {stats.handoversWaiting > 0 && (
              <Link href={withSlug("/admin/equipment?tab=handovers")}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm border-violet-300 text-violet-700 bg-violet-50 cursor-pointer hover:bg-violet-100">
                  <FileText className="w-3 h-3 mr-1" />
                  {stats.handoversWaiting} handover{stats.handoversWaiting === 1 ? "" : "s"} awaiting receive
                </Badge>
              </Link>
            )}
          </div>

          {/* KIT-B (task #211, 2026-05-25): per-staff hours-this-week
              chip strip. Top 6 by mins; overtime tint kicks in at 45h.
              Each chip links into /admin/staff-hours filtered to the
              staffer so the manager can drill into the breakdown.
              Hidden when nobody clocked any hours this week. */}
          {stats.topStaffHours.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5">
                Hours this week
              </p>
              <div className="flex flex-wrap gap-2">
                {stats.topStaffHours.map((m) => {
                  const hrs = Math.round((m.mins / 60) * 10) / 10;
                  const overtime = hrs > 45;
                  const high = hrs > 38;
                  return (
                    <Link key={m.id} href={withSlug(`/admin/staff-hours?staff=${m.id}`)}>
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
                        {m.name} · {hrs}h
                        {overtime && <span className="ml-1 text-rose-600">!</span>}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

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
                              className={`h-full rounded-full ${prepDonePct >= 75 ? "bg-brand-primary" : prepDonePct >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                              style={{ width: `${prepDonePct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1.5">
                            {stats.prepInProgress > 0 && <span className="text-amber-700 font-medium">{stats.prepInProgress} in progress</span>}
                            {stats.prepInProgress > 0 && stats.prepPending > 0 && <span className="text-slate-400 mx-1">·</span>}
                            {stats.prepPending > 0 && <span>{stats.prepPending} not started</span>}
                            {stats.prepInProgress === 0 && stats.prepPending === 0 && (
                              <span className="inline-flex items-center gap-1 text-brand-primary"><CheckCircle2 className="w-3 h-3" /> All caught up</span>
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
          <p className="text-xs text-slate-500 text-center mt-6 no-print">
            Detailed live ops live at <Link href={withSlug("/admin/tracking")} className="text-amber-700 hover:underline">/admin/tracking</Link> /
            wage reports at <Link href={withSlug("/admin/wages")} className="text-amber-700 hover:underline">/admin/wages</Link> /
            equipment handovers live in the cleaning portal.
          </p>
          {/* TIGHTEN I.30 (admin.md section 7 follow-up #5):
              Kitchen rules co-located with the kitchen team.
              Kitchen rules are operational policy (prep timing,
              BCEA shift thresholds, dietary alerts) - they belong
              alongside team management, not buried in Settings.
              The standalone /admin/kitchen-settings page still
              exists (Settings nav muscle memory + deep-links);
              both entry points mount the same KitchenRulesPanel
              and write to companies.kitchen_settings. */}
          <KitchenRulesSection />

          {/* KIT-B (task #211, 2026-05-25): print-only view of today's
              prep schedule. The screen view stays hidden via CSS
              below; window.print() renders just this block. Format
              is intentionally boring - black text on white paper,
              one row per task, big legible columns. */}
          <div className="hidden print:block mt-6">
            <h2 className="text-2xl font-bold mb-1">Kitchen prep schedule</h2>
            <p className="text-sm text-slate-600 mb-4">
              {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {" · "}
              {prepRows.length} task{prepRows.length === 1 ? "" : "s"}
            </p>
            {prepRows.length === 0 ? (
              <p className="text-sm">No prep tasks scheduled for today.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2 pr-3 font-semibold">Time</th>
                    <th className="text-left py-2 pr-3 font-semibold">Task</th>
                    <th className="text-left py-2 pr-3 font-semibold">Item</th>
                    <th className="text-left py-2 pr-3 font-semibold">Mins</th>
                    <th className="text-left py-2 pr-3 font-semibold">Status</th>
                    <th className="text-left py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {prepRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-200 align-top">
                      <td className="py-2 pr-3 tabular-nums">
                        {r.start_at
                          ? new Date(r.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })
                          : "-"}
                      </td>
                      <td className="py-2 pr-3 capitalize">{r.task_type || "prep"}</td>
                      <td className="py-2 pr-3 font-medium">{r.menu_item_name || "Unnamed"}</td>
                      <td className="py-2 pr-3 tabular-nums">{r.duration_min || "-"}</td>
                      <td className="py-2 pr-3 capitalize">{(r.status || "pending").replace("_", " ")}</td>
                      <td className="py-2 text-xs">{r.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* KIT-B: send-prep-list-to-clocked-in WhatsApp dialog. Fans
          one queue insert per kitchen_staff_members with a phone on
          file. Uses the queue from #99; drain cron sends within 5
          min. */}
      <PrepBroadcastDialog
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        companyId={companyId || ""}
        regionFilterId={regionFilterId || null}
        prepRows={prepRows}
      />

      {/* KIT-B: print stylesheet. Hides every .no-print element +
          AdminNav + sidebar, so window.print() renders just the
          prep schedule. */}
      <style jsx global>{`
        @media print {
          .no-print,
          nav,
          aside,
          .lg\\:pl-72,
          .lg\\:pl-80 { padding-left: 0 !important; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .min-h-screen { min-height: auto !important; }
        }
      `}</style>
    </>
  );
}

// TIGHTEN I.30: collapsible section that mounts KitchenRulesPanel
// inside the Kitchen team landing. Default collapsed so the kitchen-
// manager-first audience doesn't scroll past a 600px form to reach
// the prep + intel cards. Expand on demand.
function KitchenRulesSection() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-slate-200 mt-6 no-print">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Kitchen rules</p>
              <p className="text-xs text-slate-500">
                Prep timing, BCEA shift thresholds, dietary alerts. Kitchen manager and admin access.
              </p>
            </div>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </button>
        {open && (
          <div className="border-t border-slate-200 p-4 bg-slate-50/40">
            <KitchenRulesPanel
              contextNote="Same form as /admin/kitchen-settings. Edits land on companies.kitchen_settings either way."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// KIT-B (task #211, 2026-05-25): WhatsApp broadcast for today's
// prep list. Mirrors the per-team dialog on /admin/teams with
// extra kitchen-shaped affordances: defaults the message body to
// the day's task summary so the manager doesn't start from blank.
function PrepBroadcastDialog({
  open, onClose, companyId, regionFilterId, prepRows,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  regionFilterId: string | null;
  prepRows: PrepRow[];
}) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Array<{ id: string; name: string | null; phone: string }>>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !companyId) { setRecipients([]); return; }
    let cancelled = false;
    setLoadingRoster(true);

    // Default body: a summary of today's prep so the recipient
    // sees what's expected of them. Operator can edit before send.
    const today = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
    const lines = prepRows.slice(0, 8).map((r) => {
      const t = r.start_at ? new Date(r.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "-";
      return `- ${t}  ${r.menu_item_name || "Unnamed"} (${r.duration_min || "?"}m)`;
    });
    const more = prepRows.length > 8 ? `\n+ ${prepRows.length - 8} more on the full sheet` : "";
    const summary = prepRows.length === 0
      ? `Hi team,\n\nNo prep tasks scheduled for ${today}. Standby for ad-hoc work.\n\nThanks.`
      : `Hi team,\n\n${today} prep:\n${lines.join("\n")}${more}\n\nFull sheet on the kitchen board. Shout if anything looks off.\n\nThanks.`;
    setBody(summary);

    (async () => {
      let q = supabase.from("kitchen_staff_members")
        .select("id, full_name, phone")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .not("phone", "is", null);
      if (regionFilterId) q = q.eq("region_id", regionFilterId);
      const { data } = await q;
      if (cancelled) return;
      const rcpts = ((data || []) as Array<{ id: string; full_name: string | null; phone: string | null }>)
        .filter((m) => !!m.phone)
        .map((m) => ({ id: m.id, name: m.full_name, phone: m.phone as string }));
      setRecipients(rcpts);
      setLoadingRoster(false);
    })();
    return () => { cancelled = true; };
  }, [open, companyId, regionFilterId, prepRows]);

  const handleSend = async () => {
    if (!companyId) return;
    const trimmed = body.trim();
    if (!trimmed) {
      toast({ title: "Message is empty", variant: "destructive" });
      return;
    }
    if (recipients.length === 0) {
      toast({ title: "No kitchen staff with a phone on file", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const stamp = Date.now().toString(36);
      const results = await Promise.all(
        recipients.map((r) =>
          whatsappIntegrationService.enqueueWhatsAppMessage({
            companyId,
            recipientPhone: r.phone,
            recipientName: r.name,
            body: trimmed,
            relatedEntityType: "kitchen_prep_broadcast",
            relatedEntityId: null,
            dedupKey: `kitchen-prep:${stamp}:${r.id}`,
          }),
        ),
      );
      const queued = results.filter((id) => !!id).length;
      const refused = results.length - queued;
      toast({
        title: `Queued ${queued} message${queued === 1 ? "" : "s"}`,
        description: refused > 0
          ? `${refused} refused by the comms guard. Drain cron sends the rest within 5 min.`
          : "Drain cron sends them within 5 min.",
      });
      onClose();
    } catch (err) {
      captureException(err, { tags: { surface: "admin/teams/kitchen", area: "prep-broadcast", companyId } });
      toast({
        title: "Could not queue messages",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-brand-primary" />
            Send prep list
          </DialogTitle>
          <DialogDescription>
            Goes to every kitchen staff member with a phone on file. Drain cron sends within 5 minutes. We've pre-filled the message with today's prep summary - edit before sending.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {loadingRoster ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading roster...</span>
            ) : recipients.length === 0 ? (
              <span className="text-amber-700">No kitchen staff with a phone on file. Add phone numbers on /admin/kitchen-staff.</span>
            ) : (
              <>
                <span className="font-medium">{recipients.length} recipient{recipients.length === 1 ? "" : "s"}:</span>{" "}
                <span className="text-slate-600">{recipients.slice(0, 4).map((r) => r.name || r.phone).join(", ")}{recipients.length > 4 ? ` +${recipients.length - 4} more` : ""}</span>
              </>
            )}
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="text-sm font-mono"
          />
          <p className="text-[11px] text-slate-500">
            WhatsApp Business templates required for first contact. If a recipient hasn't messaged you in 24h, Meta may drop the free-form text - the queue logs the failure with a clear reason.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={sending}>Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSend}
            disabled={sending || loadingRoster || recipients.length === 0 || !body.trim()}
            className="bg-brand-primary hover:bg-brand-primary/90 gap-1.5"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            {sending ? "Queueing..." : `Send to ${recipients.length || 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminKitchenTeamPage() {
  return (
    // KIT-A (task #210, 2026-05-25): admit OWNER + REGION_ADMIN.
    // Pre-fix the owner persona was 403'd on their own kitchen page
    // despite seeing finance everywhere else, and a regional admin
    // couldn't open this even though the page now respects their
    // region filter.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.REGION_ADMIN, UserRole.KITCHEN_MANAGER]}>
      <KitchenTeamPage />
    </ProtectedRoute>
  );
}
