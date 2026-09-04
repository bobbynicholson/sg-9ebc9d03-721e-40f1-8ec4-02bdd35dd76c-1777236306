/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Order-level staffing ledger for administrators.
 *
 * The order is the source of truth for the assignment links; this panel
 * joins the existing driver, waiter, kitchen, cleaning, and contributor
 * records into one readable view. Each row keeps its operational role so a
 * person with more than one role is never collapsed into one ambiguous total.
 */
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Clock3, Users, AlertCircle, CalendarClock } from "lucide-react";

type OrderStaffingPanelProps = {
  orderId: string;
  companyId: string;
  order?: {
    assigned_chef_id?: string | null;
    assigned_driver_id?: string | null;
    secondary_driver_id?: string | null;
  } | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active_role: string | null;
};

type StaffingRow = {
  id: string;
  personId: string;
  role: string;
  source: string;
  assignment: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  status: string | null;
  activityStart: string | null;
  activityEnd: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  kitchen_manager: "Kitchen manager",
  kitchen_staff: "Kitchen staff",
  cleaning: "Cleaning",
  cleaning_manager: "Cleaning manager",
  cleaning_staff: "Cleaning staff",
  driver: "Driver",
  waiter: "Waiter",
  service: "Service",
  shopping: "Shopping",
  shopping_staff: "Shopping staff",
};

const ROLE_TONES: Record<string, string> = {
  kitchen: "border-orange-200 bg-orange-50 text-orange-800",
  "kitchen + cleaning": "border-violet-200 bg-violet-50 text-violet-800",
  cleaning: "border-cyan-200 bg-cyan-50 text-cyan-800",
  driver: "border-blue-200 bg-blue-50 text-blue-800",
  waiter: "border-emerald-200 bg-emerald-50 text-emerald-800",
  shopping: "border-amber-200 bg-amber-50 text-amber-800",
};

const ROLE_SECTIONS = [
  { key: "driver", label: "Driver", roles: ["driver"], empty: "No driver attached yet" },
  { key: "waiter", label: "Waiter / service", roles: ["waiter", "service"], empty: "No waiter attached yet" },
  { key: "kitchen", label: "Kitchen", roles: ["kitchen", "kitchen_manager", "kitchen_staff"], empty: "No kitchen staff attached yet" },
  { key: "cleaning", label: "Cleaning", roles: ["cleaning", "cleaning_manager", "cleaning_staff"], empty: "No cleaning staff attached yet" },
  { key: "shopping", label: "Shopping", roles: ["shopping", "shopping_staff", "buyer"], empty: "No shopping staff attached yet" },
] as const;

function roleLabel(role: string): string {
  return ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function validIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-ZA", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function formatClock(value: string | null): string {
  if (!value) return "—";
  const parts = value.split(":");
  return `${parts[0]}:${parts[1] || "00"}`;
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start) return "Not clocked";
  const endDate = end ? new Date(end) : new Date();
  const startDate = new Date(start);
  const minutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const value = hours ? `${hours}h ${remainder}m` : `${remainder}m`;
  return end ? value : `${value} so far`;
}

function shiftRole(shiftType: string | null): string {
  if (shiftType === "delivery") return "driver";
  if (shiftType === "cleaning") return "cleaning";
  if (shiftType === "kitchen_and_cleaning") return "kitchen + cleaning";
  return "kitchen";
}

