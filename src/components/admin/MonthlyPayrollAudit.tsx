/* Admin-only monthly workforce and order audit. */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarDays, ChevronDown, ChevronUp, Clock3, Download, Loader2, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatZAR } from "@/lib/formatters";
import { toLocalISO } from "@/lib/localDate";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { needsKitchenShiftReview, type KitchenShift, type StaffWageSummary } from "@/services/kitchenStaffService";
import { driverPayService, driverShiftReviewReason, type DriverShift } from "@/services/driverPayService";
import { deleteTask } from "@/services/staffShiftTasksService";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";

type Profile = { id: string; full_name: string | null; email: string | null; role: string | null; active_role: string | null; hourly_rate: number | null; pay_type?: string | null; login_status?: "linked" | "unlinked" | "none" | "ambiguous" };
type DirectoryMember = { id: string; linked_profile_id: string | null; full_name: string; email: string | null; role_title: string | null; departments: string[] | null; hourly_rate: number | null; pay_type: string | null };
type Order = { id: string; order_number: string | null; event_name: string | null; event_date: string | null };
type AuditLine = {
  id: string;
  staffId: string;
  date: string;
  role: string;
  orderId: string | null;
  orderLabel: string;
  source: string;
  start: string | null;
  end: string | null;
  hours: number;
  recordedHours?: number | null;
  needsReview?: boolean;
  adminReview?: string;
  voidReason?: string | null;
  sourceNotes?: string | null;
  active: boolean;
  earnings: number;
  paymentStatus: string | null;
};
type DriverWageSummary = { driver_id: string; full_name: string; hours: number; distance_km: number; hourly_pay: number; distance_pay: number; callout_pay: number; total: number };
type WagesLedgerEntry = { hours: number; earnings: number; source: string; distanceKm?: number; hourlyPay?: number; distancePay?: number; calloutPay?: number };

const ROLE_LABELS: Record<string, string> = {
  driver: "Driver", waiter: "Waiter / service", kitchen: "Kitchen", kitchen_staff: "Kitchen staff", kitchen_manager: "Kitchen manager",
  cleaning: "Cleaning", cleaning_staff: "Cleaning staff", cleaning_manager: "Cleaning manager", shopping: "Shopping", shopping_staff: "Shopping staff", buyer: "Buyer",
};
const roleLabel = (role: string) => ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const iso = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const duration = (start: string | null, end: string | null) => {
  if (!start) return 0;
  const begin = new Date(start).getTime();
  const stop = end ? new Date(end).getTime() : Date.now();
  return Number.isFinite(begin) && Number.isFinite(stop) ? Math.max(0, (stop - begin) / 3_600_000) : 0;
};
const exactDuration = (start: string | null, end: string | null) => {
  if (!start || !end) return null;
  const begin = new Date(start).getTime();
  const stop = new Date(end).getTime();
  return Number.isFinite(begin) && Number.isFinite(stop) ? Math.max(0, (stop - begin) / 3_600_000) : null;
};
const intervalNeedsReview = (start: string | null, end: string | null) => {
  if (!start) return false;
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  return !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs || endMs - startMs > 24 * 60 * 60 * 1000;
};
const hoursLabel = (hours: number) => `${hours.toFixed(1)}h`;
const boundsFilename = (value: string) => toLocalISO(new Date(value));
const reviewLabel = (line: AuditLine) => line.recordedHours != null
  ? `Stored: ${hoursLabel(line.recordedHours)} · review`
  : "Invalid or over-24h interval; excluded from totals.";
const timeLabel = (value: string | null) => value ? new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—";

function mergedHours(lines: AuditLine[]): number {
  const intervals = lines
    .filter((line) => !line.needsReview && line.paymentStatus !== "voided" && line.start && (line.end || line.active))
    .map((line) => {
      const start = new Date(line.start as string).getTime();
      const end = line.end ? new Date(line.end).getTime() : Date.now();
      return { start, end };
    })
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end >= interval.start)
    .sort((a, b) => a.start - b.start);
  let totalMs = 0;
  let current: { start: number; end: number } | null = null;
  for (const interval of intervals) {
    if (!current) { current = interval; continue; }
    if (interval.start <= current.end) current.end = Math.max(current.end, interval.end);
    else { totalMs += current.end - current.start; current = interval; }
  }
  if (current) totalMs += current.end - current.start;
  return totalMs / 3_600_000;
}

function staffName(profile: Profile | undefined, id: string) { return profile?.full_name || profile?.email || `User ${id.slice(0, 8)}`; }

