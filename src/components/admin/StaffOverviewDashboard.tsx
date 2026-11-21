import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarDays, ChefHat, Clock3, Loader2, MailPlus, RefreshCw, ShoppingBag, Sparkles, Truck, Users } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LazyChatBot as ChatBot } from "@/components/chatbot/LazyChatBot";
import { PortalHeader, PageWorkbench, PortalShell, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { canManagePayroll } from "@/lib/authGuards";
import { countTeamBuckets } from "@/lib/teamRoleBuckets";
import { mergeTeamDirectoryMemberships } from "@/lib/teamDirectoryMemberships";
import { toLocalISO } from "@/lib/localDate";
import { formatZAR } from "@/lib/formatters";
import { captureException } from "@/lib/observability";
import { UserRole } from "@/types/app";
import { driverPayService } from "@/services/driverPayService";
import { kitchenStaffService, type StaffWageSummary } from "@/services/kitchenStaffService";

type PeriodKey = "this_week" | "this_month" | "this_year";
type Period = { fromISO: string; toISO: string; fromDate: string; toDate: string; label: string };
type Invite = { id: string; email: string | null; full_name: string | null; role: string | null; created_at: string | null };
type DriverProfile = { id: string; full_name: string | null; email: string | null; hourly_rate: number | null; distance_rate_per_km: number | null; base_callout_fee: number | null };
type DirectoryMember = { id: string; linked_profile_id: string | null; email: string | null; departments: string[] | null };
type TeamProfile = { id: string; email: string | null; role: string | null; active_role: string | null; is_active: boolean | null };
type Snapshot = {
  activeStaff: number;
  teamCounts: ReturnType<typeof countTeamBuckets>;
  pendingInvites: number;
  recentInvites: Invite[];
  payrollHours: number;
  grossPayroll: number;
};

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "this_year", label: "Year to date" },
];

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