export function OrderStaffingPanel({ orderId, companyId, order }: OrderStaffingPanelProps) {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [rolesByUser, setRolesByUser] = useState<Map<string, string[]>>(new Map());
  const [rows, setRows] = useState<StaffingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId || !companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [drivers, waiters, kitchenShifts, dutyShifts, contributors] = await Promise.all([
          (supabase as any).from("driver_assignments")
            .select("id, driver_id, assignment_type, status, scheduled_for, assigned_at, accepted_at, en_route_at, completed_at")
            .eq("company_id", companyId).eq("order_id", orderId).order("assigned_at", { ascending: true }),
          (supabase as any).from("event_attendance")
            .select("id, waiter_id, arrived_at, service_started_at, service_ended_at, event_complete_at")
            .eq("company_id", companyId).eq("order_id", orderId).order("created_at", { ascending: true }),
          (supabase as any).from("kitchen_shifts")
            .select("id, staff_id, shift_type, planned_start, planned_end, actual_start, actual_end, status")
            .eq("company_id", companyId).eq("order_id", orderId).is("deleted_at", null).order("planned_start", { ascending: true }),
          (supabase as any).from("kitchen_duty_shifts")
            .select("id, staff_id, shift_type, shift_start, shift_end, is_active")
            .eq("company_id", companyId).eq("order_id", orderId).order("shift_start", { ascending: true }),
          (supabase as any).from("order_work_contributors")
            .select("id, user_id, area, first_at, last_at")
            .eq("company_id", companyId).eq("order_id", orderId).order("first_at", { ascending: true }),
        ]);

        const staffing: StaffingRow[] = [];
        const canonicalKeys = new Set<string>();
        const add = (row: StaffingRow) => {
          staffing.push(row);
          canonicalKeys.add(`${row.personId}:${row.role}`);
        };

        for (const row of (drivers.data || []) as any[]) {
          const start = validIso(row.en_route_at || row.accepted_at || row.assigned_at);
          const end = validIso(row.completed_at);
          add({
            id: `driver:${row.id}`, personId: row.driver_id, role: "driver",
            source: "driver assignment", assignment: row.driver_id === order?.secondary_driver_id ? "Co-driver" : "Delivery",
            plannedStart: validIso(row.scheduled_for), plannedEnd: null,
            actualStart: start, actualEnd: end, activityStart: start, activityEnd: end,
            status: row.status || null,
          });
        }
        for (const row of (waiters.data || []) as any[]) {
          const start = validIso(row.arrived_at || row.service_started_at);
          const end = validIso(row.event_complete_at || row.service_ended_at);
          add({
            id: `waiter:${row.id}`, personId: row.waiter_id, role: "waiter",
            source: "event attendance", assignment: "Event service",
            plannedStart: null, plannedEnd: null, actualStart: start, actualEnd: end,
            activityStart: start, activityEnd: end, status: end ? "completed" : start ? "active" : "assigned",
          });
        }
        for (const row of (kitchenShifts.data || []) as any[]) {
          // A combined shift is two operational assignments. Keep the same
          // clock interval, but expose one row per role so Kitchen and
          // Cleaning hours remain independently visible to admins.
          const roles = row.shift_type === "kitchen_and_cleaning"
            ? ["kitchen", "cleaning"]
            : [shiftRole(row.shift_type)];
          for (const role of roles) {
            add({
              id: `rostered:${row.id}:${role}`, personId: row.staff_id, role,
              source: "rostered shift", assignment: `${roleLabel(role)} shift`,
              plannedStart: row.planned_start, plannedEnd: row.planned_end,
              actualStart: validIso(row.actual_start), actualEnd: validIso(row.actual_end),
              activityStart: validIso(row.actual_start), activityEnd: validIso(row.actual_end), status: row.status || null,
            });
          }
        }
        for (const row of (dutyShifts.data || []) as any[]) {
          add({
            id: `duty:${row.id}`, personId: row.staff_id, role: "kitchen",
            source: "duty clock", assignment: "Kitchen duty",
            plannedStart: null, plannedEnd: null,
            actualStart: validIso(row.shift_start), actualEnd: validIso(row.shift_end),
            activityStart: validIso(row.shift_start), activityEnd: validIso(row.shift_end),
            status: row.is_active ? "active" : "completed",
          });
        }
        for (const row of (contributors.data || []) as any[]) {
          const role = String(row.area || "staff");
          if (!row.user_id || canonicalKeys.has(`${row.user_id}:${role}`)) continue;
          add({
            id: `contributor:${row.id}`, personId: row.user_id, role,
            source: "work activity", assignment: "Worked on order",
            plannedStart: null, plannedEnd: null,
            actualStart: validIso(row.first_at), actualEnd: validIso(row.last_at),
            activityStart: validIso(row.first_at), activityEnd: validIso(row.last_at), status: "recorded",
          });
        }

        const fallbackDrivers = [order?.assigned_driver_id, order?.secondary_driver_id].filter(Boolean) as string[];
        for (const driverId of fallbackDrivers) {
          if (!canonicalKeys.has(`${driverId}:driver`)) {
            add({ id: `fallback-driver:${driverId}`, personId: driverId, role: "driver", source: "order assignment", assignment: "Delivery", plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, activityStart: null, activityEnd: null, status: "assigned" });
          }
        }
        if (order?.assigned_chef_id && !canonicalKeys.has(`${order.assigned_chef_id}:kitchen`)) {
          add({ id: `fallback-chef:${order.assigned_chef_id}`, personId: order.assigned_chef_id, role: "kitchen", source: "order assignment", assignment: "Lead kitchen", plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, activityStart: null, activityEnd: null, status: "assigned" });
        }

        const ids = Array.from(new Set(staffing.map((row) => row.personId).filter(Boolean)));
        const [profileResult, departmentResult] = await Promise.all([
          ids.length ? (supabase as any).from("profiles").select("id, full_name, email, role, active_role").in("id", ids) : Promise.resolve({ data: [] }),
          ids.length ? (supabase as any).from("user_departments").select("user_id, department").in("user_id", ids) : Promise.resolve({ data: [] }),
        ]);
        const profileMap = new Map<string, Profile>();
        for (const profile of (profileResult.data || []) as Profile[]) profileMap.set(profile.id, profile);
        const roleMap = new Map<string, string[]>();
        for (const id of ids) {
          const profile = profileMap.get(id);
          const values = [profile?.role, profile?.active_role, ...((departmentResult.data || []) as any[]).filter((row) => row.user_id === id).map((row) => row.department)]
            .filter(Boolean).map((value) => String(value));
          roleMap.set(id, Array.from(new Set(values)));
        }
        if (!cancelled) {
          setProfiles(profileMap);
          setRolesByUser(roleMap);
          setRows(staffing);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "We could not load order staffing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [companyId, orderId, order?.assigned_chef_id, order?.assigned_driver_id, order?.secondary_driver_id]);

  const totalHours = useMemo(() => rows.reduce((sum, row) => {
    if (!row.activityStart) return sum;
    const end = row.activityEnd ? new Date(row.activityEnd) : new Date();
    return sum + Math.max(0, end.getTime() - new Date(row.activityStart).getTime()) / 3600000;
  }, 0), [rows]);
  const roleSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.role, (counts.get(row.role) || 0) + 1);
    return Array.from(counts.entries());
  }, [rows]);

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading order staffing…</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mr-2 inline h-4 w-4" />We could not load the order staffing details. {error}</div>;
  }

  return (
    <Card className="border-slate-200 bg-slate-50/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-slate-600" />Order staffing &amp; time</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Every person attached to this order, with their assignment role and order-specific clock time.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Badge variant="outline">{new Set(rows.map((row) => row.personId)).size} people</Badge>
            <Badge variant="outline">{rows.length} role assignment{rows.length === 1 ? "" : "s"}</Badge>
            {rows.some((row) => row.activityStart) && <Badge variant="outline"><Clock3 className="mr-1 h-3 w-3" />{totalHours.toFixed(1)}h tracked</Badge>}
          </div>
        </div>
        {roleSummary.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Order roles represented">
            {roleSummary.map(([role, count]) => (
              <span key={role} className={`rounded-full border px-2 py-1 text-[11px] font-medium ${ROLE_TONES[role] || "border-slate-200 bg-white text-slate-700"}`}>
                {roleLabel(role)} · {count}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4" aria-label="Order staffing sections">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Operational sections</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {ROLE_SECTIONS.map((section) => {
              const sectionRows = rows.filter((row) => section.roles.some((role) => role === row.role));
              const sectionPeople = new Set(sectionRows.map((row) => row.personId)).size;
              return (
                <div key={section.key} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">{section.label}</span>
                    <Badge variant="outline" className="text-[10px]">{sectionRows.length}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {sectionRows.length ? `${sectionPeople} ${sectionPeople === 1 ? "person" : "people"} attached` : section.empty}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No team members have been attached to this order yet. Assign the driver, kitchen shift, waiter, or cleaning work from the relevant operational section.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Role for this order</th><th className="px-3 py-2">Assignment</th><th className="px-3 py-2">Planned / assigned</th><th className="px-3 py-2">Actual time</th><th className="px-3 py-2">Time</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const profile = profiles.get(row.personId);
                  const allRoles = (rolesByUser.get(row.personId) || []).filter((role) => role !== row.role);
                  return (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2"><div className="font-medium text-slate-900">{profile?.full_name || profile?.email || "Unknown user"}</div><div className="text-[10px] text-slate-500">{profile?.email || "No email recorded"}</div>{allRoles.length > 0 && <div className="mt-1 text-[10px] text-slate-500">Other roles: {allRoles.map(roleLabel).join(", ")}</div>}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className={`capitalize ${ROLE_TONES[row.role] || ""}`}>{roleLabel(row.role)}</Badge></td>
                      <td className="px-3 py-2"><div className="font-medium text-slate-700">{row.assignment}</div><div className="mt-0.5 text-[10px] text-slate-500">Source: {row.source}</div>{row.status && <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] capitalize ${row.status === "active" ? "bg-emerald-100 text-emerald-800" : row.status === "completed" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-800"}`}>{row.status.replace(/_/g, " ")}</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{row.plannedStart ? `${formatClock(row.plannedStart)}${row.plannedEnd ? ` – ${formatClock(row.plannedEnd)}` : ""}` : row.activityStart ? `Started ${formatStamp(row.activityStart)}` : "Not scheduled"}</td>
                      <td className="px-3 py-2 text-slate-600">{row.actualStart ? `${formatStamp(row.actualStart)}${row.actualEnd ? ` – ${formatStamp(row.actualEnd)}` : " · active"}` : "Not clocked"}</td>
                      <td className="px-3 py-2 font-medium tabular-nums text-slate-700">{durationLabel(row.activityStart, row.activityEnd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Role time is calculated from the order-linked record for that role. A person with kitchen and cleaning assignments appears on separate rows, so their hours are not mixed.</p>
      </CardContent>
    </Card>
  );
}

export default OrderStaffingPanel;