export function MonthlyPayrollAudit({ companyId, fromISO, toISO, rangeLabel, kitchenWages, driverWages, kitchenShifts, onCorrectKitchenShift, onSourceChanged }: { companyId: string | null | undefined; fromISO: string; toISO: string; rangeLabel: string; kitchenWages: StaffWageSummary[]; driverWages: DriverWageSummary[]; kitchenShifts: KitchenShift[]; onCorrectKitchenShift: (shift: KitchenShift) => void; onSourceChanged: () => void }) {
  const currency = useTenantCurrency(companyId ?? null);
  const { withSlug } = useTenantHref();
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const load = async () => {
    if (!companyId || !fromISO || !toISO) return;
    setLoading(true); setError(null);
    try {
      const bounds = { from: new Date(fromISO), to: new Date(toISO), fromDay: toLocalISO(new Date(fromISO)), toDay: toLocalISO(new Date(toISO)) };
      const [profileRes, orderRes, sessionRes, payTypeRes, memberRes, dailyTaskRes, taskClockRes, kitchenTaskShiftRes, driverTaskShiftRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, role, active_role, hourly_rate").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("orders").select("id, order_number, event_name, event_date, assigned_driver_id, secondary_driver_id, assigned_chef_id").eq("company_id", companyId).gte("event_date", bounds.fromDay).lte("event_date", toLocalISO(new Date(bounds.to.getTime() - 1))).is("deleted_at", null),
        supabase.from("staff_work_sessions").select("id, staff_id, session_date, clock_in, clock_out, total_hours, total_earnings, payment_status, entered_manually, voided_at, voided_by_user_id, void_reason").eq("company_id", companyId).gte("clock_in", bounds.from.toISOString()).lt("clock_in", bounds.to.toISOString()),
        supabase.from("kitchen_staff_members").select("linked_profile_id, pay_type").eq("company_id", companyId).not("linked_profile_id", "is", null),
        supabase.from("kitchen_staff_members").select("id, linked_profile_id, full_name, email, role_title, departments, hourly_rate, pay_type").eq("company_id", companyId).is("deleted_at", null),
        (supabase as any).from("daily_operations_tasks").select("id, task_date, title, task_kind, status, assigned_to, started_at, completed_at, completed_by, payroll_session_id, notes").eq("company_id", companyId).gte("task_date", bounds.fromDay).lte("task_date", toLocalISO(new Date(bounds.to.getTime() - 1))),
        (supabase as any).from("role_work_sessions").select("id, user_id, role, daily_operation_task_id, started_at, ended_at").eq("company_id", companyId).not("daily_operation_task_id", "is", null).gte("started_at", new Date(bounds.from.getTime() - 24 * 60 * 60 * 1000).toISOString()).lt("started_at", bounds.to.toISOString()),
        supabase.from("kitchen_shifts").select("id, staff_id, staff_member_id, shift_date").eq("company_id", companyId).gte("shift_date", bounds.fromDay).lte("shift_date", toLocalISO(new Date(bounds.to.getTime() - 1))).is("deleted_at", null),
        supabase.from("driver_shifts").select("id, driver_id, shift_date").eq("company_id", companyId).gte("shift_date", bounds.fromDay).lte("shift_date", toLocalISO(new Date(bounds.to.getTime() - 1))).is("deleted_at", null),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (orderRes.error) throw orderRes.error;
      if (sessionRes.error) throw sessionRes.error;
      if (payTypeRes.error) throw payTypeRes.error;
      if (memberRes.error) throw memberRes.error;
      if (dailyTaskRes.error) throw dailyTaskRes.error;
      if (taskClockRes.error) throw taskClockRes.error;
      if (kitchenTaskShiftRes.error) throw kitchenTaskShiftRes.error;
      if (driverTaskShiftRes.error) throw driverTaskShiftRes.error;
      const profileMap = new Map<string, Profile>((profileRes.data || []).map((p) => [p.id, p as Profile]));
      const membersById = new Map<string, DirectoryMember>();
      const rosterKeyByProfileId = new Map<string, string>();
      const profilesByEmail = new Map<string, string[]>();
      for (const profile of profileRes.data || []) {
        const email = profile.email?.trim().toLowerCase();
        if (email) profilesByEmail.set(email, [...(profilesByEmail.get(email) || []), profile.id]);
      }
      const rosterEmailCounts = new Map<string, number>();
      for (const member of (memberRes.data || []) as DirectoryMember[]) {
        const email = member.email?.trim().toLowerCase();
        if (email) rosterEmailCounts.set(email, (rosterEmailCounts.get(email) || 0) + 1);
      }
      for (const member of (memberRes.data || []) as DirectoryMember[]) {
        membersById.set(member.id, member);
        const staffKey = member.linked_profile_id || `member:${member.id}`;
        const email = member.email?.trim().toLowerCase();
        const emailProfiles = email ? profilesByEmail.get(email) || [] : [];
        const ambiguousEmail = !member.linked_profile_id && !!email && ((rosterEmailCounts.get(email) || 0) > 1 || emailProfiles.length > 1);
        const matchingProfileId = member.linked_profile_id || (!ambiguousEmail && emailProfiles.length === 1 ? emailProfiles[0] : undefined);
        if (matchingProfileId && !member.linked_profile_id) rosterKeyByProfileId.set(matchingProfileId, staffKey);
        if (ambiguousEmail) {
          for (const profileId of emailProfiles) {
            const matchingProfile = profileMap.get(profileId);
            if (matchingProfile) profileMap.set(profileId, { ...matchingProfile, login_status: "ambiguous" });
          }
        }
        const existingProfile = profileMap.get(staffKey);
        profileMap.set(staffKey, {
          ...existingProfile,
          id: staffKey,
          full_name: existingProfile?.full_name || member.full_name,
          email: existingProfile?.email || member.email,
          role: existingProfile?.role || member.role_title || member.departments?.join(", ") || "Staff",
          active_role: existingProfile?.active_role || null,
          hourly_rate: existingProfile?.hourly_rate ?? member.hourly_rate,
          pay_type: existingProfile?.pay_type || member.pay_type,
          login_status: member.linked_profile_id ? "linked" : ambiguousEmail ? "ambiguous" : matchingProfileId ? "unlinked" : "none",
        });
      }
      const shiftOwners = new Map<string, { staffId: string; date: string }>();
      for (const shift of kitchenTaskShiftRes.data || []) {
        const member = shift.staff_member_id ? membersById.get(shift.staff_member_id) : null;
        const staffId = shift.staff_id || member?.linked_profile_id || (shift.staff_member_id ? `member:${shift.staff_member_id}` : null);
        if (staffId) shiftOwners.set(shift.id, { staffId, date: shift.shift_date || bounds.fromDay });
      }
      for (const shift of driverTaskShiftRes.data || []) if (shift.id && shift.driver_id) shiftOwners.set(shift.id, { staffId: shift.driver_id, date: shift.shift_date || bounds.fromDay });
      const shiftIds = Array.from(shiftOwners.keys());
      const shiftTaskRes = shiftIds.length
        ? await (supabase as any).from("staff_shift_tasks").select("id, shift_id, task_type, actual_start, actual_end, deleted_at").eq("company_id", companyId).in("shift_id", shiftIds).is("deleted_at", null)
        : { data: [], error: null };
      if (shiftTaskRes.error) throw shiftTaskRes.error;
      for (const row of (payTypeRes.data || []) as Array<{ linked_profile_id: string | null; pay_type: string | null }>) {
        if (!row.linked_profile_id || !profileMap.has(row.linked_profile_id)) continue;
        profileMap.set(row.linked_profile_id, { ...profileMap.get(row.linked_profile_id)!, pay_type: row.pay_type });
      }
      const orders = (orderRes.data || []) as Array<Order & { assigned_driver_id?: string | null; secondary_driver_id?: string | null; assigned_chef_id?: string | null }>;
      const orderMap = new Map(orders.map((order) => [order.id, order]));
      const taskClockById = new Map<string, any>();
      for (const clock of taskClockRes.data || []) {
        if (!clock.daily_operation_task_id) continue;
        const existing = taskClockById.get(clock.daily_operation_task_id);
        if (!existing || new Date(clock.started_at).getTime() < new Date(existing.started_at).getTime()) taskClockById.set(clock.daily_operation_task_id, clock);
      }
      const linkedTaskByPayrollSession = new Map<string, any>();
      for (const task of dailyTaskRes.data || []) if (task.payroll_session_id) linkedTaskByPayrollSession.set(task.payroll_session_id, task);
      const orderIds = orders.map((order) => order.id);
      const query = (table: string, select: string) => orderIds.length
        ? (supabase as any).from(table).select(select).eq("company_id", companyId).in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null });
      const [driverRes, waiterRes, kitchenRes, rosterShiftRes, driverShiftRes, contributorRes] = await Promise.all([
        query("driver_assignments", "id, order_id, driver_id, status, assigned_at, accepted_at, en_route_at, picked_up_at, delivered_at, completed_at"),
        query("event_attendance", "id, order_id, waiter_id, arrived_at, service_started_at, service_ended_at, event_complete_at"),
        query("kitchen_shifts", "id, order_id, staff_id, staff_member_id, shift_type, planned_start, planned_end, actual_start, actual_end, status"),
        supabase.from("kitchen_staff_shifts").select("id, staff_member_id, shift_start, shift_end, standard_min, overtime_min, sunday_holiday_min, total_break_min, break_started_at, department, deleted_at").eq("company_id", companyId).gte("shift_start", bounds.from.toISOString()).lt("shift_start", bounds.to.toISOString()).is("deleted_at", null),
        supabase.from("driver_shifts").select("*").eq("company_id", companyId).gte("shift_date", bounds.fromDay).lte("shift_date", toLocalISO(new Date(bounds.to.getTime() - 1))).is("deleted_at", null),
        query("order_work_contributors", "id, order_id, user_id, area, first_at, last_at"),
      ]);
      if (rosterShiftRes.error) throw rosterShiftRes.error;
      if (driverShiftRes.error) throw driverShiftRes.error;
      const rows: AuditLine[] = [];
      const add = (line: AuditLine) => {
        if (!line.staffId) return;
        rows.push({ ...line, staffId: rosterKeyByProfileId.get(line.staffId) || line.staffId });
      };
      const orderLabel = (id: string) => { const order = orderMap.get(id); return order ? `#${order.order_number || id.slice(0, 8)}${order.event_name ? ` · ${order.event_name}` : ""}` : "Order"; };
      const orderDay = (id: string, fallback: string | null) => orderMap.get(id)?.event_date || (fallback ? fallback.slice(0, 10) : bounds.fromDay);
      for (const task of dailyTaskRes.data || []) {
        const clock = taskClockById.get(task.id);
        const staffId = clock?.user_id || task.completed_by || task.assigned_to;
        if (!staffId) continue;
        const start = iso(clock?.started_at || task.started_at);
        const end = iso(task.completed_at || clock?.ended_at);
        const title = String(task.title || "Assigned job");
        add({ id: `daily-task:${task.id}`, staffId, date: task.task_date || bounds.fromDay, role: "task", orderId: null, orderLabel: `${title} · ${String(task.status || "scheduled").replace(/_/g, " ")}`, source: "Assigned job", start, end, hours: duration(start, end), needsReview: intervalNeedsReview(start, end), active: !!start && !end && task.status === "in_progress", earnings: 0, paymentStatus: task.status || "scheduled", sourceNotes: task.notes || null });
      }
      for (const task of shiftTaskRes.data || []) {
        const owner = shiftOwners.get(task.shift_id);
        if (!owner) continue;
        const start = iso(task.actual_start);
        const end = iso(task.actual_end);
        const label = String(task.task_type || "work").replace(/_/g, " ");
        const status = end ? "completed" : start ? "in progress" : "assigned";
        add({ id: `shift-task:${task.id}`, staffId: owner.staffId, date: owner.date, role: String(task.task_type || "task"), orderId: null, orderLabel: `${label} · ${status}`, source: "Shift task", start, end, hours: duration(start, end), needsReview: intervalNeedsReview(start, end), active: !!start && !end, earnings: 0, paymentStatus: status });
      }
      for (const row of (driverRes.data || []) as any[]) {
        // Assignment and acceptance timestamps are not proof that a
        // driver started work. Only en_route_at is an actual start;
        // otherwise future bookings were being reported as 100s of
        // worked hours and permanently open shifts.
        const start = iso(row.en_route_at || row.picked_up_at);
        const status = String(row.status || "").toLowerCase();
        const terminal = ["completed", "delivered", "cancelled", "canceled", "rejected"].includes(status);
        const recordedEnd = iso(row.completed_at || row.delivered_at);
        const inProgress = ["en_route", "picked_up", "at_venue"].includes(status);
        // A stale start timestamp on an assigned/accepted row is not an
        // active shift. Only statuses that mean the driver is on the trip
        // can keep an interval open in the audit.
        const end = recordedEnd || (start && (!inProgress || terminal) ? start : null);
        const active = !!start && !end && inProgress && !terminal;
        add({ id: `driver:${row.id}`, staffId: row.driver_id, date: orderDay(row.order_id, start), role: "driver", orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Driver assignment", start, end, hours: duration(start, end), needsReview: intervalNeedsReview(start, end), active, earnings: 0, paymentStatus: row.status || null });
      }
      for (const row of (waiterRes.data || []) as any[]) {
        const start = iso(row.arrived_at || row.service_started_at); const end = iso(row.event_complete_at || row.service_ended_at);
        add({ id: `waiter:${row.id}`, staffId: row.waiter_id, date: orderDay(row.order_id, start), role: "waiter", orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Event attendance", start, end, hours: duration(start, end), needsReview: intervalNeedsReview(start, end), active: !!start && !end, earnings: 0, paymentStatus: end ? "completed" : start ? "active" : "not clocked" });
      }
      for (const row of (kitchenRes.data || []) as any[]) {
        const roles = row.shift_type === "kitchen_and_cleaning" ? ["kitchen", "cleaning"] : [row.shift_type === "cleaning" ? "cleaning" : "kitchen"];
        const member = row.staff_member_id ? membersById.get(row.staff_member_id) : null;
        const staffId = row.staff_id || member?.linked_profile_id || (row.staff_member_id ? `member:${row.staff_member_id}` : null);
        for (const role of roles) {
          const start = iso(row.actual_start); const end = iso(row.actual_end);
          add({ id: `kitchen:${row.id}:${role}`, staffId, date: orderDay(row.order_id, start), role, orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Rostered shift", start, end, hours: duration(start, end), needsReview: intervalNeedsReview(start, end), active: !!start && !end && !["completed", "cancelled", "canceled"].includes(String(row.status || "").toLowerCase()), earnings: 0, paymentStatus: row.status || null });
        }
      }
      for (const shift of (rosterShiftRes.data || []) as Array<KitchenShift & { department?: string }>) {
        const start = iso(shift.shift_start);
        const end = iso(shift.shift_end);
        const member = membersById.get(shift.staff_member_id);
        const staffId = member?.linked_profile_id || `member:${shift.staff_member_id}`;
        const storedHours = ((Number(shift.standard_min) || 0) + (Number(shift.overtime_min) || 0) + (Number(shift.sunday_holiday_min) || 0)) / 60;
        const elapsedHours = exactDuration(start, end);
        const needsReview = needsKitchenShiftReview(shift);
        add({
          id: `roster-shift:${shift.id}`,
          staffId,
          date: start ? start.slice(0, 10) : bounds.fromDay,
          role: shift.department === "cleaning" ? "cleaning" : "kitchen",
          orderId: null,
          orderLabel: "Kitchen / cleaning roster shift",
          source: "Roster time clock",
          start,
          end,
          hours: needsReview ? (elapsedHours ?? 0) : storedHours || (elapsedHours ?? 0),
          recordedHours: storedHours,
          needsReview,
          active: !!start && !end,
          earnings: 0,
          paymentStatus: end ? "recorded" : "active",
        });
      }
      for (const shift of (driverShiftRes.data || []) as DriverShift[]) {
        const reviewReason = driverShiftReviewReason(shift)
          || (shift.actual_end && shift.status !== "completed" ? "Shift has clock-out time but is not marked completed" : null);
        const completed = shift.status === "completed";
        const staleOpen = shift.status === "active" && !shift.actual_end && !!reviewReason;
        const endedButNotCompleted = !!shift.actual_end && shift.status !== "completed" && !!reviewReason;
        if (!completed && !staleOpen && !endedButNotCompleted) continue;
        const start = iso(shift.actual_start);
        const end = iso(shift.actual_end);
        const elapsedHours = exactDuration(start, end);
        add({
          id: `driver-shift:${shift.id}`,
          staffId: shift.driver_id,
          date: shift.shift_date || (start ? start.slice(0, 10) : bounds.fromDay),
          role: "driver",
          orderId: null,
          orderLabel: shift.order_id ? orderLabel(shift.order_id) : "Driver payroll shift",
          source: "Driver payroll clock",
          start,
          end,
          hours: elapsedHours ?? Number(shift.hours_worked || 0),
          recordedHours: Number(shift.hours_worked || 0),
          needsReview: !!reviewReason,
          active: !!start && !end,
          earnings: 0,
          paymentStatus: shift.status,
        });
      }
      for (const row of (contributorRes.data || []) as any[]) {
        const start = iso(row.first_at); const end = iso(row.last_at); const role = String(row.area || "staff");
        add({ id: `contributor:${row.id}`, staffId: row.user_id, date: orderDay(row.order_id, start), role, orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Work activity", start, end, hours: duration(start, end), needsReview: intervalNeedsReview(start, end), active: !!start && !end, earnings: 0, paymentStatus: end ? "recorded" : start ? "active" : "recorded" });
      }
      for (const order of orders) {
        const fallbacks = [[order.assigned_driver_id, "driver"], [order.secondary_driver_id, "driver"], [order.assigned_chef_id, "kitchen"]] as Array<[string | null | undefined, string]>;
        for (const [staffId, role] of fallbacks) {
          if (!staffId || rows.some((row) => row.orderId === order.id && row.staffId === staffId && row.role === role)) continue;
          add({ id: `fallback:${order.id}:${staffId}:${role}`, staffId, date: order.event_date || bounds.fromDay, role, orderId: order.id, orderLabel: orderLabel(order.id), source: "Order assignment", start: null, end: null, hours: 0, active: false, earnings: 0, paymentStatus: "assigned" });
        }
      }
      for (const session of (sessionRes.data || []) as any[]) {
        const start = iso(session.clock_in); const end = iso(session.clock_out); const profile = profileMap.get(session.staff_id);
        const linkedTask = linkedTaskByPayrollSession.get(session.id);
        const recordedHours = Number(session.total_hours || 0);
        const clockHours = exactDuration(start, end);
        const needsReview = clockHours != null && (clockHours > 24 || Math.abs(recordedHours - clockHours) > 0.05);
        const taskSpecificClock = String(session.entry_reason || "").startsWith("daily_operations_task:");
        const paymentStatus = session.voided_at ? "voided" : session.payment_status || "unpaid";
        add({ id: `session:${session.id}`, staffId: session.staff_id, date: session.session_date || (start ? start.slice(0, 10) : bounds.fromDay), role: profile?.active_role || profile?.role || "staff", orderId: null, orderLabel: linkedTask ? String(linkedTask.title || "Assigned job") : "General/company shift", source: session.entered_manually ? "Manual payroll entry" : linkedTask ? "Assigned job payroll clock" : "Staff time clock", start, end, hours: clockHours ?? (recordedHours || duration(start, end)), recordedHours, needsReview, adminReview: paymentStatus !== "voided" ? !linkedTask && !taskSpecificClock ? "Not linked to an order or assigned job; confirm whether this is general shift work." : taskSpecificClock && !linkedTask ? "Task timer reference has no matching assigned job." : undefined : undefined, voidReason: session.void_reason || null, active: !!start && !end, earnings: Number(session.total_earnings || 0), paymentStatus });
      }
      if (rows.length === 0 && profileMap.size === 0) setError("No staff or order activity was found in the selected date range.");
      setProfiles(profileMap); setLines(rows.sort((a, b) => `${b.date}${b.start || ""}`.localeCompare(`${a.date}${a.start || ""}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the monthly payroll audit.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [companyId, fromISO, toISO]);

  const voidClockEntry = async (line: AuditLine) => {
    if (!line.id.startsWith("session:") || line.paymentStatus !== "unpaid" || !line.end) return;
    const reason = window.prompt("Why should this unpaid clock entry be voided? The reason will remain in its history.");
    if (!reason?.trim()) return;
    try {
      const { error } = await (supabase as any).rpc("void_staff_work_session", { p_session_id: line.id.slice("session:".length), p_reason: reason.trim() });
      if (error) throw error;
      toast({ title: "Clock entry voided", description: "It remains in history and is excluded from unpaid wage totals." });
      onSourceChanged();
      await load();
    } catch (error: any) {
      toast({ title: "Could not void clock entry", description: error?.message || "Review the settlement status and try again.", variant: "destructive" });
    }
  };

  const removeOrCorrectEntry = async (line: AuditLine) => {
    const requestReason = (label: string) => {
      const value = window.prompt(`Why are you removing or correcting this ${label}? The reason will be saved in history.`);
      if (!value?.trim() || value.trim().length < 5) {
        if (value != null) toast({ title: "Add a reason", description: "Enter at least 5 characters so the change is auditable.", variant: "destructive" });
        return null;
      }
      return value.trim();
    };

    if (line.id.startsWith("session:")) return voidClockEntry(line);
    if (line.id.startsWith("roster-shift:")) {
      const shift = kitchenShifts.find((item) => item.id === line.id.slice("roster-shift:".length));
      if (shift) onCorrectKitchenShift(shift);
      return;
    }
    const userResult = await supabase.auth.getUser();
    if (userResult.error) {
      toast({ title: "Could not verify your admin session", description: userResult.error.message, variant: "destructive" });
      return;
    }
    const actorUserId = userResult.data.user?.id || null;
    if (line.id.startsWith("shift-task:")) {
      const reason = requestReason("shift task");
      if (!reason) return;
      const result = await deleteTask(supabase as any, line.id.slice("shift-task:".length), actorUserId, reason);
      if (!result.ok) {
        toast({ title: "Could not remove task", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Shift task removed", description: "It was removed from the shift and logged for review." });
      onSourceChanged();
      await load();
      return;
    }
    if (line.id.startsWith("driver-shift:")) {
      const reason = requestReason("driver shift");
      if (!reason) return;
      const result = await driverPayService.deleteShift(line.id.slice("driver-shift:".length), supabase as any, actorUserId, reason);
      if (!result.ok) {
        toast({ title: "Could not remove driver shift", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Driver shift removed", description: "Wages will recalculate from the remaining active shifts." });
      onSourceChanged();
      await load();
      return;
    }
    if (line.id.startsWith("daily-task:") && line.paymentStatus === "scheduled" && !line.start) {
      const reason = requestReason("assigned job");
      if (!reason) return;
      const notes = [line.sourceNotes?.trim(), `Admin skipped: ${reason}`].filter(Boolean).join("\n");
      const { data, error } = await (supabase as any).from("daily_operations_tasks")
        .update({ status: "skipped", notes, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("id", line.id.slice("daily-task:".length))
        .eq("status", "scheduled")
        .is("started_at", null)
        .select("id")
        .maybeSingle();
      if (error) {
        toast({ title: "Could not cancel assigned job", description: error.message, variant: "destructive" });
        return;
      }
      if (!data) {
        toast({ title: "Job changed while you were reviewing it", description: "Reload the audit and review the latest job status.", variant: "destructive" });
        await load();
        return;
      }
      toast({ title: "Assigned job cancelled", description: "It is marked skipped with the reason kept in the job notes." });
      onSourceChanged();
      await load();
    }
  };

  const wagesByStaff = useMemo(() => {
    const map = new Map<string, WagesLedgerEntry>();
    for (const row of kitchenWages) {
      const staffId = row.linked_profile_id || `member:${row.staff_id}`;
      map.set(staffId, {
        hours: (row.standard_min + row.overtime_min + row.sunday_holiday_min) / 60,
        earnings: row.total_wage,
        source: "Kitchen / cleaning wages",
      });
    }
    for (const row of driverWages) {
      map.set(row.driver_id, {
        hours: row.hours,
        earnings: row.total,
        source: "Driver settlement",
        distanceKm: row.distance_km,
        hourlyPay: row.hourly_pay,
        distancePay: row.distance_pay,
        calloutPay: row.callout_pay,
      });
    }
    return map;
  }, [kitchenWages, driverWages]);

  const people = useMemo(() => {
    type PersonSummary = { lines: AuditLine[]; roles: Set<string>; days: Set<string>; orders: Set<string>; totalHours: number; payrollHours: number; payrollAmount: number; unpaidAmount: number; unpaidSessions: number; unpaidWithoutPay: number; open: boolean; wages: WagesLedgerEntry | null };
    const emptyPerson = (wages: WagesLedgerEntry | null = null): PersonSummary => ({ lines: [], roles: new Set<string>(), days: new Set<string>(), orders: new Set<string>(), totalHours: 0, payrollHours: 0, payrollAmount: 0, unpaidAmount: 0, unpaidSessions: 0, unpaidWithoutPay: 0, open: false, wages });
    const map = new Map<string, PersonSummary>();
    for (const line of lines) {
      const row = map.get(line.staffId) || emptyPerson(wagesByStaff.get(line.staffId) || null);
      row.lines.push(line); row.roles.add(line.role); row.days.add(line.date); if (line.orderId) row.orders.add(line.orderId);
      if (!line.orderId) {
        if (line.paymentStatus !== "voided") row.payrollAmount += line.earnings;
        if (line.paymentStatus !== "voided" && (line.paymentStatus === "unpaid" || line.paymentStatus === "pending")) {
          row.unpaidSessions += 1;
          row.unpaidAmount += line.earnings;
          if (line.earnings <= 0 && profiles.get(line.staffId)?.pay_type !== "monthly") row.unpaidWithoutPay += 1;
        }
      }
      if (line.active) row.open = true;
      map.set(line.staffId, row);
    }
    for (const [staffId, wages] of wagesByStaff) {
      const row = map.get(staffId) || emptyPerson(wages);
      row.wages = wages;
      map.set(staffId, row);
    }
    for (const row of map.values()) {
      row.totalHours = mergedHours(row.lines);
      row.payrollHours = mergedHours(row.lines.filter((line) => !line.orderId && line.source !== "Assigned job" && line.source !== "Shift task"));
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b.unpaidAmount - a.unpaidAmount || b.payrollHours - a.payrollHours);
  }, [lines, profiles, wagesByStaff]);
  const totals = useMemo(() => {
    const orderGroups = new Map<string, AuditLine[]>();
    for (const line of lines) {
      if (!line.orderId) continue;
      const key = `${line.staffId}:${line.orderId}`;
      orderGroups.set(key, [...(orderGroups.get(key) || []), line]);
    }
    return {
      totalHours: people.reduce((s, [, p]) => s + p.totalHours, 0),
      hours: people.reduce((s, [, p]) => s + p.payrollHours, 0),
      amount: people.reduce((s, [, p]) => s + p.payrollAmount, 0),
      unpaid: people.reduce((s, [, p]) => s + p.unpaidAmount, 0),
      unpaidWithoutPay: people.reduce((s, [, p]) => s + p.unpaidWithoutPay, 0),
      payrollSessionReviewCount: lines.filter((line) => !line.orderId && line.needsReview && line.paymentStatus !== "voided").length,
      orderIntervalReviewCount: lines.filter((line) => !!line.orderId && line.needsReview).length,
      unlinkedClockReviewCount: lines.filter((line) => !!line.adminReview && line.paymentStatus !== "voided").length,
      // Count distinct work time per staff member and order. Driver rows
      // often overlap with contributor/attendance rows for the same trip.
      orderHours: Array.from(orderGroups.values()).reduce((sum, group) => sum + mergedHours(group), 0),
      orderCount: new Set(lines.filter((l) => l.orderId).map((l) => l.orderId)).size,
    };
  }, [people, lines]);
  const exportCsv = () => {
    const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["Date", "Person", "Email", "Role", "Order", "Source", "Start", "End", "Activity hours", "Activity earnings", "Payment status", "Wages source", "Wages hours", "Wages gross", "Admin review", "Void reason", "Driver distance km", "Driver hourly pay", "Driver distance pay", "Driver callout pay"];
    const body = lines.map((line) => { const profile = profiles.get(line.staffId); const wages = wagesByStaff.get(line.staffId); return [line.date, staffName(profile, line.staffId), profile?.email, roleLabel(line.role), line.orderLabel, line.source, line.start, line.end, line.hours.toFixed(2), line.earnings.toFixed(2), line.paymentStatus, wages?.source, wages?.hours.toFixed(2), wages?.earnings.toFixed(2), line.adminReview, line.voidReason, wages?.distanceKm?.toFixed(1), wages?.hourlyPay?.toFixed(2), wages?.distancePay?.toFixed(2), wages?.calloutPay?.toFixed(2)]; });
    const blob = new Blob([[header, ...body].map((row) => row.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `payroll-order-audit-${boundsFilename(fromISO)}-${boundsFilename(toISO)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <Card className="min-w-0 border-slate-200 shadow-sm">
    <CardHeader className="border-b border-slate-100 p-3 sm:p-4 lg:p-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><CardTitle className="flex items-center gap-2 text-base sm:text-lg"><CalendarDays className="h-5 w-5 shrink-0 text-brand-primary" />Payroll &amp; order audit</CardTitle><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 sm:text-sm">Same date range as Wages ({rangeLabel}). Each person&apos;s official Wages hours and earnings are shown beside order intervals and clock activity.</p></div>
        <div className="flex w-full items-center gap-2 sm:w-auto"><span className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">{rangeLabel}</span>{error && !loading && <Button variant="outline" size="icon" onClick={() => void load()} title="Retry audit" aria-label="Retry audit" className="h-10 w-10 shrink-0"><RefreshCw className="h-4 w-4" /></Button>}<Button variant="outline" size="icon" onClick={exportCsv} disabled={lines.length === 0} title="Download audit CSV" aria-label="Download audit CSV" className="h-10 w-10 shrink-0"><Download className="h-4 w-4" /></Button></div>
      </div>
      {!loading && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><Metric icon={<Users className="h-4 w-4" />} label="People" value={String(people.length)} /><Metric icon={<Clock3 className="h-4 w-4" />} label="Total worked" value={hoursLabel(totals.totalHours)} /><Metric icon={<Clock3 className="h-4 w-4" />} label="Staff clock hours" value={hoursLabel(totals.hours)} /><Metric icon={<Banknote className="h-4 w-4" />} label="Staff session pay" value={formatZAR(totals.amount, { currency: currency.code })} /><Metric icon={<AlertTriangle className="h-4 w-4" />} label="Unpaid sessions" value={formatZAR(totals.unpaid, { currency: currency.code })} tone={totals.unpaid > 0 ? "amber" : "default"} /><Metric icon={<CalendarDays className="h-4 w-4" />} label="Order hours / orders" value={`${hoursLabel(totals.orderHours)} / ${totals.orderCount}`} /></div>}
    </CardHeader>
    <CardContent className="p-3 sm:p-4">
      {loading && <div className="py-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading the auditâ€¦</div>}
      {error && !loading && <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
      {!loading && !error && people.length === 0 && <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No payable or order-linked activity was found for {rangeLabel.toLowerCase()}.</div>}
      {!loading && people.length > 0 && <div className="space-y-4">
        {(totals.unpaidWithoutPay > 0 || totals.payrollSessionReviewCount > 0 || totals.orderIntervalReviewCount > 0 || totals.unlinkedClockReviewCount > 0) && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 sm:text-sm">{totals.unpaidWithoutPay > 0 && <p><strong>{totals.unpaidWithoutPay} unpaid clock session{totals.unpaidWithoutPay === 1 ? " has" : "s have"} no recorded earnings.</strong> Check the staff pay rate or correct the session before processing payment.</p>}{totals.payrollSessionReviewCount > 0 && <p><strong>{totals.payrollSessionReviewCount} payroll session{totals.payrollSessionReviewCount === 1 ? " has" : "s have"} a duration mismatch or exceeds 24 hours.</strong> Review and correct the clock record before payout.</p>}{totals.orderIntervalReviewCount > 0 && <p><strong>{totals.orderIntervalReviewCount} order activity interval{totals.orderIntervalReviewCount === 1 ? " exceeds" : "s exceed"} 24 hours or has invalid times.</strong> These intervals are flagged and excluded from worked-hour totals until reviewed.</p>}{totals.unlinkedClockReviewCount > 0 && <p><strong>{totals.unlinkedClockReviewCount} clock record{totals.unlinkedClockReviewCount === 1 ? " is" : "s are"} not linked to an order or assigned job.</strong> Review these to confirm whether they are general shift work or need correction.</p>}</div>}
        <div className="space-y-2 2xl:hidden">{people.map(([staffId, person]) => { const profile = profiles.get(staffId); const isOpen = expanded.has(staffId); const hasShiftReview = person.lines.some((line) => line.needsReview); const payment = hasShiftReview ? "Review shift" : person.unpaidWithoutPay > 0 ? "Unpaid · pay review" : person.unpaidAmount > 0 ? "Unpaid" : person.payrollAmount > 0 ? "Paid" : person.wages ? "Wages ledger" : person.payrollHours > 0 ? (profile?.pay_type === "monthly" ? "Salary model" : "Pay review") : "Order activity"; const toggle = () => setExpanded((current) => { const next = new Set(current); if (next.has(staffId)) next.delete(staffId); else next.add(staffId); return next; }); return <article key={staffId} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-slate-900">{staffName(profile, staffId)}</h3><p className="mt-0.5 break-all text-xs text-slate-500">{profile?.email || "No email recorded"}</p><WageCrossCheck wages={person.wages} currency={currency.code} />{profile?.login_status === "none" && <Badge variant="outline" className="mt-2 border-sky-200 bg-sky-50 text-xs text-sky-800">No login · roster tracked</Badge>}{profile?.login_status === "unlinked" && <Badge variant="outline" className="mt-2 border-amber-200 bg-amber-50 text-xs text-amber-800">Profile unlinked</Badge>}{profile?.login_status === "ambiguous" && <Badge variant="outline" className="mt-2 border-rose-200 bg-rose-50 text-xs text-rose-800">Email shared · review identity</Badge>}<div className="mt-2 flex flex-wrap gap-1">{Array.from(person.roles).map((role) => <Badge key={role} variant="outline" className="text-xs">{roleLabel(role)}</Badge>)}</div></div><Badge className={`shrink-0 text-xs ${hasShiftReview || person.unpaidAmount > 0 || person.unpaidWithoutPay > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}`}>{person.open ? "Open shift" : payment}</Badge></div>{hasShiftReview && <p className="mt-2 text-xs font-medium text-amber-800">Clock duration differs from the stored total or exceeds 24 hours.</p>}{person.open && <p className="mt-2 text-xs font-medium text-amber-700">Open shift needs review</p>}{person.unpaidWithoutPay > 0 && <p className="mt-2 text-xs font-medium text-amber-800">Unpaid session has no recorded pay. Review the pay setup before paying.</p>}{profile?.pay_type === "monthly" && person.payrollHours > 0 && person.payrollAmount === 0 && <p className="mt-2 text-xs text-slate-600">Monthly salary is handled in the Wages dashboard, not as per-session pay.</p>}<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><Metric icon={<Clock3 className="h-3.5 w-3.5" />} label="Total worked" value={hoursLabel(person.totalHours)} /><Metric icon={<Clock3 className="h-3.5 w-3.5" />} label={person.wages ? "Wages hours" : "Payroll hours"} value={hoursLabel(person.wages?.hours ?? person.payrollHours)} /><Metric icon={<Banknote className="h-3.5 w-3.5" />} label={person.wages ? "Wages gross" : "Recorded pay"} value={formatZAR(person.wages?.earnings ?? person.payrollAmount, { currency: currency.code })} /><Metric icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Unpaid" value={formatZAR(person.unpaidAmount, { currency: currency.code })} tone={person.unpaidAmount > 0 ? "amber" : "default"} /><Metric icon={<Users className="h-3.5 w-3.5" />} label="Days / orders" value={`${person.days.size} / ${person.orders.size}`} /></div><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" className="h-10 min-w-0 text-xs" onClick={toggle} aria-expanded={isOpen}>{isOpen ? <ChevronUp className="mr-1.5 h-4 w-4 shrink-0" /> : <ChevronDown className="mr-1.5 h-4 w-4 shrink-0" />}{isOpen ? "Hide details" : "Details"}</Button><Button asChild variant="outline" size="sm" className="h-10 min-w-0 text-xs"><Link href={"#wages-members-heading"}>Review pay</Link></Button></div>{isOpen && <div className="mt-3 border-t border-slate-100 pt-3"><DayRows lines={person.lines} currency={currency.code} onAction={removeOrCorrectEntry} /></div>}</article>; })}</div>
        <div className="hidden overflow-x-auto rounded-md border border-slate-200 2xl:block"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Roles</th><th className="px-3 py-2">Days / orders</th><th className="px-3 py-2">Total worked</th><th className="px-3 py-2">Wages hours</th><th className="px-3 py-2">Wages gross</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{people.map(([staffId, person]) => { const profile = profiles.get(staffId); const isOpen = expanded.has(staffId); const payment = person.unpaidWithoutPay > 0 ? "Unpaid · pay review" : person.unpaidAmount > 0 ? "Unpaid" : person.payrollAmount > 0 ? "Paid" : person.wages ? "Wages ledger" : person.payrollHours > 0 ? (profile?.pay_type === "monthly" ? "Salary model" : "Pay review") : "Order activity only"; const toggle = () => setExpanded((current) => { const next = new Set(current); if (next.has(staffId)) next.delete(staffId); else next.add(staffId); return next; }); return <Fragment key={staffId}>
          <tr key={staffId} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><div className="font-semibold text-slate-900">{staffName(profile, staffId)}</div><div className="text-xs text-slate-500">{profile?.email || "No email recorded"}</div><WageCrossCheck wages={person.wages} currency={currency.code} />{profile?.login_status === "none" && <Badge variant="outline" className="mt-1 border-sky-200 bg-sky-50 text-xs text-sky-800">No login · roster tracked</Badge>}{profile?.login_status === "unlinked" && <Badge variant="outline" className="mt-1 border-amber-200 bg-amber-50 text-xs text-amber-800">Profile unlinked</Badge>}{profile?.login_status === "ambiguous" && <Badge variant="outline" className="mt-1 border-rose-200 bg-rose-50 text-xs text-rose-800">Email shared · review identity</Badge>}</td><td className="px-3 py-3"><div className="flex max-w-[220px] flex-wrap gap-1">{Array.from(person.roles).map((role) => <Badge key={role} variant="outline" className="text-xs">{roleLabel(role)}</Badge>)}</div></td><td className="px-3 py-3 text-slate-600">{person.days.size} day{person.days.size === 1 ? "" : "s"} · {person.orders.size} order{person.orders.size === 1 ? "" : "s"}</td><td className="px-3 py-3 font-semibold tabular-nums text-slate-800">{hoursLabel(person.totalHours)}<div className="text-xs font-normal text-slate-500">Order + payroll, overlaps merged</div></td><td className="px-3 py-3 font-semibold tabular-nums text-slate-800">{hoursLabel(person.wages?.hours ?? person.payrollHours)}<div className="text-xs font-normal text-slate-500">{person.wages?.source || "Formal payroll clock"}</div></td><td className="px-3 py-3 font-semibold tabular-nums text-slate-800">{formatZAR(person.wages?.earnings ?? person.payrollAmount, { currency: currency.code })}<div className="text-xs font-normal text-slate-500">{person.wages ? "Official Wages gross" : `Unpaid: ${formatZAR(person.unpaidAmount, { currency: currency.code })}`}</div></td><td className="px-3 py-3"><Badge className={person.unpaidAmount > 0 || person.unpaidWithoutPay > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{payment}</Badge>{person.open && <div className="mt-1 text-xs text-amber-700">Open shift needs review</div>}</td><td className="px-3 py-3"><div className="flex gap-1"><Button variant="outline" size="sm" onClick={toggle}>{isOpen ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}Details</Button><Button asChild variant="outline" size="sm"><Link href={"#wages-members-heading"}>Review pay</Link></Button></div></td></tr>
          {isOpen && <tr className="bg-slate-50"><td colSpan={8} className="px-3 py-3"><DayRows lines={person.lines} currency={currency.code} onAction={removeOrCorrectEntry} /></td></tr>}
        </Fragment>; })}</tbody></table></div>
        <div><h3 className="mb-2 text-sm font-semibold text-slate-900">Day-wise order and payroll detail</h3><p className="mb-3 text-xs leading-5 text-slate-500">Wages hours and gross pay come from the Wages ledger for this exact date range. Expanded rows retain operational intervals and formal clock entries for review; activity totals can differ from payable ledger totals.</p></div>
      </div>}
    </CardContent>
  </Card>;
}

function Metric({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "amber" }) {
  return <div className={`min-w-0 rounded-md border px-2.5 py-2 sm:px-3 ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
    <div className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-slate-500">{icon}<span className="min-w-0 break-words">{label}</span></div>
    <div className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{value}</div>
  </div>;
}

function WageCrossCheck({ wages, currency }: { wages: WagesLedgerEntry | null; currency: string }) {
  if (!wages) return null;
  return <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50/70 px-2.5 py-2 text-xs text-indigo-950">
    <p className="font-semibold">Wages ledger · {wages.source}</p>
    <p className="mt-0.5">{hoursLabel(wages.hours)} payable · {formatZAR(wages.earnings, { currency })} gross</p>
    {wages.distanceKm != null && <p className="mt-0.5">{wages.distanceKm.toFixed(1)} km · hourly {formatZAR(wages.hourlyPay || 0, { currency })} · distance {formatZAR(wages.distancePay || 0, { currency })} · callout {formatZAR(wages.calloutPay || 0, { currency })}</p>}
  </div>;
}

function entryActionLabel(line: AuditLine): string | null {
  if (line.id.startsWith("session:") && line.paymentStatus === "unpaid" && line.end) return "Void clock";
  if (line.id.startsWith("roster-shift:")) return "Correct clock";
  if (line.id.startsWith("driver-shift:")) return "Remove shift";
  if (line.id.startsWith("shift-task:")) return "Remove task";
  if (line.id.startsWith("daily-task:") && line.paymentStatus === "scheduled" && !line.start) return "Cancel job";
  return null;
}

function DayRows({ lines, currency, onAction }: { lines: AuditLine[]; currency: string; onAction: (line: AuditLine) => void }) {
  const { withSlug } = useTenantHref();
  return <>
    <div className="space-y-2 2xl:hidden">
      {lines.map((line) => <article key={line.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="text-xs font-semibold text-slate-700">{formatDate(line.date, { year: true })}</p><p className="mt-1 break-words text-sm font-medium text-slate-900">{line.orderLabel}</p></div>
          <Badge variant="outline" className="max-w-full text-xs">{roleLabel(line.role)}</Badge>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div><span className="block text-slate-500">Source</span><span className="break-words font-medium text-slate-700">{line.source}</span></div>
          <div><span className="block text-slate-500">Clock time</span><span className="font-medium text-slate-700">{line.start ? `${timeLabel(line.start)} – ${line.end ? timeLabel(line.end) : "In progress"}` : "Not clocked"}</span></div>
          <div><span className="block text-slate-500">Hours / status</span><span className="font-medium tabular-nums text-slate-700">{hoursLabel(line.hours)}{line.active ? " so far" : ""}</span>{line.needsReview && <span className="block text-xs text-amber-800">{reviewLabel(line)}</span>}{line.adminReview && <span className="mt-1 block text-xs font-medium text-amber-800">Admin review: {line.adminReview}</span>}</div>
          <div className="col-span-2 sm:col-span-1"><span className="block text-slate-500">Status / pay</span><span className="break-words font-medium text-slate-700">{line.paymentStatus === "voided" ? `Voided · ${formatZAR(line.earnings, { currency })}` : line.earnings ? formatZAR(line.earnings, { currency }) : line.paymentStatus || "Review"}</span>{line.paymentStatus === "voided" && <span className="mt-1 block text-xs text-slate-600">{line.voidReason || "See entry history"}</span>}{entryActionLabel(line) && <Button type="button" variant="outline" size="sm" className={`mt-2 h-8 text-xs ${line.id.startsWith("roster-shift:") ? "text-blue-700" : "text-rose-700"}`} onClick={() => onAction(line)}>{entryActionLabel(line)}</Button>}{line.id.startsWith("daily-task:") && !entryActionLabel(line) && <Button asChild variant="outline" size="sm" className="mt-2 h-8 text-xs"><Link href={withSlug("/admin/daily-operations")}>Open Daily Operations</Link></Button>}{line.id.startsWith("session:") && line.paymentStatus === "paid" && <span className="mt-1 block text-xs text-slate-600">Paid already · settlement adjustment needed to void</span>}</div>
        </div>
      </article>)}
    </div>
    <div className="hidden overflow-x-auto rounded border border-slate-200 bg-white 2xl:block">
      <table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Day</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Order / work</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Clock time</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Pay status</th></tr></thead>
        <tbody>{lines.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium">{formatDate(line.date, { year: true })}</td><td className="px-3 py-2"><Badge variant="outline">{roleLabel(line.role)}</Badge></td><td className="px-3 py-2"><div className="font-medium text-slate-800">{line.orderLabel}</div><div className="text-xs text-slate-500">{line.orderId ? "Order-linked work" : line.source === "Assigned job" || line.source === "Assigned job payroll clock" || line.source === "Shift task" ? "Assigned job work" : "Not linked to an order or assigned job"}</div></td><td className="px-3 py-2 text-slate-600">{line.source}</td><td className="px-3 py-2 text-slate-600">{line.start ? `${timeLabel(line.start)} – ${line.end ? timeLabel(line.end) : "In progress"}` : "Not clocked"}</td><td className="px-3 py-2 font-semibold tabular-nums">{hoursLabel(line.hours)}{line.active && <span className="ml-1 text-amber-700">so far</span>}{line.needsReview && <span className="block text-xs font-normal text-amber-800">{reviewLabel(line)}</span>}{line.adminReview && <span className="mt-1 block text-xs font-medium text-amber-800">Admin review: {line.adminReview}</span>}</td><td className="px-3 py-2">{line.paymentStatus === "voided" ? `Voided · ${formatZAR(line.earnings, { currency })}` : line.earnings ? formatZAR(line.earnings, { currency }) : line.paymentStatus || "Review"}{line.paymentStatus === "voided" && <span className="block text-xs text-slate-600">{line.voidReason || "See entry history"}</span>}{line.id.startsWith("session:") && line.paymentStatus === "paid" && <span className="block text-xs text-slate-600">Paid already · settlement adjustment needed to void</span>}{entryActionLabel(line) && <Button type="button" variant="outline" size="sm" className={`mt-1 h-8 text-xs ${line.id.startsWith("roster-shift:") ? "text-blue-700" : "text-rose-700"}`} onClick={() => onAction(line)}>{entryActionLabel(line)}</Button>}{line.id.startsWith("daily-task:") && !entryActionLabel(line) && <Button asChild variant="outline" size="sm" className="mt-1 h-8 text-xs"><Link href={withSlug("/admin/daily-operations")}>Open Daily Operations</Link></Button>}</td></tr>)}</tbody></table>
      </div>
  </>;
}

export default MonthlyPayrollAudit;
