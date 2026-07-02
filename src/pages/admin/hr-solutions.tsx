/**
 * HR Solutions hub - the people-side landing page.
 *
 * HRS-B (task #214, 2026-05-25): expanded from a static 8-tile
 * marketing grid to a real HR command centre. Surfaces total active
 * staff, hours by department this week, clocked-now headcount,
 * pending invitations, and wage burn (finance-gated) so the admin
 * doesn't have to bounce through staff-hours + users + wages to
 * answer "how is my team this week?"
 *
 * Must-fix from the audit (docs/audits/admin-hr-solutions-audit-2026-05-19.md):
 *   - HRS-1 (P1): duplicate COMPANY_ADMIN typo on ProtectedRoute -
 *     fixed in HRS-A. Now also admitting OWNER + REGION_ADMIN so the
 *     owner persona stops getting bounced off their own HR hub.
 *   - HRS-2 (P3): dynamic Icon assignment without type guard -
 *     now uses lucide components directly, no indirection.
 *   - HRS-3 (P3): Coming Soon tiles wrapped a dead `<Link href="#">` -
 *     now render a plain disabled Button with no anchor.
 *   - HRS-4 (P2): ChatBot received hardcoded `userRole="admin"` -
 *     now reads from the auth profile.
 *   - HRS-5 (P3): feature links not validated - the three "Coming
 *     Soon" tiles that actually have a live surface (Payroll, Per-
 *     formance, Recruitment) are now wired and marked active.
 *
 * Intel additions on the audit's "more intelligence" ask:
 *   - Top chip row: total active staff, hours this week (sum across
 *     kitchen + cleaning + driver shifts), clocked-now, pending
 *     invites, wage burn this week (finance-gated).
 *   - Department breakdown card: kitchen / cleaning / drivers / other
 *     active counts with per-department links into the respective
 *     team landing.
 *   - Hours by department card: same buckets, hours instead of head-
 *     count, sourced from each department's canonical shift table.
 *   - Pending invitations card: count + top 3 with email + role.
 *   - withSlug on every internal href (was raw).
 *   - captureException on load failure (was console.error or nothing).
 *   - Realtime debounce (2000ms) on profiles + staff_invitations so
 *     a new invite shows up live.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { formatZAR } from "@/lib/formatters";
import { canAccessFinance } from "@/lib/authGuards";
import { captureException } from "@/lib/observability";
import { ChatBot } from "@/components/ChatBot";
import { teamBucketsForUser } from "@/lib/teamRoleBuckets";
import {
  Users, Clock, Calendar, TrendingUp, Award, FileText,
  Banknote, UserPlus, Loader2, ChefHat, Sparkles, Truck,
  Flame, MailPlus, ArrowRight,
} from "lucide-react";

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface DeptCount { kitchen: number; cleaning: number; drivers: number; other: number }

interface HRStats {
  staffTotal: number;
  hoursWeek: number;
  clockedNow: number;
  pendingInvites: number;
  wageBurnWeekZar: number;
  byDept: DeptCount;
  hoursByDept: DeptCount;
  recentInvites: Array<{ id: string; email: string | null; full_name: string | null; role: string | null; created_at: string }>;
}

const initialStats: HRStats = {
  staffTotal: 0, hoursWeek: 0, clockedNow: 0, pendingInvites: 0,
  wageBurnWeekZar: 0,
  byDept: { kitchen: 0, cleaning: 0, drivers: 0, other: 0 },
  hoursByDept: { kitchen: 0, cleaning: 0, drivers: 0, other: 0 },
  recentInvites: [],
};

function AdminHRSolutions() {
  const { user, profile } = useAuth();
  const { withSlug } = useTenantHref();
  const { regionFilterId } = useRegionFilter();
  const companyId = (profile as { company_id?: string } | null)?.company_id
    || (user as { user_metadata?: { company_id?: string } } | null)?.user_metadata?.company_id;
  const userRole = ((profile as { active_role?: UserRole; role?: UserRole } | null)?.active_role
    || (profile as { role?: UserRole } | null)?.role) as UserRole | undefined;
  const canSeeFinance = userRole ? canAccessFinance(userRole) : false;
  const tenantCurrency = useTenantCurrency(companyId);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HRStats>(initialStats);
  const [refreshTick, setRefreshTick] = useState(0);
  // Surfaced load failure. captureException alone left the page
  // showing zeros that read as "no staff", not "load failed".
  const [loadError, setLoadError] = useState<string | null>(null);

  // HRS-B: realtime debounce on profiles + invitations. 2s so an
  // admin batch-inviting 8 staffers triggers one redraw, not eight.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((n) => n + 1), 2000);
    };
    const channel = supabase
      .channel(`hr-solutions:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_invitations", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_staff_shifts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_duty_shifts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_duty_logs", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_shifts", filter: `company_id=eq.${companyId}` }, bump)
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
      setLoadError(null);
      try {
        const weekStartISO = startOfWeek().toISOString();
        const todayISO = new Date().toISOString();
        void todayISO;

        // Staff by role + region scope. Pulls the full role list so
        // we can bucket into kitchen / cleaning / drivers / other.
        let staffQ = supabase.from("profiles")
          .select("id, role, active_role, is_active")
          .eq("company_id", companyId);
        if (regionFilterId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          staffQ = (staffQ as any).eq("region_id", regionFilterId);
        }

        // Pending invitations. staff_invitations.status='pending'.
        const invitesQ = supabase.from("staff_invitations")
          .select("id, email, full_name, role, created_at")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5);

        // Kitchen shifts this week. canonical wage source.
        let kitchenShiftsQ = supabase.from("kitchen_staff_shifts")
          .select("standard_min, overtime_min, sunday_holiday_min, shift_start, kitchen_staff_members!inner(region_id, hourly_rate)")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("shift_start", weekStartISO);
        if (regionFilterId) {
          kitchenShiftsQ = kitchenShiftsQ.eq("kitchen_staff_members.region_id", regionFilterId);
        }

        // Cleaning duty logs this week. (Mins via duty_started_at ->
        // duty_ended_at; no rate column on this table - wage burn
        // for cleaning is rolled into the kitchen shifts model for
        // any cross-trained staff. Pure cleaners don't currently
        // have a hourly_rate column wired into a payroll table.)
        const cleaningDutyQ = supabase.from("cleaning_duty_logs")
          .select("user_id, duty_started_at, duty_ended_at, on_duty")
          .eq("company_id", companyId)
          .gte("duty_started_at", weekStartISO);

        // Driver shifts this week. hours_worked is generated.
        const driverShiftsQ = supabase.from("driver_shifts")
          .select("driver_id, hours_worked, shift_date, actual_end")
          .eq("company_id", companyId)
          .gte("shift_date", new Date(startOfWeek()).toISOString().slice(0, 10));

        // Kitchen duty shifts is_active=true (clocked-now bucket A).
        const kitchenClockedQ = supabase.from("kitchen_duty_shifts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true);

        // Cleaning duty on_duty=true (clocked-now bucket B).
        const cleaningClockedQ = supabase.from("cleaning_duty_logs")
          .select("id, user_id")
          .eq("company_id", companyId)
          .eq("on_duty", true);

        // Driver shifts still open (clocked-now bucket C). actual_end
        // IS NULL on an in-progress driver_shifts row.
        const driverClockedQ = supabase.from("driver_shifts")
          .select("id, driver_id")
          .eq("company_id", companyId)
          .is("actual_end", null);

        const [
          staffRes, invitesRes,
          kitchenShiftsRes, cleaningDutyRes, driverShiftsRes,
          kitchenClockedRes, cleaningClockedRes, driverClockedRes,
        ] = await Promise.all([
          staffQ, invitesQ,
          kitchenShiftsQ, cleaningDutyQ, driverShiftsQ,
          kitchenClockedQ, cleaningClockedQ, driverClockedQ,
        ]);

        // Supabase queries resolve with {data, error} instead of
        // throwing, so the catch below never saw a failed leg and
        // the page silently rendered zeros. Promote the first
        // failure to a real error.
        const firstError = [
          staffRes.error, invitesRes.error,
          kitchenShiftsRes.error, cleaningDutyRes.error, driverShiftsRes.error,
          kitchenClockedRes.error, cleaningClockedRes.error, driverClockedRes.error,
        ].find(Boolean);
        if (firstError) throw firstError;

        const activeStaffRows = ((staffRes.data || []) as Array<{
          id: string;
          role: string | null;
          active_role: string | null;
          is_active?: boolean | null;
        }>).filter((p) => p.is_active !== false);
        const staffProfileIds = activeStaffRows.map((p) => p.id).filter(Boolean);
        const deptRes = staffProfileIds.length > 0
          ? await supabase
              .from("user_departments")
              .select("user_id, department, is_primary")
              .in("user_id", staffProfileIds)
          : { data: [] as Array<{ user_id: string | null; department: string | null; is_primary: boolean | null }>, error: null };
        // A failed departments read silently bucketed everyone into
        // "other" pre-audit; fail loudly instead.
        if (deptRes.error) throw deptRes.error;
        const staffDepartmentRows = deptRes.data;

        // Bucket staff by resolved access. Managers and staff stay
        // distinct role labels, but both land in their department.
        const byDept: DeptCount = { kitchen: 0, cleaning: 0, drivers: 0, other: 0 };
        const staffIdByRole: Record<string, Set<string>> = { kitchen: new Set(), cleaning: new Set(), drivers: new Set(), other: new Set() };
        for (const p of activeStaffRows) {
          const buckets = teamBucketsForUser(p, staffDepartmentRows || []);
          let operational = false;
          if (buckets.has("kitchen")) { byDept.kitchen += 1; staffIdByRole.kitchen.add(p.id); operational = true; }
          if (buckets.has("cleaning")) { byDept.cleaning += 1; staffIdByRole.cleaning.add(p.id); operational = true; }
          if (buckets.has("drivers")) { byDept.drivers += 1; staffIdByRole.drivers.add(p.id); operational = true; }
          if (!operational) { byDept.other += 1; staffIdByRole.other.add(p.id); }
        }
        const staffTotal = activeStaffRows.length;

        // Hours by department.
        const hoursByDept: DeptCount = { kitchen: 0, cleaning: 0, drivers: 0, other: 0 };
        // Accumulate the wage estimate in integer cents so per-shift
        // float products can't drift the weekly figure.
        let wageBurnWeekCents = 0;
        // Kitchen mins + wage rate.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of ((kitchenShiftsRes.data || []) as any[])) {
          const mins = Number(s.standard_min || 0) + Number(s.overtime_min || 0) + Number(s.sunday_holiday_min || 0);
          if (mins <= 0) continue;
          hoursByDept.kitchen += mins / 60;
          const rate = Number(s.kitchen_staff_members?.hourly_rate || 0);
          if (rate > 0) wageBurnWeekCents += Math.round((mins / 60) * rate * 100);
        }
        // Cleaning mins via duty window. Region filter via staffIdByRole.cleaning.
        for (const r of ((cleaningDutyRes.data || []) as Array<{
          user_id: string | null; duty_started_at: string | null;
          duty_ended_at: string | null; on_duty: boolean | null;
        }>)) {
          if (!r.user_id || !r.duty_started_at) continue;
          if (!staffIdByRole.cleaning.has(r.user_id)) continue;
          const start = new Date(r.duty_started_at).getTime();
          const end = r.duty_ended_at
            ? new Date(r.duty_ended_at).getTime()
            : r.on_duty ? Date.now() : start;
          hoursByDept.cleaning += Math.max(0, (end - start) / 3_600_000);
        }
        // Driver hours via hours_worked (generated). Open shifts
        // (actual_end IS NULL) contribute nothing yet.
        for (const r of ((driverShiftsRes.data || []) as Array<{ driver_id: string | null; hours_worked: number | null }>)) {
          if (!r.driver_id || !staffIdByRole.drivers.has(r.driver_id)) continue;
          if (r.hours_worked) hoursByDept.drivers += Number(r.hours_worked);
        }
        hoursByDept.kitchen = Math.round(hoursByDept.kitchen);
        hoursByDept.cleaning = Math.round(hoursByDept.cleaning);
        hoursByDept.drivers = Math.round(hoursByDept.drivers);

        const hoursWeek = hoursByDept.kitchen + hoursByDept.cleaning + hoursByDept.drivers;
        const cleaningClocked = ((cleaningClockedRes.data || []) as Array<{ user_id: string | null }>)
          .filter((row) => row.user_id && staffIdByRole.cleaning.has(row.user_id)).length;
        const driverClocked = ((driverClockedRes.data || []) as Array<{ driver_id: string | null }>)
          .filter((row) => row.driver_id && staffIdByRole.drivers.has(row.driver_id)).length;
        const clockedNow = (kitchenClockedRes.count ?? 0) + cleaningClocked + driverClocked;

        // staff_invitations.email + full_name are added by the
        // USR-C migration (20260524230000) but the generated types
        // haven't caught up yet. Cast through unknown until the
        // next types regen.
        const invitesRows = (invitesRes.data || []) as unknown as Array<{
          id: string; email: string | null; full_name: string | null;
          role: string | null; created_at: string;
        }>;

        if (!cancelled) {
          setStats({
            staffTotal,
            hoursWeek,
            clockedNow,
            pendingInvites: invitesRows.length,
            wageBurnWeekZar: wageBurnWeekCents / 100,
            byDept,
            hoursByDept,
            recentInvites: invitesRows.slice(0, 3),
          });
        }
      } catch (e) {
        captureException(e, { tags: { route: "/admin/hr-solutions", step: "load", companyId: companyId || "" } });
        if (!cancelled) {
          setLoadError((e as { message?: string })?.message || "Couldn't load the HR overview.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [companyId, regionFilterId, refreshTick]);

  // Feature tiles. HRS-5: Payroll + Performance + Recruitment flipped
  // from coming-soon to active since we now ship the surfaces.
  const features: Array<{
    id: string; title: string; description: string;
    Icon: typeof Users; link: string; status: "active" | "coming-soon";
    chip?: string | null;
  }> = [
    {
      id: "time-tracking",
      title: "Time & Attendance",
      description: "Clock-in / clock-out, hours by staffer + overtime alerts.",
      Icon: Clock,
      link: "/admin/staff-hours",
      status: "active",
      chip: loading ? null : `${stats.hoursWeek}h this week`,
    },
    {
      id: "scheduling",
      title: "Staff Scheduling",
      description: "Roster against events on the calendar.",
      Icon: Calendar,
      link: "/admin/calendar",
      status: "active",
      chip: null,
    },
    {
      id: "user-management",
      title: "User Management",
      description: "Accounts, departments, role assignment + audit log.",
      Icon: Users,
      link: "/admin/users",
      status: "active",
      chip: loading ? null : `${stats.staffTotal} active`,
    },
    {
      id: "wages",
      title: "Wages & Payroll",
      description: "Hourly rates, week tally, kitchen + drivers + extras.",
      Icon: Banknote,
      link: "/admin/wages",
      status: "active",
      chip: canSeeFinance && !loading && stats.wageBurnWeekZar > 0
        ? `${formatZAR(stats.wageBurnWeekZar, { currency: tenantCurrency.code })} this week`
        : null,
    },
    {
      id: "performance",
      title: "Performance Tracking",
      description: "Per-staffer hours, overtime, productivity signals.",
      Icon: TrendingUp,
      link: "/admin/staff-hours?view=performance",
      status: "active",
      chip: null,
    },
    {
      id: "recruitment",
      title: "Recruitment & Invites",
      description: "Invite new staff, track pending acceptances.",
      Icon: UserPlus,
      link: "/admin/users?tab=invitations",
      status: "active",
      chip: !loading && stats.pendingInvites > 0
        ? `${stats.pendingInvites} pending`
        : null,
    },
    {
      id: "training",
      title: "Setup & Onboarding",
      description: "Business setup wizard, email, clients and import data.",
      Icon: Award,
      link: "/admin/onboarding",
      status: "active",
      chip: "Wizard",
    },
    {
      id: "documents",
      title: "Document Management",
      description: "Contracts, payslips, ID copies stored per-staffer.",
      Icon: FileText,
      link: "#",
      status: "coming-soon",
    },
  ];

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>HR solutions - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title={<span className="flex items-center gap-2">HR <InfoTooltip className="text-white/70 hover:text-white" content={"One landing for every staff-related tool. Active tiles take you straight to the feature; chips show this week's live numbers."} /></span>}
            icon={Users}
            subtitle="Hours, wages, accounts and invites at a glance. Drill into a card for the full surface."
            meta={
              /* HRS-B chip row, relocated into the hero band. Same
                 live numbers, links preserved. */
              <>
                <Link href={withSlug("/admin/users")} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                  {stats.staffTotal} active
                </Link>
                <Link href={withSlug("/admin/staff-hours")} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20">
                  <Clock className="w-3 h-3" />
                  {stats.hoursWeek}h this week
                </Link>
                {stats.staffTotal > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${stats.clockedNow > 0 ? "bg-emerald-400" : "bg-slate-500"}`} />
                    <Flame className="w-3 h-3" />
                    {stats.clockedNow} clocked now
                  </span>
                )}
                {stats.pendingInvites > 0 && (
                  <Link href={withSlug("/admin/users?tab=invitations")} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <MailPlus className="w-3 h-3" />
                    {stats.pendingInvites} pending invite{stats.pendingInvites === 1 ? "" : "s"}
                  </Link>
                )}
                {canSeeFinance && stats.wageBurnWeekZar > 0 && (
                  <Link href={withSlug("/admin/wages")} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white hover:bg-white/20">
                    <Banknote className="w-3 h-3" />
                    {formatZAR(stats.wageBurnWeekZar, { currency: tenantCurrency.code })} burn this week
                  </Link>
                )}
              </>
            }
          />
          <PageWorkbench />

          {loadError && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-rose-900">Couldn&apos;t load the HR overview</p>
              <p className="mt-1 text-sm text-slate-600">{loadError}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setRefreshTick((n) => n + 1)} disabled={loading}>
                Retry
              </Button>
            </div>
          )}

          {/* HRS-B: intel grid - department breakdown + hours + invites. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6">

            {/* Staff by department. */}
            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-blue-600" />
                  <p className="font-semibold text-slate-900">Staff by department</p>
                </div>
                <ul className="text-sm space-y-1.5">
                  <li className="flex items-center justify-between">
                    <Link href={withSlug("/admin/teams/kitchen")} className="flex items-center gap-1.5 hover:underline">
                      <ChefHat className="w-3.5 h-3.5 text-amber-600" />
                      <span>Kitchen</span>
                    </Link>
                    <span className="tabular-nums text-slate-700">{stats.byDept.kitchen}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <Link href={withSlug("/admin/teams/cleaning")} className="flex items-center gap-1.5 hover:underline">
                      <Sparkles className="w-3.5 h-3.5 text-slate-600" />
                      <span>Cleaning</span>
                    </Link>
                    <span className="tabular-nums text-slate-700">{stats.byDept.cleaning}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <Link href={withSlug("/admin/teams/drivers")} className="flex items-center gap-1.5 hover:underline">
                      <Truck className="w-3.5 h-3.5 text-sky-600" />
                      <span>Drivers</span>
                    </Link>
                    <span className="tabular-nums text-slate-700">{stats.byDept.drivers}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <Link href={withSlug("/admin/users")} className="flex items-center gap-1.5 hover:underline">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>Other / admin</span>
                    </Link>
                    <span className="tabular-nums text-slate-700">{stats.byDept.other}</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Hours by department. */}
            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-brand-primary" />
                  <p className="font-semibold text-slate-900">Hours this week</p>
                </div>
                {stats.hoursWeek === 0 ? (
                  <p className="text-sm text-slate-500">No shifts logged yet this week.</p>
                ) : (
                  <ul className="text-sm space-y-1.5">
                    <li className="flex items-center justify-between">
                      <span className="text-slate-700">Kitchen</span>
                      <span className="tabular-nums text-slate-900 font-medium">{stats.hoursByDept.kitchen}h</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-slate-700">Cleaning</span>
                      <span className="tabular-nums text-slate-900 font-medium">{stats.hoursByDept.cleaning}h</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-slate-700">Drivers</span>
                      <span className="tabular-nums text-slate-900 font-medium">{stats.hoursByDept.drivers}h</span>
                    </li>
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Pending invitations. */}
            <Card className={`border shadow-sm ${stats.pendingInvites > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MailPlus className={`w-5 h-5 ${stats.pendingInvites > 0 ? "text-amber-600" : "text-slate-400"}`} />
                    <p className="font-semibold text-slate-900">Pending invites</p>
                  </div>
                  <Link href={withSlug("/admin/users?tab=invitations")} className="text-slate-400 hover:text-slate-600">
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                {stats.recentInvites.length === 0 ? (
                  <p className="text-sm text-slate-500">No outstanding invitations.</p>
                ) : (
                  <ul className="text-sm space-y-1.5">
                    {stats.recentInvites.map((inv) => (
                      <li key={inv.id} className="flex items-center justify-between gap-2 min-w-0">
                        <span className="truncate text-slate-700">
                          {inv.full_name || inv.email || "Invitee"}
                        </span>
                        <span className="text-xs text-slate-500 capitalize flex-shrink-0">{inv.role || "staff"}</span>
                      </li>
                    ))}
                    {stats.pendingInvites > stats.recentInvites.length && (
                      <li className="text-xs text-slate-500 pt-1">
                        + {stats.pendingInvites - stats.recentInvites.length} more
                      </li>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Feature tile grid. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feature) => {
              const isActive = feature.status === "active";
              const Icon = feature.Icon;
              return (
                <Card
                  key={feature.id}
                  className={`border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 ${!isActive ? "opacity-75" : ""}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-lg ${isActive ? "bg-blue-100" : "bg-slate-100"}`}>
                        <Icon className={`w-6 h-6 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                      </div>
                      <Badge className={isActive ? "bg-brand-primary/15 text-brand-primary hover:bg-brand-primary/15" : "bg-orange-100 text-orange-800 hover:bg-orange-100"}>
                        {isActive ? "Active" : "Coming Soon"}
                      </Badge>
                    </div>
                    <p className="font-semibold text-slate-900 text-lg">{feature.title}</p>
                    <p className="text-sm text-slate-600 mt-1 mb-3">{feature.description}</p>
                    {feature.chip && (
                      <p className="text-xs text-brand-primary mb-3 tabular-nums">{feature.chip}</p>
                    )}
                    {isActive ? (
                      <Link href={withSlug(feature.link)}>
                        <Button className="w-full">Open</Button>
                      </Link>
                    ) : (
                      // HRS-3: no anchor wrap on coming-soon - plain
                      // disabled button.
                      <Button variant="outline" className="w-full" disabled>
                        Coming Soon
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </PortalShell>
      </div>

      {/* HRS-4: ChatBot now receives the real role + companyId. */}
      <ChatBot
        userRole={String(userRole || "admin")}
        companyId={companyId}
      />
    </>
  );
}

export default function ProtectedHRSolutionsPage() {
  return (
    // HRS-A (HR solutions audit, HRS-1): dedupe COMPANY_ADMIN
    // copy-paste typo. Same pattern as CS-1 / STH-3 / USR-2.
    // HRS-B (task #214, 2026-05-25): admit OWNER + REGION_ADMIN.
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.REGION_ADMIN,
    ]}>
      <AdminHRSolutions />
    </ProtectedRoute>
  );
}
