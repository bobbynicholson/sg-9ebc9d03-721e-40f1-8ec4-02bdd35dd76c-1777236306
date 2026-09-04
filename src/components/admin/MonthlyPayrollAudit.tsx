/* Admin-only monthly workforce and order audit. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, CalendarDays, ChevronDown, ChevronUp, Clock3, Download, Loader2, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatZAR } from "@/lib/formatters";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";

type Profile = { id: string; full_name: string | null; email: string | null; role: string | null; active_role: string | null; hourly_rate: number | null };
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
  active: boolean;
  earnings: number;
  paymentStatus: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  driver: "Driver", waiter: "Waiter / service", kitchen: "Kitchen", kitchen_staff: "Kitchen staff", kitchen_manager: "Kitchen manager",
  cleaning: "Cleaning", cleaning_staff: "Cleaning staff", cleaning_manager: "Cleaning manager", shopping: "Shopping", shopping_staff: "Shopping staff", buyer: "Buyer",
};
const roleLabel = (role: string) => ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const monthInput = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthBounds = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  const from = new Date(year, value - 1, 1);
  const to = new Date(year, value, 1);
  return { from, to, fromDay: `${month}-01`, toDay: `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-01` };
};
const iso = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const duration = (start: string | null, end: string | null) => {
  if (!start) return 0;
  const stop = end ? new Date(end).getTime() : Date.now();
  const begin = new Date(start).getTime();
  return Number.isFinite(begin) && Number.isFinite(stop) ? Math.max(0, (stop - begin) / 3_600_000) : 0;
};
const hoursLabel = (hours: number) => `${hours.toFixed(1)}h`;
const timeLabel = (value: string | null) => value ? new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

function mergedHours(lines: AuditLine[]): number {
  const intervals = lines
    .filter((line) => line.start)
    .map((line) => ({ start: new Date(line.start as string).getTime(), end: new Date(line.end || new Date()).getTime() }))
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

export function MonthlyPayrollAudit({ companyId }: { companyId: string | null | undefined }) {
  const { withSlug } = useTenantHref();
  const currency = useTenantCurrency(companyId ?? null);
  const [month, setMonth] = useState(monthInput());
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [lines, setLines] = useState<AuditLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!companyId || !month) return;
    setLoading(true); setError(null);
    try {
      const bounds = monthBounds(month);
      const [profileRes, orderRes, sessionRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, role, active_role, hourly_rate").eq("company_id", companyId).is("deleted_at", null),
        supabase.from("orders").select("id, order_number, event_name, event_date, assigned_driver_id, secondary_driver_id, assigned_chef_id").eq("company_id", companyId).gte("event_date", bounds.fromDay).lt("event_date", bounds.toDay).is("deleted_at", null),
        supabase.from("staff_work_sessions").select("id, staff_id, session_date, clock_in, clock_out, total_hours, total_earnings, payment_status, entered_manually").eq("company_id", companyId).gte("clock_in", bounds.from.toISOString()).lt("clock_in", bounds.to.toISOString()),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (orderRes.error) throw orderRes.error;
      if (sessionRes.error) throw sessionRes.error;
      const profileMap = new Map<string, Profile>((profileRes.data || []).map((p) => [p.id, p as Profile]));
      const orders = (orderRes.data || []) as Array<Order & { assigned_driver_id?: string | null; secondary_driver_id?: string | null; assigned_chef_id?: string | null }>;
      const orderMap = new Map(orders.map((order) => [order.id, order]));
      const orderIds = orders.map((order) => order.id);
      const query = (table: string, select: string) => orderIds.length
        ? (supabase as any).from(table).select(select).eq("company_id", companyId).in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null });
      const [driverRes, waiterRes, kitchenRes, contributorRes] = await Promise.all([
        query("driver_assignments", "id, order_id, driver_id, status, assigned_at, accepted_at, en_route_at, completed_at"),
        query("event_attendance", "id, order_id, waiter_id, arrived_at, service_started_at, service_ended_at, event_complete_at"),
        query("kitchen_shifts", "id, order_id, staff_id, shift_type, planned_start, planned_end, actual_start, actual_end, status"),
        query("order_work_contributors", "id, order_id, user_id, area, first_at, last_at"),
      ]);
      const rows: AuditLine[] = [];
      const add = (line: AuditLine) => { if (line.staffId) rows.push(line); };
      const orderLabel = (id: string) => { const order = orderMap.get(id); return order ? `#${order.order_number || id.slice(0, 8)}${order.event_name ? ` · ${order.event_name}` : ""}` : "Order"; };
      const orderDay = (id: string, fallback: string | null) => orderMap.get(id)?.event_date || (fallback ? fallback.slice(0, 10) : bounds.fromDay);
      for (const row of (driverRes.data || []) as any[]) {
        const start = iso(row.en_route_at || row.accepted_at || row.assigned_at); const end = iso(row.completed_at);
        add({ id: `driver:${row.id}`, staffId: row.driver_id, date: orderDay(row.order_id, start), role: "driver", orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Driver assignment", start, end, hours: duration(start, end), active: !end, earnings: 0, paymentStatus: row.status || null });
      }
      for (const row of (waiterRes.data || []) as any[]) {
        const start = iso(row.arrived_at || row.service_started_at); const end = iso(row.event_complete_at || row.service_ended_at);
        add({ id: `waiter:${row.id}`, staffId: row.waiter_id, date: orderDay(row.order_id, start), role: "waiter", orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Event attendance", start, end, hours: duration(start, end), active: !end, earnings: 0, paymentStatus: end ? "completed" : "active" });
      }
      for (const row of (kitchenRes.data || []) as any[]) {
        const roles = row.shift_type === "kitchen_and_cleaning" ? ["kitchen", "cleaning"] : [row.shift_type === "cleaning" ? "cleaning" : "kitchen"];
        for (const role of roles) {
          const start = iso(row.actual_start); const end = iso(row.actual_end);
          add({ id: `kitchen:${row.id}:${role}`, staffId: row.staff_id, date: orderDay(row.order_id, start), role, orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Rostered shift", start, end, hours: duration(start, end), active: !end, earnings: 0, paymentStatus: row.status || null });
        }
      }
      for (const row of (contributorRes.data || []) as any[]) {
        const start = iso(row.first_at); const end = iso(row.last_at); const role = String(row.area || "staff");
        add({ id: `contributor:${row.id}`, staffId: row.user_id, date: orderDay(row.order_id, start), role, orderId: row.order_id, orderLabel: orderLabel(row.order_id), source: "Work activity", start, end, hours: duration(start, end), active: false, earnings: 0, paymentStatus: "recorded" });
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
        add({ id: `session:${session.id}`, staffId: session.staff_id, date: session.session_date || (start ? start.slice(0, 10) : bounds.fromDay), role: profile?.active_role || profile?.role || "staff", orderId: null, orderLabel: "General/company shift", source: session.entered_manually ? "Manual payroll entry" : "Staff time clock", start, end, hours: Number(session.total_hours || duration(start, end)), active: !end, earnings: Number(session.total_earnings || 0), paymentStatus: session.payment_status || "unpaid" });
      }
      if (rows.length === 0 && profileMap.size === 0) setError("No staff or order activity was found for this month.");
      setProfiles(profileMap); setLines(rows.sort((a, b) => `${b.date}${b.start || ""}`.localeCompare(`${a.date}${a.start || ""}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the monthly payroll audit.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [companyId, month]);

  const people = useMemo(() => {
    const map = new Map<string, { lines: AuditLine[]; roles: Set<string>; days: Set<string>; orders: Set<string>; totalHours: number; payrollHours: number; payrollAmount: number; unpaidAmount: number; open: boolean }>();
    for (const line of lines) {
      const row = map.get(line.staffId) || { lines: [], roles: new Set<string>(), days: new Set<string>(), orders: new Set<string>(), totalHours: 0, payrollHours: 0, payrollAmount: 0, unpaidAmount: 0, open: false };
      row.lines.push(line); row.roles.add(line.role); row.days.add(line.date); if (line.orderId) row.orders.add(line.orderId);
      if (!line.orderId) { row.payrollHours += line.hours; row.payrollAmount += line.earnings; if (line.paymentStatus === "unpaid" || line.paymentStatus === "pending") row.unpaidAmount += line.earnings; }
      if (line.active) row.open = true;
      map.set(line.staffId, row);
    }
    for (const row of map.values()) row.totalHours = mergedHours(row.lines);
    return Array.from(map.entries()).sort(([, a], [, b]) => b.unpaidAmount - a.unpaidAmount || b.payrollHours - a.payrollHours);
  }, [lines]);
  const totals = useMemo(() => ({ totalHours: people.reduce((s, [, p]) => s + p.totalHours, 0), hours: people.reduce((s, [, p]) => s + p.payrollHours, 0), amount: people.reduce((s, [, p]) => s + p.payrollAmount, 0), unpaid: people.reduce((s, [, p]) => s + p.unpaidAmount, 0), orderHours: lines.filter((l) => l.orderId).reduce((s, l) => s + l.hours, 0), orderCount: new Set(lines.filter((l) => l.orderId).map((l) => l.orderId)).size }), [people, lines]);
  const exportCsv = () => {
    const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["Date", "Person", "Email", "Role", "Order", "Source", "Start", "End", "Hours", "Earnings", "Payment status"];
    const body = lines.map((line) => { const profile = profiles.get(line.staffId); return [line.date, staffName(profile, line.staffId), profile?.email, roleLabel(line.role), line.orderLabel, line.source, line.start, line.end, line.hours.toFixed(2), line.earnings.toFixed(2), line.paymentStatus]; });
    const blob = new Blob([[header, ...body].map((row) => row.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `monthly-payroll-audit-${month}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <Card className="border-slate-200 shadow-sm">
    <CardHeader className="border-b border-slate-100 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-brand-primary" />Monthly payroll &amp; order audit</CardTitle><p className="mt-1 max-w-2xl text-sm text-slate-600">Admin-only view of every person who worked in the company or on an order, grouped by day with role, order, hours, and payment status.</p></div>
        <div className="flex items-center gap-2"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[150px]" aria-label="Audit month" /><Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} title="Refresh audit"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button><Button variant="outline" size="icon" onClick={exportCsv} disabled={lines.length === 0} title="Download CSV"><Download className="h-4 w-4" /></Button></div>
      </div>
      {!loading && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6"><Metric icon={<Users className="h-4 w-4" />} label="People" value={String(people.length)} /><Metric icon={<Clock3 className="h-4 w-4" />} label="Total worked" value={hoursLabel(totals.totalHours)} /><Metric icon={<Clock3 className="h-4 w-4" />} label="Payroll hours" value={hoursLabel(totals.hours)} /><Metric icon={<Banknote className="h-4 w-4" />} label="Payroll recorded" value={formatZAR(totals.amount, { currency: currency.code })} /><Metric icon={<AlertTriangle className="h-4 w-4" />} label="Unpaid" value={formatZAR(totals.unpaid, { currency: currency.code })} tone={totals.unpaid > 0 ? "amber" : "default"} /><Metric icon={<CalendarDays className="h-4 w-4" />} label="Order hours / orders" value={`${hoursLabel(totals.orderHours)} / ${totals.orderCount}`} /></div>}
    </CardHeader>
    <CardContent className="p-4">
      {loading && <div className="py-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading the monthly audit…</div>}
      {error && !loading && <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
      {!loading && !error && people.length === 0 && <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No payable or order-linked activity was found for {month}.</div>}
      {!loading && people.length > 0 && <div className="space-y-4">
        <div className="overflow-x-auto rounded-md border border-slate-200"><table className="w-full min-w-[1020px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Roles</th><th className="px-3 py-2">Days / orders</th><th className="px-3 py-2">Total worked</th><th className="px-3 py-2">Payroll hours</th><th className="px-3 py-2">Recorded pay</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{people.map(([staffId, person]) => { const profile = profiles.get(staffId); const isOpen = expanded.has(staffId); const payment = person.unpaidAmount > 0 ? "Ready to review" : person.payrollAmount > 0 ? "Paid / no unpaid ledger" : "Order activity only"; return <>
          <tr key={staffId} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><div className="font-semibold text-slate-900">{staffName(profile, staffId)}</div><div className="text-[10px] text-slate-500">{profile?.email || "No email recorded"}</div></td><td className="px-3 py-3"><div className="flex max-w-[220px] flex-wrap gap-1">{Array.from(person.roles).map((role) => <Badge key={role} variant="outline" className="text-[10px]">{roleLabel(role)}</Badge>)}</div></td><td className="px-3 py-3 text-slate-600">{person.days.size} day{person.days.size === 1 ? "" : "s"} · {person.orders.size} order{person.orders.size === 1 ? "" : "s"}</td><td className="px-3 py-3 font-semibold tabular-nums text-slate-800">{hoursLabel(person.totalHours)}<div className="text-[10px] font-normal text-slate-500">Order + payroll, overlaps merged</div></td><td className="px-3 py-3 font-semibold tabular-nums text-slate-800">{hoursLabel(person.payrollHours)}<div className="text-[10px] font-normal text-slate-500">Formal payroll clock</div></td><td className="px-3 py-3 font-semibold tabular-nums text-slate-800">{formatZAR(person.payrollAmount, { currency: currency.code })}<div className="text-[10px] font-normal text-slate-500">Unpaid: {formatZAR(person.unpaidAmount, { currency: currency.code })}</div></td><td className="px-3 py-3"><Badge className={person.unpaidAmount > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{payment}</Badge>{person.open && <div className="mt-1 text-[10px] text-amber-700">Open shift needs review</div>}</td><td className="px-3 py-3"><div className="flex gap-1"><Button variant="outline" size="sm" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(staffId)) next.delete(staffId); else next.add(staffId); return next; })}>{isOpen ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}Details</Button><Button asChild variant="outline" size="sm"><Link href={withSlug(`/admin/staff-hours?staff=${staffId}`)}>Review pay</Link></Button></div></td></tr>
          {isOpen && <tr key={`${staffId}:detail`} className="bg-slate-50"><td colSpan={7} className="px-3 py-3"><DayRows lines={person.lines} profiles={profiles} currency={currency.code} /></td></tr>}
        </>; })}</tbody></table></div>
        <div><h3 className="mb-2 text-sm font-semibold text-slate-900">Day-wise order and payroll detail</h3><p className="mb-3 text-xs text-slate-500">Expand a person above to inspect every day, role, order, clock interval, and payment status. Order hours are shown separately from formal payroll hours so the admin can reconcile before paying.</p></div>
      </div>}
    </CardContent>
  </Card>;
}

function Metric({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: string; tone?: "default" | "amber" }) { return <div className={`rounded-md border px-3 py-2 ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">{icon}{label}</div><div className="mt-1 text-base font-semibold tabular-nums text-slate-900">{value}</div></div>; }

function DayRows({ lines, profiles, currency }: { lines: AuditLine[]; profiles: Map<string, Profile>; currency: string }) { return <div className="overflow-x-auto rounded border border-slate-200 bg-white"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Day</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Order / work</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Clock time</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">Pay status</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium">{formatDate(line.date, { year: true })}</td><td className="px-3 py-2"><Badge variant="outline">{roleLabel(line.role)}</Badge></td><td className="px-3 py-2"><div className="font-medium text-slate-800">{line.orderLabel}</div><div className="text-[10px] text-slate-500">{line.orderId ? "Order-linked work" : "Not linked to an order"}</div></td><td className="px-3 py-2 text-slate-600">{line.source}</td><td className="px-3 py-2 text-slate-600">{line.start ? `${timeLabel(line.start)} – ${line.end ? timeLabel(line.end) : "active"}` : "Not clocked"}</td><td className="px-3 py-2 font-semibold tabular-nums">{hoursLabel(line.hours)}{line.active && <span className="ml-1 text-amber-700">so far</span>}</td><td className="px-3 py-2">{line.earnings ? formatZAR(line.earnings, { currency }) : line.paymentStatus || "Review"}</td></tr>)}</tbody></table></div>; }

export default MonthlyPayrollAudit;
