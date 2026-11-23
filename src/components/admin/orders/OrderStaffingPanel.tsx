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
import { WhatsAppTemplateSend } from "@/components/messaging/WhatsAppTemplateSend";
import { Clock3, Users, AlertCircle, CalendarClock } from "lucide-react";

type OrderStaffingPanelProps = {
  orderId: string;
  companyId: string;
  embedded?: boolean;
  order?: {
    assigned_chef_id?: string | null;
    assigned_driver_id?: string | null;
    secondary_driver_id?: string | null;
    status?: string | null;
    delivered_at?: string | null;
    departed_venue_at?: string | null;
    event_complete_at?: string | null;
    completed_at?: string | null;
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

function durationLabel(start: string | null, end: string | null, closed = false): string {
  if (!start) return "Not clocked";
  if (closed && !end) return "End time unavailable";
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

export function OrderStaffingPanel({ orderId, companyId, order, embedded = false }: OrderStaffingPanelProps) {
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
            .select("id, driver_id, assignment_type, status, scheduled_for, assigned_at, accepted_at, en_route_at, delivered_at, completed_at")
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
          // Acceptance/assignment timestamps are not clock-in timestamps.
          // Only show elapsed work time after the driver actually went en route.
          const start = validIso(row.en_route_at);
          const isDelivery = ["delivery", "both"].includes(String(row.assignment_type || "").toLowerCase());
          const terminalOrderAt = validIso(order?.delivered_at || order?.departed_venue_at || order?.event_complete_at || order?.completed_at);
          const terminalOrder = isDelivery && (["delivered", "completed"].includes(String(order?.status || "").toLowerCase())
            || !!terminalOrderAt
            || !!order?.event_complete_at);
          const end = validIso(row.completed_at || row.delivered_at || (terminalOrder ? terminalOrderAt : null));
          const status = terminalOrder
            ? "completed"
            : row.status || (start ? "active" : "assigned");
          add({
            id: `driver:${row.id}`, personId: row.driver_id, role: "driver",
            source: "driver assignment", assignment: row.driver_id === order?.secondary_driver_id ? "Co-driver" : "Delivery",
            plannedStart: validIso(row.scheduled_for), plannedEnd: null,
            actualStart: start, actualEnd: end, activityStart: start, activityEnd: end,
            status,
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
  const peopleCount = new Set(rows.map((row) => row.personId)).size;

  const content = (
    <>
      <CardHeader className={embedded ? "min-w-0 gap-3 p-0 pb-4" : "min-w-0 gap-3 px-4 pb-4 pt-5 sm:px-6"}>
        <div>
          {!embedded && (
            <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-950">
              <Users aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-600" /> Order staffing &amp; time
            </CardTitle>
          )}
          {!loading && !error && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span>{peopleCount} {peopleCount === 1 ? "person" : "people"}</span>
              <span>{rows.length} {rows.length === 1 ? "assignment" : "assignments"}</span>
              {rows.some((row) => row.activityStart) && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock3 aria-hidden="true" className="h-4 w-4 shrink-0" /> {totalHours.toFixed(1)}h tracked
                </span>
              )}
            </p>
          )}
        </div>
        {!loading && !error && rows.length > 0 && (
          <dl aria-label="Assignments by team" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-3 sm:p-4">
            {ROLE_SECTIONS.map((section) => {
              const sectionRows = rows.filter((row) => section.roles.some((role) => role === row.role));
              return (
                <div key={section.key} className="min-w-0">
                  <dt className="text-sm font-medium text-slate-900">{section.label}</dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-slate-600">
                    {sectionRows.length ? `${sectionRows.length} ${sectionRows.length === 1 ? "assignment" : "assignments"}` : "No assignments"}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardHeader>

      <CardContent className={embedded ? "min-w-0 p-0" : "min-w-0 px-4 pb-5 pt-0 sm:px-6"}>
        {loading ? (
          <p role="status" className="border-t border-slate-200 py-4 text-sm text-slate-600">Loading order staffing…</p>
        ) : error ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-900 [overflow-wrap:anywhere]">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>We could not load the order staffing details. {error}</span>
          </p>
        ) : rows.length === 0 ? (
          <p className="border-t border-slate-200 pt-4 text-sm text-slate-600">No team members assigned to this order. Assign staff in the relevant operational section.</p>
        ) : (
          <ul className="divide-y divide-slate-200 border-y border-slate-200" aria-label="Order assignments">
            {rows.map((row) => {
              const profile = profiles.get(row.personId);
              const allRoles = (rolesByUser.get(row.personId) || []).filter((role) => role !== row.role);
              const statusTone = row.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700";
              return (
                <li key={row.id} className="min-w-0 space-y-3 py-4 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-950">{profile?.full_name || profile?.email || "Unknown user"}</p>
                      {profile?.email && profile.full_name && <p className="mt-0.5 text-sm text-slate-600">{profile.email}</p>}
                      {allRoles.length > 0 && <p className="mt-0.5 text-sm text-slate-600">Also: {allRoles.map(roleLabel).join(", ")}</p>}
                    </div>
                    <Badge variant="outline" className={`max-w-full whitespace-normal text-xs ${ROLE_TONES[row.role] || "border-slate-200 text-slate-700"}`}>{roleLabel(row.role)}</Badge>
                  </div>
                  <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="min-w-0">
                      <dt className="font-medium text-slate-600">Assignment</dt>
                      <dd className="mt-0.5 font-medium text-slate-900">{row.assignment}</dd>
                      <dd className="mt-0.5 text-slate-600">Source: {row.source}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-medium text-slate-600">Planned</dt>
                      <dd className="mt-0.5 tabular-nums text-slate-800">
                        {row.plannedStart ? `${formatClock(row.plannedStart)}${row.plannedEnd ? ` – ${formatClock(row.plannedEnd)}` : ""}` : "Not scheduled"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-medium text-slate-600">Actual time</dt>
                      <dd className="mt-0.5 tabular-nums text-slate-800">
                        {row.actualStart ? `${formatStamp(row.actualStart)}${row.actualEnd ? ` – ${formatStamp(row.actualEnd)}` : row.status === "completed" ? " · end time unavailable" : " · active"}` : "Not clocked"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-medium text-slate-600">Duration</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{durationLabel(row.activityStart, row.activityEnd, row.status === "completed")}</dd>
                      {row.status && (
                        <dd className={`mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTone}`}>
                          {row.status.replace(/_/g, " ")}
                        </dd>
                      )}
                    </div>
                  </dl>
                  {row.role === "driver" && profile && (
                    <div className="[&_button]:min-h-[44px] [&_button]:max-w-full [&_button]:whitespace-normal">
                      <WhatsAppTemplateSend
                        entityType="staff_order"
                        entityId={orderId}
                        recipientId={row.personId}
                        companyId={companyId}
                        recipientName={profile.full_name || profile.email}
                        buttonLabel="Notify driver"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!loading && !error && rows.length > 0 && (
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
            <CalendarClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Time is tracked by assignment. Staff who work across roles appear once per assignment.</span>
          </p>
        )}
      </CardContent>
    </>
  );
  return embedded ? content : (
    <Card className="min-w-0 rounded-xl border-slate-200 bg-white shadow-none">{content}</Card>
  );
}

export default OrderStaffingPanel;