/** Uses the same Monday-start, exclusive-end periods as /admin/wages. */
function getPeriod(key: PeriodKey): Period {
  const now = new Date();
  let from: Date;
  let to: Date;
  if (key === "this_week") {
    from = startOfWeek(now);
    to = new Date(from);
    to.setDate(to.getDate() + 7);
  } else if (key === "this_month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  const fromISO = from.toISOString();
  const toISO = to.toISOString();
  return {
    fromISO,
    toISO,
    // These deliberately mirror the Wages page's driver range conversion.
    fromDate: fromISO.slice(0, 10),
    toDate: toLocalISO(new Date(new Date(toISO).getTime() - 1)),
    label: PERIODS.find((period) => period.key === key)?.label || "Year to date",
  };
}

function emptySnapshot(): Snapshot {
  return {
    activeStaff: 0,
    teamCounts: { kitchen: 0, cleaning: 0, drivers: 0, shopping: 0, sales: 0, admin: 0, client: 0, outsource: 0, other: 0 },
    pendingInvites: 0,
    recentInvites: [],
    payrollHours: 0,
    grossPayroll: 0,
  };
}

function StaffOverviewDashboard() {
  const { user, profile } = useAuth();
  const { withSlug } = useTenantHref();
  const companyId = (profile as { company_id?: string } | null)?.company_id
    || (user as { user_metadata?: { company_id?: string } } | null)?.user_metadata?.company_id;
  const userRole = ((profile as { active_role?: UserRole; role?: UserRole } | null)?.active_role
    || (profile as { role?: UserRole } | null)?.role) as UserRole | undefined;
  const canSeePayroll = canManagePayroll(userRole);
  const currency = useTenantCurrency(companyId);
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_year");
  const period = useMemo(() => getPeriod(periodKey), [periodKey]);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((value) => value + 1), 1200);
    };
    const channel = supabase
      .channel(`staff-overview:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_staff_members", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_invitations", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_staff_shifts", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_shifts", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_assignments", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "public_holidays" }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const driverProfilesQuery = canSeePayroll
          ? supabase.from("profiles").select("id, full_name, email, hourly_rate, distance_rate_per_km, base_callout_fee").eq("company_id", companyId).eq("role", "driver")
          : Promise.resolve({ data: [], error: null });
        const [profileResult, directoryResult, departmentResult, inviteCountResult, inviteRowsResult, driverProfilesResult, kitchenWages] = await Promise.all([
          supabase.from("profiles").select("id, email, role, active_role, is_active").eq("company_id", companyId),
          supabase.from("kitchen_staff_members").select("id, linked_profile_id, email, departments").eq("company_id", companyId).eq("is_active", true).is("deleted_at", null),
          supabase.from("user_departments").select("user_id, department, is_primary"),
          supabase.from("staff_invitations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
          supabase.from("staff_invitations").select("id, user_id, role, created_at").eq("company_id", companyId).eq("status", "pending").order("created_at", { ascending: false }).limit(5),
          driverProfilesQuery,
          canSeePayroll ? kitchenStaffService.getWageSummary(companyId, period.fromISO, period.toISO) : Promise.resolve([] as StaffWageSummary[]),
        ]);
        const queryError = profileResult.error || directoryResult.error || departmentResult.error || inviteCountResult.error || inviteRowsResult.error || driverProfilesResult.error;
        if (queryError) throw queryError;

        const teamProfiles = ((profileResult.data || []) as TeamProfile[])
          .filter((person) => person.is_active !== false && String(person.role || person.active_role || "").toLowerCase() !== "client");
        const profileIds = teamProfiles.map((person) => person.id).filter(Boolean);
        const filteredDepartments = ((departmentResult.data || []) as Array<{ user_id: string | null; department: string | null; is_primary: boolean | null }>)
          .filter((row) => row.user_id && profileIds.includes(row.user_id));
        const mergedTeam = mergeTeamDirectoryMemberships(
          teamProfiles,
          filteredDepartments,
          (directoryResult.data || []) as DirectoryMember[],
        );
        const teamCounts = countTeamBuckets(mergedTeam.profiles, mergedTeam.departmentRows);

        const pendingInvites = (inviteRowsResult.data || []).map((invite) => ({
          id: invite.id,
          user_id: invite.user_id,
          role: invite.role,
          created_at: invite.created_at,
          email: null as string | null,
          full_name: null as string | null,
        }));
        const inviteeIds = Array.from(new Set(pendingInvites.map((invite) => invite.user_id).filter((id): id is string => Boolean(id))));
        if (inviteeIds.length > 0) {
          const { data: inviteeProfiles, error: inviteeProfilesError } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", inviteeIds);
          if (inviteeProfilesError) throw inviteeProfilesError;
          const invitees = new Map((inviteeProfiles || []).map((person) => [person.id, person]));
          for (const invite of pendingInvites) {
            const person = invite.user_id ? invitees.get(invite.user_id) : undefined;
            invite.email = person?.email || null;
            invite.full_name = person?.full_name || null;
          }
        }

        const driverProfiles = (driverProfilesResult.data || []) as DriverProfile[];
        const driverTotals = canSeePayroll ? await driverPayService.getBulkPayTotals({
          companyId,
          driverIds: driverProfiles.map((driver) => driver.id),
          range: { from: period.fromDate, to: period.toDate },
        }) : new Map();
        const staffHours = kitchenWages.reduce((total: number, row: StaffWageSummary) => total + row.total_min, 0) / 60;
        const staffGross = kitchenWages.reduce((total: number, row: StaffWageSummary) => total + row.total_wage, 0);
        const drivers = Array.from(driverTotals.values());
        const driverHours = drivers.reduce((total, row) => total + row.hours_total, 0);
        const driverGross = drivers.reduce((total, row) => total + row.grand_total, 0);

        if (!cancelled) {
          setSnapshot({
            activeStaff: mergedTeam.profiles.length,
            teamCounts,
            pendingInvites: inviteCountResult.count ?? inviteRowsResult.data?.length ?? 0,
            recentInvites: pendingInvites,
            payrollHours: staffHours + driverHours,
            grossPayroll: staffGross + driverGross,
          });
        }
      } catch (cause) {
        captureException(cause, { tags: { route: "/admin/hr-solutions", step: "load", companyId } });
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the staff overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [companyId, canSeePayroll, period.fromISO, period.toISO, period.fromDate, period.toDate, refreshTick]);

  const teamLinks = [
    { label: "Kitchen", value: snapshot.teamCounts.kitchen, href: "/admin/teams/kitchen", icon: ChefHat },
    { label: "Shopping", value: snapshot.teamCounts.shopping, href: "/admin/teams/shopping", icon: ShoppingBag },
    { label: "Cleaning", value: snapshot.teamCounts.cleaning, href: "/admin/teams/cleaning", icon: Sparkles },
    { label: "Drivers", value: snapshot.teamCounts.drivers, href: "/admin/teams/drivers", icon: Truck },
  ];

  return (
    <>
      <NoIndexMeta />
      <Head><title>Staff overview - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Staff overview"
            icon={Users}
            subtitle="Company-wide team membership, invitations, and payroll hours from the Wages calculations."
            meta={(
              <div className="flex flex-wrap gap-2">
                <Link href={withSlug("/admin/teams")}><Button variant="secondary" size="sm" className="min-h-9">Teams</Button></Link>
                <Link href={withSlug("/admin/users?tab=invitations")}><Button variant="secondary" size="sm" className="min-h-9"><MailPlus className="mr-1.5 h-4 w-4" />Invitations</Button></Link>
                {canSeePayroll && <Link href={withSlug("/admin/wages")}><Button variant="secondary" size="sm" className="min-h-9"><Banknote className="mr-1.5 h-4 w-4" />Wages</Button></Link>}
              </div>
            )}
          />
          <PageWorkbench />

          {canSeePayroll && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Payroll date range">
              {PERIODS.map((option) => (
                <Button key={option.key} type="button" size="sm" variant={periodKey === option.key ? "default" : "outline"} aria-pressed={periodKey === option.key} onClick={() => setPeriodKey(option.key)}>
                  {option.label}
                </Button>
              ))}
              <Badge variant="outline" className="ml-1 inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{period.label}</Badge>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshTick((value) => value + 1)} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Refresh
            </Button>
          </div>}

          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5 text-sm text-blue-950 sm:mb-6">
            {canSeePayroll
              ? "Company-wide view. Payroll hours and gross pay use the same services and selected period as Wages; payroll data is not branch-filtered."
              : "Company-wide view. Payroll figures are restricted to company owners and company administrators."}
          </div>

          {error && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <span className="flex min-w-0 items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />Could not load staff overview: {error}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setRefreshTick((value) => value + 1)}>Try again</Button>
            </div>
          )}

          <div className={`mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-4 ${canSeePayroll ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {loading && !error ? (
              [0, 1, 2, ...(canSeePayroll ? [3] : [])].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white/80" />)
            ) : !error ? (
              <>
                <StatTile compact label="Active staff" value={snapshot.activeStaff} icon={Users} hint="Profiles and non-login team members" />
                <StatTile compact label="Pending invitations" value={snapshot.pendingInvites} icon={MailPlus} hint="Waiting for staff to accept" />
                {canSeePayroll && <>
                  <StatTile compact label="Payroll hours" value={`${snapshot.payrollHours.toFixed(1)}h`} icon={Clock3} hint={`${period.label} · same calculation as Wages`} />
                  <StatTile compact label="Gross payroll" value={formatZAR(snapshot.grossPayroll, { currency: currency.code })} icon={Banknote} hint={`${period.label} · matches Wages`} />
                </>}
              </>
            ) : null}
          </div>

          {!error && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Team membership</CardTitle>
                  <CardDescription>People can appear in more than one team if they have multiple roles.</CardDescription>
                </CardHeader>
                <CardContent className="divide-y divide-slate-100 p-0">
                  {teamLinks.map((team) => {
                    const Icon = team.icon;
                    return <Link key={team.label} href={withSlug(team.href)} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary">
                      <span className="flex items-center gap-2 text-slate-700"><Icon className="h-4 w-4 text-slate-500" />{team.label}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{loading ? "—" : team.value}</span>
                    </Link>;
                  })}
                  <Link href={withSlug("/admin/users")} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary">
                    <span className="flex items-center gap-2 text-slate-700"><Users className="h-4 w-4 text-slate-500" />Office and other roles</span>
                    <span className="font-semibold tabular-nums text-slate-900">{loading ? "—" : snapshot.teamCounts.admin + snapshot.teamCounts.sales + snapshot.teamCounts.outsource + snapshot.teamCounts.other}</span>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                  <div>
                    <CardTitle className="text-base">Pending invitations</CardTitle>
                    <CardDescription>{snapshot.pendingInvites} awaiting acceptance</CardDescription>
                  </div>
                  <Link href={withSlug("/admin/users?tab=invitations")} className="shrink-0 text-sm font-semibold text-brand-primary hover:underline">Manage</Link>
                </CardHeader>
                <CardContent className="pt-0">
                  {loading ? <div className="h-16 animate-pulse rounded-md bg-slate-100" /> : snapshot.recentInvites.length === 0 ? (
                    <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-600">No invitations are waiting for a response.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {snapshot.recentInvites.map((invite) => <li key={invite.id} className="flex min-w-0 items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{invite.full_name || invite.email || "Staff member"}</span><span className="block truncate text-xs text-slate-500">{invite.email || "No email"}</span></span>
                        <Badge variant="outline" className="shrink-0 capitalize">{(invite.role || "staff").replace(/_/g, " ")}</Badge>
                      </li>)}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </PortalShell>
      </div>
      <ChatBot userRole={String(userRole || "admin")} companyId={companyId} />
    </>
  );
}

export default function ProtectedStaffOverviewPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.REGION_ADMIN]}>
      <StaffOverviewDashboard />
    </ProtectedRoute>
  );
}
