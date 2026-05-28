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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { canAccessFinance } from "@/lib/authGuards";
import { captureException } from "@/lib/observability";
import { ChatBot } from "@/components/ChatBot";
import {
  Users, Clock, Calendar, TrendingUp, Award, FileText,
  DollarSign, UserPlus, Loader2, ChefHat, Sparkles, Truck,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_invitations", filter: `company_id=eq.${companyId}` }, bump)
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
        const weekStartISO = startOfWeek().toISOString();
        const todayISO = new Date().toISOString();
        void todayISO;

        // Staff by role + region scope. Pulls the full role list so
        // we can bucket into kitchen / cleaning / drivers / other.
        let staffQ = supabase.from("profiles")
          .select("id, role")
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
          .select("hours_worked, shift_date, actual_end")
          .eq("company_id", companyId)
          .gte("shift_date", new Date(startOfWeek()).toISOString().slice(0, 10));

        // Kitchen duty shifts is_active=true (clocked-now bucket A).
        const kitchenClockedQ = supabase.from("kitchen_duty_shifts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true);

        // Cleaning duty on_duty=true (clocked-now bucket B).
        const cleaningClockedQ = supabase.from("cleaning_duty_logs")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("on_duty", true);

        // Driver shifts still open (clocked-now bucket C). actual_end
        // IS NULL on an in-progress driver_shifts row.
        const driverClockedQ = supabase.from("driver_shifts")
          .select("id", { count: "exact", head: true })
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

        // Bucket staff by role.
        const byDept: DeptCount = { kitchen: 0, cleaning: 0, drivers: 0, other: 0 };
        const staffIdByRole: Record<string, Set<string>> = { kitchen: new Set(), cleaning: new Set(), drivers: new Set(), other: new Set() };
        for (const p of ((staffRes.data || []) as Array<{ id: string; role: string | null }>)) {
          const r = String(p.role || "").toLowerCase();
          if (r === "kitchen_staff") { byDept.kitchen += 1; staffIdByRole.kitchen.add(p.id); }
          else if (r === "cleaning_staff") { byDept.cleaning += 1; staffIdByRole.cleaning.add(p.id); }
          else if (r === "driver") { byDept.drivers += 1; staffIdByRole.drivers.add(p.id); }
          else { byDept.other += 1; staffIdByRole.other.add(p.id); }
        }
        const staffTotal = byDept.kitchen + byDept.cleaning + byDept.drivers + byDept.other;

        // Hours by department.
        const hoursByDept: DeptCount = { kitchen: 0, cleaning: 0, drivers: 0, other: 0 };
        let wageBurnWeekZar = 0;
        // Kitchen mins + wage rate.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of ((kitchenShiftsRes.data || []) as any[])) {
          const mins = Number(s.standard_min || 0) + Number(s.overtime_min || 0) + Number(s.sunday_holiday_min || 0);
          if (mins <= 0) continue;
          hoursByDept.kitchen += mins / 60;
          const rate = Number(s.kitchen_staff_members?.hourly_rate || 0);
          if (rate > 0) wageBurnWeekZar += (mins / 60) * rate;
        }
        // Cleaning mins via duty window. Region filter via staffIdByRole.cleaning.
        for (const r of ((cleaningDutyRes.data || []) as Array<{
          user_id: string | null; duty_started_at: string | null;
          duty_ended_at: string | null; on_duty: boolean | null;
        }>)) {
          if (!r.user_id || !r.duty_started_at) continue;
          if (regionFilterId && !staffIdByRole.cleaning.has(r.user_id)) continue;
          const start = new Date(r.duty_started_at).getTime();
          const end = r.duty_ended_at
            ? new Date(r.duty_ended_at).getTime()
            : r.on_duty ? Date.now() : start;
          hoursByDept.cleaning += Math.max(0, (end - start) / 3_600_000);
        }
        // Driver hours via hours_worked (generated). Open shifts
        // (actual_end IS NULL) contribute nothing yet.
        for (const r of ((driverShiftsRes.data || []) as Array<{ hours_worked: number | null }>)) {
          if (r.hours_worked) hoursByDept.drivers += Number(r.hours_worked);
        }
        hoursByDept.kitchen = Math.round(hoursByDept.kitchen);
        hoursByDept.cleaning = Math.round(hoursByDept.cleaning);
        hoursByDept.drivers = Math.round(hoursByDept.drivers);

        const hoursWeek = hoursByDept.kitchen + hoursByDept.cleaning + hoursByDept.drivers;
        const clockedNow = (kitchenClockedRes.count ?? 0) + (cleaningClockedRes.count ?? 0) + (driverClockedRes.count ?? 0);

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
            wageBurnWeekZar,
            byDept,
            hoursByDept,
            recentInvites: invitesRows.slice(0, 3),
          });
        }
      } catch (e) {
        captureException(e, { tags: { route: "/admin/hr-solutions", step: "load", companyId: companyId || "" } });
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
      Icon: DollarSign,
      link: "/admin/wages",
      status: "active",
      chip: canSeeFinance && !loading && stats.wageBurnWeekZar > 0
        ? `${tenantCurrency.format(stats.wageBurnWeekZar)} this week`
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
      title: "Training & Onboarding",
      description: "Certifications, induction checklist, refresher schedule.",
      Icon: Award,
      link: "#",
      status: "coming-soon",
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

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 lg:py-10 max-w-full">

          <div className="flex items-start gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
                HR <InfoTooltip content={"One landing for every staff-related tool. Active tiles take you straight to the feature; chips show this week's live numbers."} />
              </h1>
              <p className="text-slate-600 text-sm sm:text-base">
                Hours, wages, accounts and invites at a glance. Drill into a card for the full surface.
              </p>
            </div>
          </div>

          {/* HRS-B: top chip row. Same shape as the team landings. */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Link href={withSlug("/admin/users")}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                {stats.staffTotal} active
              </Badge>
            </Link>
            <Link href={withSlug("/admin/staff-hours")}>
              <Badge variant="secondary" className="px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-200">
                <Clock className="w-3 h-3 mr-1" />
                {stats.hoursWeek}h this week
              </Badge>
            </Link>
            {stats.staffTotal > 0 && (
              <Badge
                variant="outline"
                className={`px-3 py-1.5 text-sm ${
                  stats.clockedNow === 0
                    ? "border-slate-200 text-slate-700 bg-slate-50"
                    : "border-emerald-300 text-emerald-700 bg-emerald-50"
                }`}
              >
                <Flame className="w-3 h-3 mr-1" />
                {stats.clockedNow} clocked now
              </Badge>
            )}
            {stats.pendingInvites > 0 && (
              <Link href={withSlug("/admin/users?tab=invitations")}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm border-amber-300 text-amber-700 bg-amber-50 cursor-pointer hover:bg-amber-100">
                  <MailPlus className="w-3 h-3 mr-1" />
                  {stats.pendingInvites} pending invite{stats.pendingInvites === 1 ? "" : "s"}
                </Badge>
              </Link>
            )}
            {canSeeFinance && stats.wageBurnWeekZar > 0 && (
              <Link href={withSlug("/admin/wages")}>
                <Badge variant="outline" className="px-3 py-1.5 text-sm border-emerald-300 text-emerald-700 bg-emerald-50 tabular-nums cursor-pointer hover:bg-emerald-100">
                  <DollarSign className="w-3 h-3 mr-1" />
                  {tenantCurrency.format(stats.wageBurnWeekZar)} burn this week
                </Badge>
              </Link>
            )}
          </div>

          {/* HRS-B: intel grid - department breakdown + hours + invites. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6">

            {/* Staff by department. */}
            <Card className="border-0 shadow-md bg-white">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-5 h-5 text-indigo-600" />
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
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
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
            <Card className="border-0 shadow-md bg-white">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-emerald-600" />
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
            <Card className={`border-0 shadow-md ${stats.pendingInvites > 0 ? "bg-gradient-to-br from-amber-50 to-orange-50" : "bg-white"}`}>
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
                  className={`border-0 shadow-md hover:shadow-lg transition-shadow ${!isActive ? "opacity-75" : ""}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-lg ${isActive ? "bg-blue-100" : "bg-slate-100"}`}>
                        <Icon className={`w-6 h-6 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                      </div>
                      <Badge className={isActive ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-orange-100 text-orange-800 hover:bg-orange-100"}>
                        {isActive ? "Active" : "Coming Soon"}
                      </Badge>
                    </div>
                    <p className="font-semibold text-slate-900 text-lg">{feature.title}</p>
                    <p className="text-sm text-slate-600 mt-1 mb-3">{feature.description}</p>
                    {feature.chip && (
                      <p className="text-xs text-emerald-700 mb-3 tabular-nums">{feature.chip}</p>
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
        </div>
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
