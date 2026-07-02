/**
 * Cleaning team landing - hero + live intel cards + tile shortcuts.
 *
 * CLN-A (task #213, 2026-05-25): expanded from a sparse 2-tile +
 * 2-summary-card page to a manager's-eye-view of the day. Surfaces
 * today's handover pipeline, who's clocked, the dishwasher fleet,
 * tomorrow's load, recent damages and supplies-at-risk - the things
 * the cleaning lead would otherwise have to open 4 tabs to see.
 *
 * Must-fix from the audit:
 *   - OWNER + REGION_ADMIN admitted on ProtectedRoute (was bouncing
 *     the owner persona off their own cleaning page).
 *   - regionFilterId honoured on every region-anchored query.
 *   - captureException wraps the fetch (was console.error swallow).
 *   - withSlug on every internal href (the two tiles were raw paths).
 *   - Drop the `as any` cast on useAuth.
 *   - repair_cost + cost_per_unit finance-gated via canAccessFinance
 *     per feedback_finance_visibility.
 *
 * Intel additions on the audit's "more intelligence" ask:
 *   - Today's handover pipeline: expected / in_progress / complete /
 *     cancelled counts off cleaning_event_handovers, with an overdue
 *     chip when expected_at is in the past + status still 'expected'.
 *   - Today's cleaning jobs pipeline: queued / in_progress / complete
 *     counts off cleaning_jobs.planned_start within today.
 *   - Clocked-now (cleaning_duty_logs.on_duty=true).
 *   - Per-cleaner hours-this-week strip with overtime tint at 38h
 *     amber, 45h rose, derived from cleaning_duty_logs window deltas.
 *   - Tomorrow's expected handovers + tomorrow event count.
 *   - Dishwasher fleet readiness (cleaning_machines.active).
 *   - Damages-this-week cost (finance-gated). Top 3 damage types.
 *   - Supplies below par + out-of-stock chips (red when out-of-stock
 *     count > 0).
 *   - Realtime debounce (1500ms) across cleaning_event_handovers,
 *     cleaning_jobs, cleaning_duty_logs, equipment_damages so the
 *     page redraws when the cleaning portal makes a state change.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DynamicNav } from "@/components/DynamicNav";
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
import {
  Sparkles, ArrowLeft, Users, Clock, ClipboardList,
  AlertTriangle, Wrench, Banknote, Flame, Droplets,
  CheckCircle2, ArrowRight, Package, CalendarDays,
} from "lucide-react";
import { PageWorkbench, PortalHeader, PortalShell, StatTile } from "@/components/portal/ui";
import { damageReporterName, type DamageReporterProfile } from "@/lib/damageReporter";
import { teamBucketsForUser } from "@/lib/teamRoleBuckets";

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface CleaningStats {
  active: number;
  hoursWeek: number;
  jobsToday: number;
  clockedNow: number;
  // CLN-A: today's handover pipeline. Rolls up
  // cleaning_event_handovers.status by expected/in_progress/complete.
  handoversExpected: number;
  handoversInProgress: number;
  handoversComplete: number;
  handoversOverdue: number;
  // CLN-A: today's cleaning_jobs pipeline. queued / in_progress /
  // complete + overdue when planned_end<now and status != complete.
  jobsQueued: number;
  jobsInProgress: number;
  jobsComplete: number;
  jobsOverdue: number;
  // CLN-A: tomorrow's expected handovers.
  tomorrowHandovers: number;
  tomorrowEvents: number;
  // CLN-A: damages this week + R cost (cost finance-gated).
  damagesThisWeek: number;
  damagesCostZar: number;
  topDamageTypes: Array<{ category: string; count: number }>;
  recentDamageReports: Array<{ id: string; type: string; reporter: string; item: string | null }>;
  // CLN-A: supplies below par / out-of-stock.
  suppliesBelowPar: number;
  suppliesOutOfStock: number;
  // CLN-A: dishwasher fleet count.
  machinesActive: number;
  machinesTotal: number;
  // CLN-A: per-cleaner hours-this-week. Top 6.
  topStaffHours: Array<{ id: string; name: string; mins: number }>;
}

const initialStats: CleaningStats = {
  active: 0, hoursWeek: 0, jobsToday: 0, clockedNow: 0,
  handoversExpected: 0, handoversInProgress: 0, handoversComplete: 0, handoversOverdue: 0,
  jobsQueued: 0, jobsInProgress: 0, jobsComplete: 0, jobsOverdue: 0,
  tomorrowHandovers: 0, tomorrowEvents: 0,
  damagesThisWeek: 0, damagesCostZar: 0, topDamageTypes: [],
  recentDamageReports: [],
  suppliesBelowPar: 0, suppliesOutOfStock: 0,
  machinesActive: 0, machinesTotal: 0,
  topStaffHours: [],
};

const CLEANING_SUPPLY_KEYWORDS = [
  "detergent", "cleaner", "soap", "bleach", "sanitiser", "sanitizer",
  "cloth", "glove", "wipe", "mop", "broom", "spray", "polish", "degreaser",
  "cleaning", "disinfect", "scrubb", "rubber", "bin liner", "paper towel",
];

function isCleaningSupply(row: { item_name?: string | null; category?: string | null }): boolean {
  const category = (row.category || "").toLowerCase();
  const name = (row.item_name || "").toLowerCase();
  if (category.includes("clean") || category.includes("consumable")) return true;
  return CLEANING_SUPPLY_KEYWORDS.some((keyword) => name.includes(keyword));
}

function CleaningTeamPage() {
  const { user, profile } = useAuth();
  const { withSlug } = useTenantHref();
  const { regionFilterId } = useRegionFilter();
  const companyId = (profile as { company_id?: string } | null)?.company_id
    || (user as { company_id?: string } | null)?.company_id;
  const userRole = ((profile as { active_role?: UserRole; role?: UserRole } | null)?.active_role
    || (profile as { role?: UserRole } | null)?.role) as UserRole | undefined;
  const canSeeFinance = userRole ? canAccessFinance(userRole) : false;
  const tenantCurrency = useTenantCurrency(companyId);

  const [loading, setLoading] = useState(true);
  // Command-centre audit (2026-07-02): visible error state + Retry.
  // captureException alone left the page rendering zeros on failure.
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CleaningStats>(initialStats);
  const [refreshTick, setRefreshTick] = useState(0);

  // CLN-A: realtime subscription on the tables that drive every
  // card. Debounced 1500ms so bulk inserts (a single delivery
  // spawning a handover + 12 cleaning_jobs) don't thrash the page.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((n) => n + 1), 1500);
    };
    const channel = supabase
      .channel(`teams-cleaning:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_event_handovers", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_jobs", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_duty_logs", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_machines", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_damages", filter: `company_id=eq.${companyId}` }, bump)
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
      setError(null);
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
        const tomorrowStartISO = `${tomorrowISO}T00:00:00`;
        const tomorrowEndISO = `${tomorrowISO}T23:59:59`;

        // Active cleaning team. Includes cleaning_manager, cleaning_staff,
        // active_role, and user_departments aliases so managers and staff
        // remain distinct users while both count toward cleaning capacity.
        let staffQ = supabase.from("profiles")
          .select("id, full_name, role, active_role, is_active")
          .eq("company_id", companyId);
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          staffQ = (staffQ as any).eq("region_id", regionFilterId);
        }

        // Cleaning duty logs for the week. Canonical hours source for
        // the cleaning persona (no kitchen_staff_shifts equivalent).
        // Sum (duty_ended_at - duty_started_at) per user_id and roll
        // up to total + per-staff buckets.
        const dutyWeekQ = supabase.from("cleaning_duty_logs")
          .select("user_id, duty_started_at, duty_ended_at, on_duty")
          .eq("company_id", companyId)
          .gte("duty_started_at", weekStartISO);

        // Clocked-now count.
        const clockedNowQ = supabase.from("cleaning_duty_logs")
          .select("id, user_id")
          .eq("company_id", companyId)
          .eq("on_duty", true);

        // Today's handover pipeline. Pull handovers where
        // expected_at OR in_progress_at OR completed_at is within
        // today; status rollup happens client-side.
        let handoversTodayQ = supabase.from("cleaning_event_handovers")
          .select("id, status, expected_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .or(`expected_at.gte.${todayStartISO},in_progress_at.gte.${todayStartISO},completed_at.gte.${todayStartISO}`)
          .lte("expected_at", todayEndISO);
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          handoversTodayQ = (handoversTodayQ as any).eq("region_id", regionFilterId);
        }

        // Tomorrow's expected handovers (so the lead sees the load
        // they need to staff for tomorrow morning).
        let handoversTomorrowQ = supabase.from("cleaning_event_handovers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("status", "expected")
          .gte("expected_at", tomorrowStartISO)
          .lte("expected_at", tomorrowEndISO);
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          handoversTomorrowQ = (handoversTomorrowQ as any).eq("region_id", regionFilterId);
        }

        // Today's cleaning_jobs pipeline. queued / in_progress /
        // complete counts via planned_start within today + overdue
        // when planned_end<now and status != complete.
        const jobsTodayQ = supabase.from("cleaning_jobs")
          .select("id, status, planned_end")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("planned_start", todayStartISO)
          .lte("planned_start", todayEndISO);

        // Jobs today (orders): events count for the chip row.
        let ordersTodayQ = supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null)
          .eq("event_date", todayISO)
          .not("status", "in", "(cancelled,completed)");
        if (regionFilterId) ordersTodayQ = ordersTodayQ.eq("region_id", regionFilterId);

        // Tomorrow's events (orders) for the tomorrow card.
        let ordersTomorrowQ = supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).is("deleted_at", null)
          .eq("event_date", tomorrowISO)
          .not("status", "in", "(cancelled,completed)");
        if (regionFilterId) ordersTomorrowQ = ordersTomorrowQ.eq("region_id", regionFilterId);

        // Damages this week + R cost. repair_cost is finance-gated
        // at render, but we still pull it so finance roles see the
        // total without a second round trip.
        const damagesQ = (supabase as any).from("equipment_damages")
          .select("id, damage_type, repair_cost, created_at, reported_by, responsible_name, equipment:equipment_id(name)")
          .eq("company_id", companyId)
          .gte("created_at", weekAgoISO);

        // Supplies below par. Keep this aligned with the cleaning
        // supplies portal so the manager page does not count kitchen
        // food stock as a cleaning shortage.
        const suppliesQ = supabase.from("inventory_items")
          .select("item_name, category, current_stock, minimum_stock")
          .eq("company_id", companyId)
          .is("deleted_at", null);

        // Dishwasher / tunnel-washer fleet readiness.
        const machinesQ = supabase.from("cleaning_machines")
          .select("id, active")
          .eq("company_id", companyId);

        const [
          staffRes, dutyWeekRes, clockedNowRes,
          handoversTodayRes, handoversTomorrowRes,
          jobsTodayRes, ordersTodayRes, ordersTomorrowRes,
          damagesRes, suppliesRes, machinesRes,
        ] = await Promise.all([
          staffQ, dutyWeekQ, clockedNowQ,
          handoversTodayQ, handoversTomorrowQ,
          jobsTodayQ, ordersTodayQ, ordersTomorrowQ,
          damagesQ, suppliesQ, machinesQ,
        ]);
        // Command-centre audit (2026-07-02): surface partial Promise.all
        // failures. A single failed query used to read as empty data.
        for (const res of [
          staffRes, dutyWeekRes, clockedNowRes,
          handoversTodayRes, handoversTomorrowRes,
          jobsTodayRes, ordersTodayRes, ordersTomorrowRes,
          damagesRes, suppliesRes, machinesRes,
        ]) {
          if (res.error) throw new Error(res.error.message || "Query failed");
        }

        const staffProfileRows = ((staffRes.data || []) as Array<{
          id: string;
          full_name: string | null;
          role: string | null;
          active_role: string | null;
          is_active?: boolean | null;
        }>).filter((p) => p.is_active !== false);
        const staffProfileIds = staffProfileRows.map((p) => p.id).filter(Boolean);
        const departmentsRes = staffProfileIds.length > 0
          ? await supabase
              .from("user_departments")
              .select("user_id, department, is_primary")
              .in("user_id", staffProfileIds)
          : { data: [] as Array<{ user_id: string | null; department: string | null; is_primary: boolean | null }>, error: null };
        if (departmentsRes.error) throw new Error(departmentsRes.error.message || "Query failed");
        const staffDepartmentRows = departmentsRes.data;
        const activeCleaningTeam = staffProfileRows.filter((p) =>
          teamBucketsForUser(p, staffDepartmentRows || []).has("cleaning"),
        );

        // Build name lookup off the resolved cleaning roster (also used
        // as the allow-list for hours + clocked-now strips).
        const nameById = new Map<string, string>();
        const staffIdSet = new Set<string>();
        for (const p of activeCleaningTeam) {
          nameById.set(p.id, p.full_name || "Cleaner");
          staffIdSet.add(p.id);
        }

        // Walk duty logs for hours-this-week + per-cleaner rollup.
        // Region scope: client-side filter against staffIdSet (cleaning_
        // duty_logs has no region_id column).
        const minsByMember = new Map<string, number>();
        let totalMins = 0;
        for (const r of ((dutyWeekRes.data || []) as Array<{
          user_id: string | null; duty_started_at: string | null;
          duty_ended_at: string | null; on_duty: boolean | null;
        }>)) {
          if (!r.user_id || !r.duty_started_at) continue;
          if (!staffIdSet.has(r.user_id)) continue;
          const start = new Date(r.duty_started_at).getTime();
          const end = r.duty_ended_at
            ? new Date(r.duty_ended_at).getTime()
            : r.on_duty ? Date.now() : start;
          const mins = Math.max(0, Math.round((end - start) / 60_000));
          if (mins <= 0) continue;
          totalMins += mins;
          minsByMember.set(r.user_id, (minsByMember.get(r.user_id) || 0) + mins);
        }
        const topStaffHours = Array.from(minsByMember.entries())
          .map(([id, mins]) => ({ id, name: nameById.get(id) || "Cleaner", mins }))
          .sort((a, b) => b.mins - a.mins)
          .slice(0, 6);

        // Handover pipeline rollup. Statuses: expected | in_progress
        // | complete | cancelled. Overdue = expected + expected_at
        // in the past.
        let handoversExpected = 0, handoversInProgress = 0, handoversComplete = 0, handoversOverdue = 0;
        const nowMs = Date.now();
        for (const h of ((handoversTodayRes.data || []) as Array<{ status: string | null; expected_at: string | null }>)) {
          const s = String(h.status || "").toLowerCase();
          if (s === "expected") {
            handoversExpected += 1;
            if (h.expected_at && new Date(h.expected_at).getTime() < nowMs) handoversOverdue += 1;
          } else if (s === "in_progress") {
            handoversInProgress += 1;
          } else if (s === "complete") {
            handoversComplete += 1;
          }
        }

        // Cleaning jobs pipeline rollup.
        let jobsQueued = 0, jobsInProgress = 0, jobsComplete = 0, jobsOverdue = 0;
        for (const j of ((jobsTodayRes.data || []) as Array<{ status: string | null; planned_end: string | null }>)) {
          const s = String(j.status || "").toLowerCase();
          if (s === "queued") jobsQueued += 1;
          else if (s === "in_progress") jobsInProgress += 1;
          else if (s === "complete") jobsComplete += 1;
          if (s !== "complete" && s !== "cancelled" && j.planned_end) {
            if (new Date(j.planned_end).getTime() < nowMs) jobsOverdue += 1;
          }
        }

        // Damages rollup: count + sum(repair_cost) + top 3 types.
        const damageRows = (damagesRes.data || []) as Array<{
          id: string;
          damage_type: string | null;
          repair_cost: number | null;
          created_at: string | null;
          reported_by: string | null;
          responsible_name: string | null;
          equipment?: { name: string | null } | null;
        }>;
        let damagesCostZar = 0;
        const typeCounts = new Map<string, number>();
        for (const d of damageRows) {
          damagesCostZar += Number(d.repair_cost || 0);
          const k = d.damage_type || "other";
          typeCounts.set(k, (typeCounts.get(k) || 0) + 1);
        }
        const topDamageTypes = Array.from(typeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([category, count]) => ({ category, count }));
        const damageReporterIds = Array.from(new Set(
          damageRows.map((d) => d.reported_by).filter((id): id is string => Boolean(id)),
        ));
        let damageReportersById = new Map<string, DamageReporterProfile>();
        if (damageReporterIds.length > 0) {
          const { data: reporterRows } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, active_role")
            .in("id", damageReporterIds);
          damageReportersById = new Map(
            ((reporterRows || []) as Array<DamageReporterProfile & { id: string }>).map((p) => [p.id, p]),
          );
        }
        const recentDamageReports = [...damageRows]
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .slice(0, 3)
          .map((d) => ({
            id: d.id,
            type: d.damage_type || "damage",
            reporter: damageReporterName({
              reported_by: d.reported_by,
              responsible_name: d.responsible_name,
              reporter: d.reported_by ? damageReportersById.get(d.reported_by) || null : null,
            }),
            item: d.equipment?.name || null,
          }));

        // Supplies rollup.
        let suppliesBelowPar = 0, suppliesOutOfStock = 0;
        for (const i of ((suppliesRes.data || []) as Array<{ item_name: string | null; category: string | null; current_stock: number | null; minimum_stock: number | null }>)) {
          if (!isCleaningSupply(i)) continue;
          const s = Number(i.current_stock || 0);
          const m = Number(i.minimum_stock || 0);
          if (m > 0 && s <= m) suppliesBelowPar += 1;
          if (s <= 0) suppliesOutOfStock += 1;
        }

        // Machines.
        const machineRows = (machinesRes.data || []) as Array<{ active: boolean | null }>;
        const machinesActive = machineRows.filter((m) => m.active).length;
        const machinesTotal = machineRows.length;
        const clockedNow = ((clockedNowRes.data || []) as Array<{ user_id: string | null }>)
          .filter((row) => row.user_id && staffIdSet.has(row.user_id)).length;

        if (!cancelled) {
          setStats({
            active: activeCleaningTeam.length,
            hoursWeek: Math.round(totalMins / 60),
            jobsToday: ordersTodayRes.count ?? 0,
            clockedNow,
            handoversExpected, handoversInProgress, handoversComplete, handoversOverdue,
            jobsQueued, jobsInProgress, jobsComplete, jobsOverdue,
            tomorrowHandovers: handoversTomorrowRes.count ?? 0,
            tomorrowEvents: ordersTomorrowRes.count ?? 0,
            damagesThisWeek: damageRows.length,
            damagesCostZar,
            topDamageTypes,
            recentDamageReports,
            suppliesBelowPar,
            suppliesOutOfStock,
            machinesActive,
            machinesTotal,
            topStaffHours,
          });
        }
      } catch (e) {
        captureException(e, { tags: { route: "/admin/teams/cleaning", step: "load", companyId: companyId || "" } });
        if (!cancelled) setError(e instanceof Error ? e.message : "Check your connection and retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId, regionFilterId, refreshTick]);

  const tiles = [
    { href: "/admin/staff?department=cleaning", icon: Users, label: "Staff directory", sub: "People, rates and availability", bg: "from-slate-50 to-rose-50", iconColor: "text-slate-600" },
    { href: "/admin/cleaning-schedule", icon: ClipboardList, label: "Shift roster", sub: "Staff shifts, duties and handovers", bg: "from-rose-50 from-slate-50", iconColor: "text-rose-600" },
    { href: "/team-portal/cleaning/damage", icon: AlertTriangle, label: "Damages ledger", sub: "Per-event report and history", bg: "from-amber-50 to-orange-50", iconColor: "text-amber-600" },
    { href: "/team-portal/cleaning/supplies", icon: Wrench, label: "Supplies", sub: "Detergent, gloves, cloths", bg: "from-brand-primary/10 to-brand-secondary/10", iconColor: "text-brand-primary" },
  ];

  const totalHandovers = stats.handoversExpected + stats.handoversInProgress + stats.handoversComplete;
  const handoversDonePct = totalHandovers > 0 ? Math.round((stats.handoversComplete / totalHandovers) * 100) : 0;
  const totalJobs = stats.jobsQueued + stats.jobsInProgress + stats.jobsComplete;
  const jobsDonePct = totalJobs > 0 ? Math.round((stats.jobsComplete / totalJobs) * 100) : 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Cleaning team - CateringMS</title></Head>
      <DynamicNav userRole={(userRole || UserRole.ADMIN).toString()} />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Cleaning"
            icon={Sparkles}
            subtitle="Wash-up, kit return and venue strike."
            meta={
              !loading && !error ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {stats.jobsToday} event{stats.jobsToday === 1 ? "" : "s"} today
                  </span>
                  {totalHandovers > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {stats.handoversComplete}/{totalHandovers} handovers done
                    </span>
                  )}
                  {stats.handoversOverdue > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      {stats.handoversOverdue} overdue
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <Link href={withSlug(userRole === UserRole.CLEANING_MANAGER ? "/team-portal/cleaning/dashboard" : "/admin/teams")}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  {userRole === UserRole.CLEANING_MANAGER ? "Cleaning desk" : "All teams"}
                </Button>
              </Link>
            }
          />
          <PageWorkbench />

          {/* Command-centre audit (2026-07-02): visible load-failure
              state with Retry. captureException alone left the cards
              rendering zeros. */}
          {!loading && error && (
            <Card className="mb-4 border-rose-200 bg-rose-50 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 px-4">
                <div className="flex items-center gap-2 text-sm text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Could not load cleaning metrics: {error}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRefreshTick((n) => n + 1)}
                  className="border-rose-300 text-rose-800 hover:bg-rose-100"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Command-centre restructure (2026-07-02): the four core
              aggregates moved from loose Badge chips to a StatTile
              grid; each tile still deep-links to its drill-down.
              Loading renders a skeleton inside the shell so the nav
              never disappears. Conditional alert chips (overdue,
              supplies out, damages cost) stay as a chip row below. */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200/90 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Link href={withSlug("/admin/staff?department=cleaning")} className="block">
                <StatTile
                  label="Active team"
                  value={stats.active}
                  icon={Users}
                  hint="Cleaning-bucket staff"
                />
              </Link>
              <Link href={withSlug("/admin/staff-hours?department=cleaning")} className="block">
                <StatTile
                  label="Hours this week"
                  value={`${stats.hoursWeek}h`}
                  icon={Clock}
                  hint="From duty logs, Monday to now"
                />
              </Link>
              <Link href={withSlug(`/admin/calendar?date=${toLocalISO(new Date())}`)} className="block">
                <StatTile
                  label="Events today"
                  value={stats.jobsToday}
                  icon={ClipboardList}
                  hint={stats.tomorrowEvents > 0 ? `${stats.tomorrowEvents} tomorrow` : "Quiet day tomorrow"}
                />
              </Link>
              <StatTile
                label="Clocked now"
                value={stats.active > 0 ? `${stats.clockedNow} / ${stats.active}` : stats.clockedNow}
                icon={Flame}
                hint={
                  stats.active === 0
                    ? "No cleaning staff yet"
                    : stats.clockedNow === 0
                      ? <span className="text-rose-600">Nobody on duty</span>
                      : stats.clockedNow >= stats.active
                        ? "Full team on duty"
                        : "Partial team on duty"
                }
              />
            </div>
          )}

          {(stats.handoversOverdue > 0 || stats.suppliesOutOfStock > 0 || (canSeeFinance && stats.damagesCostZar > 0)) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {/* CLN-A: overdue handovers chip - high-impact, red when >0. */}
            {stats.handoversOverdue > 0 && (
              <Link href={withSlug("/admin/cleaning-schedule")}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm border-rose-300 text-rose-700 bg-rose-50 cursor-pointer hover:bg-rose-100">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {stats.handoversOverdue} handover{stats.handoversOverdue === 1 ? "" : "s"} overdue
                </Badge>
              </Link>
            )}
            {/* CLN-A: supplies out-of-stock chip. */}
            {stats.suppliesOutOfStock > 0 && (
              <Link href={withSlug("/team-portal/cleaning/supplies")}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm border-rose-300 text-rose-700 bg-rose-50 cursor-pointer hover:bg-rose-100">
                  <Package className="w-3 h-3 mr-1" />
                  {stats.suppliesOutOfStock} supplies out
                </Badge>
              </Link>
            )}
            {/* CLN-A: damages cost this week, finance-gated. */}
            {canSeeFinance && stats.damagesCostZar > 0 && (
              <Badge variant="outline" className="px-3 py-1.5 text-sm border-amber-300 text-amber-700 bg-amber-50 tabular-nums">
                <Banknote className="w-3 h-3 mr-1" />
                {tenantCurrency.format(stats.damagesCostZar)} damages this week
              </Badge>
            )}
          </div>
          )}

          {/* CLN-A: per-cleaner hours-this-week chip strip. Top 6 by
              mins; overtime tint kicks in at 45h. Each chip links to
              /admin/staff-hours filtered to the cleaner. */}
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
                            ? "border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
                            : high
                              ? "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                              : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {/* No exclamation marks in copy (SA English
                            style rule): flag overtime with a plain
                            "OT" suffix instead. */}
                        {m.name} {hrs}h{overtime ? " OT" : ""}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* CLN-A: 4-card intel grid. Today's handovers, today's
              jobs pipeline, tomorrow's load, fleet + damages. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">

            {/* Today's handover pipeline. */}
            <Link href={withSlug("/admin/cleaning-schedule")}>
              <Card className="border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-slate-600" />
                      <p className="font-semibold text-slate-900">Today's handovers</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                  {totalHandovers === 0 && stats.handoversOverdue === 0 ? (
                    <p className="text-sm text-slate-500">No handovers booked today.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="outline" className="border-slate-200 text-slate-700">
                          {stats.handoversExpected} expected
                        </Badge>
                        <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                          {stats.handoversInProgress} in progress
                        </Badge>
                        <Badge variant="outline" className="border-brand-primary/30 text-brand-primary bg-brand-primary/10">
                          {stats.handoversComplete} complete
                        </Badge>
                        {stats.handoversOverdue > 0 && (
                          <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">
                            {stats.handoversOverdue} overdue
                          </Badge>
                        )}
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-primary" style={{ width: `${handoversDonePct}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">{handoversDonePct}% complete</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Today's cleaning_jobs pipeline. */}
            <Link href={withSlug("/admin/cleaning-schedule")}>
              <Card className="border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-sky-600" />
                      <p className="font-semibold text-slate-900">Wash-up jobs today</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                  {totalJobs === 0 && stats.jobsOverdue === 0 ? (
                    <p className="text-sm text-slate-500">No equipment cleaning jobs queued today.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="outline" className="border-slate-200 text-slate-700">
                          {stats.jobsQueued} queued
                        </Badge>
                        <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                          {stats.jobsInProgress} in progress
                        </Badge>
                        <Badge variant="outline" className="border-brand-primary/30 text-brand-primary bg-brand-primary/10">
                          {stats.jobsComplete} complete
                        </Badge>
                        {stats.jobsOverdue > 0 && (
                          <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">
                            {stats.jobsOverdue} overdue
                          </Badge>
                        )}
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500" style={{ width: `${jobsDonePct}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">
                        {jobsDonePct}% complete
                        {stats.machinesTotal > 0 && ` · ${stats.machinesActive}/${stats.machinesTotal} machines online`}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Tomorrow's load. */}
            <Link href={withSlug(`/admin/calendar?date=${toLocalISO(new Date(Date.now() + 24 * 3600 * 1000))}`)}>
              <Card className="border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-5 h-5 text-rose-600" />
                      <p className="font-semibold text-slate-900">Tomorrow's load</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                  {stats.tomorrowEvents === 0 && stats.tomorrowHandovers === 0 ? (
                    <p className="text-sm text-slate-500">Nothing scheduled. Quiet day ahead.</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold tabular-nums">{stats.tomorrowEvents}</span> event{stats.tomorrowEvents === 1 ? "" : "s"} · {" "}
                        <span className="font-semibold tabular-nums">{stats.tomorrowHandovers}</span> handover{stats.tomorrowHandovers === 1 ? "" : "s"} expected
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Staff up early if the dishwasher fleet can't carry the load.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Recent damages + supplies. */}
            <Link href={withSlug("/team-portal/cleaning/damage")}>
              <Card className={`border shadow-sm transition-colors hover:border-slate-300 ${stats.damagesThisWeek > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-5 h-5 ${stats.damagesThisWeek > 0 ? "text-amber-600" : "text-slate-400"}`} />
                      <p className="font-semibold text-slate-900">
                        {stats.damagesThisWeek === 0 ? "No damages this week" : `${stats.damagesThisWeek} damage${stats.damagesThisWeek === 1 ? "" : "s"} this week`}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                  {stats.topDamageTypes.length > 0 && (
                    <p className="text-xs text-slate-600 truncate">
                      Top: {stats.topDamageTypes.map((c) => `${c.category} (${c.count})`).join(", ")}
                    </p>
                  )}
                  {stats.recentDamageReports.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {stats.recentDamageReports.map((d) => (
                        <p key={d.id} className="text-xs text-slate-600 truncate">
                          {d.item ? `${d.item}: ` : ""}{d.type} by {d.reporter}
                        </p>
                      ))}
                    </div>
                  )}
                  {stats.suppliesBelowPar > 0 && (
                    <p className="text-xs text-slate-600 mt-1">
                      <Wrench className="w-3 h-3 inline mr-1 text-amber-600" />
                      {stats.suppliesBelowPar} suppl{stats.suppliesBelowPar === 1 ? "y" : "ies"} below par
                      {stats.suppliesOutOfStock > 0 && ` · ${stats.suppliesOutOfStock} out`}
                    </p>
                  )}
                  {stats.damagesThisWeek === 0 && stats.suppliesBelowPar === 0 && (
                    <p className="text-xs text-slate-500">Clean week. Supplies on par.</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Tile shortcuts. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {tiles.map((t) => (
              <Link key={t.label} href={withSlug(t.href)}>
                <Card className="border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <t.icon className={`w-6 h-6 ${t.iconColor} flex-shrink-0`} />
                      <div>
                        <p className="font-semibold text-slate-900">{t.label}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{t.sub}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <p className="text-xs text-slate-500 mt-6">
            Numbers refresh live as handovers, jobs and damages are logged.{" "}
            <Link href={withSlug("/admin/cleaning-schedule")} className="underline">
              Open the full schedule
            </Link>{" "}
            for the timeline view, or{" "}
            <Link href={withSlug("/team-portal/cleaning/dashboard")} className="underline">
              the team portal
            </Link>{" "}
            for the cleaner's-eye view.
          </p>
        </PortalShell>
      </div>
    </>
  );
}

export default function AdminCleaningTeamPage() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.REGION_ADMIN,
      UserRole.CLEANING_MANAGER,
    ]}>
      <CleaningTeamPage />
    </ProtectedRoute>
  );
}
