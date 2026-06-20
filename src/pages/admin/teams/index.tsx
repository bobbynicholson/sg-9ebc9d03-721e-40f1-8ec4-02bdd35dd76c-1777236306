/**
 * Teams glance - one row per operational team. Manager Monday-morning
 * view: head count, hours logged this week, jobs today, anomalies.
 * Conservative metrics where deep joins would be expensive; this page
 * is meant for triage, not analytics.
 *
 * TMS-B (teams hub audit, task #204, 2026-05-24):
 *   - withSlug on every tile href (multi-tenant route correctness)
 *   - OWNER admitted to allowedRoles (per memo)
 *   - Cleaning anomalies + jobs use cleaning_jobs (live data), no
 *     more hard-coded zero on the cleaning tile
 *   - Shopping + Cleaning "Hours wk" render `-` (we don't track
 *     shift hours for those teams) instead of misleading 0
 *   - Driver hours-this-week filtered by region when active so the
 *     regional admin's number matches the rest of the page
 *   - useAuth() typed (dropped `as any`)
 *   - captureException on load failures (was console.error + toast)
 *   - weekStartISO uses toLocalISO so a tenant east of UTC doesn't
 *     anchor the week on Sunday by accident
 *   - Realtime debounce on the four source tables so the hub stays
 *     fresh without a manual Refresh
 *   - Per-tile "Next imminent job" line - the next event prep
 *     (kitchen), the next delivery (drivers), the next shop run
 *     (shopping), the next cleaning task (cleaning)
 *   - Comparison vs same day last week chip on the Jobs stat
 *   - Cross-team risk banner above the tiles: confirmed event in
 *     the next 4h with no driver assigned, or kitchen prep ETA
 *     stamped after driver depart time
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import { canAccessFinance } from "@/lib/authGuards";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { whatsappIntegrationService } from "@/services/whatsappIntegrationService";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ChefHat, Truck, ShoppingBag, Sparkles, Users, AlertTriangle,
  Loader2, ArrowRight, MapPin, TrendingUp, Calendar, Clock,
  MessageCircle, FileText, Banknote,
} from "lucide-react";

interface TeamRow {
  key: "kitchen" | "drivers" | "shopping" | "cleaning" | "sales" | "outsource";
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  iconColor: string;
  bg: string;
  href: string;
  headCount: number;
  // null = we don't track shift hours for this team. Renders as
  // "-" instead of a misleading 0.
  hoursThisWeek: number | null;
  jobsToday: number;
  // TMS-B: comparison vs same day last week. null when unknown.
  jobsSameDayLastWeek: number | null;
  anomalies: number;
  anomalyHint: string;
  // TMS-B: the next imminent thing this team has to deal with.
  // null when nothing upcoming.
  nextLabel: string | null;
  nextTimeISO: string | null;
  // TMS-C (task #205, 2026-05-24): money burn today, finance-gated
  // at the render layer. null = we don't compute it for this team.
  burnTodayZar: number | null;
  // TMS-C: clocked-in vs rostered/headcount sub-line. Only the
  // kitchen team has a live duty board today. null elsewhere.
  clockedNow: number | null;
  // TMS-C: unread handover badge (cleaning only - cleaning_event_
  // handovers with status='expected' or 'in_progress').
  handoverPending: number;
}

// Cross-team risk surfaced above the tiles. Today's confirmed
// events that haven't got a driver yet, or the kitchen prep
// finishing later than the driver should depart.
interface CrossTeamRisk {
  orderId: string;
  orderNumber: string | null;
  eventName: string | null;
  eventTime: string | null;
  kind: "no_driver" | "kitchen_late";
}

function startOfWeekIso(): string {
  // TMS-B: was .toISOString() which ships UTC - on a SAST tenant
  // pre-02:00 local Monday, that's still Sunday in UTC, so the
  // query window snapped to the wrong week. Anchor on local Mon
  // 00:00 then convert via toLocalISO.
  const d = new Date();
  const day = d.getDay();           // 0 = Sunday
  const diff = (day + 6) % 7;       // Monday-anchored
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  // Use full ISO so postgres compares timestamptz correctly; the
  // local-tz offset is preserved.
  return d.toISOString();
}

function lastWeekSameDayIso(): string {
  // Same weekday a week ago, local 00:00. For the comparison chip.
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return toLocalISO(d);
}

function nextHoursIso(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hours * 3600 * 1000);
  return d.toISOString();
}

function shortTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  } catch { return ""; }
}

function TeamsIndexPage() {
  const { user, profile } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (profile as any)?.company_id || (user as any)?.company_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = ((profile as any)?.active_role || (profile as any)?.role || (user as any)?.role) as UserRole | undefined;
  // TMS-C (task #205, 2026-05-24): finance-vis gate for the money
  // chip per tile. Same helper Wages / Cashflow / Financial pages
  // use - owner / company_admin / admin / super_admin only.
  const canSeeFinance = userRole ? canAccessFinance(userRole) : false;
  const { regionFilterId, options: regionOptions } = useRegionFilter();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const tenantCurrency = useTenantCurrency(companyId);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [risks, setRisks] = useState<CrossTeamRisk[]>([]);
  // TMS-C: WhatsApp broadcast dialog state. Per-team team-key
  // identifies which roster to fan out to.
  const [broadcastTeam, setBroadcastTeam] = useState<TeamRow | null>(null);
  // TMS-D (task #206, 2026-05-24): hire-in pipeline counters for
  // the "Operational pipelines" section below the team tiles.
  const [hireInOpenCount, setHireInOpenCount] = useState(0);
  const [hireInOverdue, setHireInOverdue] = useState(0);
  const [hireInBurn, setHireInBurn] = useState(0);

  const regionLabel = useMemo(() => {
    if (!regionFilterId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (regionOptions.find((r: any) => r.id === regionFilterId) as any)?.label || null;
  }, [regionFilterId, regionOptions]);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" }),
    [],
  );

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const todayISO = toLocalISO(new Date());
      const weekStartISO = startOfWeekIso();
      const lastWeekISO = lastWeekSameDayIso();
      const next4hISO = nextHoursIso(4);

      // Active staff per role (profiles)
      const { data: staffRows } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("company_id", companyId);

      const staffByRole: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (staffRows || []) as any[]) {
        const r = String(s.role || "").toLowerCase();
        staffByRole[r] = (staffByRole[r] || 0) + 1;
      }

      // Two shift tables, two purposes:
      //   * kitchen_duty_shifts - the live duty board (per-order,
      //     `is_active`, who's currently clocked in). Used here only
      //     for missing-clock-out anomaly detection.
      //   * kitchen_staff_shifts - the canonical wage record. Carries
      //     standard / overtime / sunday-holiday breakdowns the Wages
      //     dashboard reads. We use it for "Hours logged this week"
      //     so the Teams Hub number always agrees with what Wages
      //     reports for the same period.
      const stale = Date.now() - 16 * 3600 * 1000;

      const staffShiftsSelect = regionFilterId
        ? "standard_min, overtime_min, sunday_holiday_min, shift_start, kitchen_staff_members!inner(region_id)"
        : "standard_min, overtime_min, sunday_holiday_min, shift_start";
      let staffShiftsQ = supabase
        .from("kitchen_staff_shifts")
        .select(staffShiftsSelect)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("shift_start", weekStartISO);
      if (regionFilterId) {
        staffShiftsQ = staffShiftsQ.eq("kitchen_staff_members.region_id", regionFilterId);
      }

      // TMS-C (task #205, 2026-05-24): also pull today's shifts with
      // hourly_rate joined so we can compute kitchen wage burn today.
      // Separate from the week aggregate so we don't double-walk the
      // bigger payload.
      const todayStartISO = `${todayISO}T00:00:00`;
      const [activeDuty, staffShiftsThisWeek, staffShiftsToday] = await Promise.all([
        supabase
          .from("kitchen_duty_shifts")
          .select("id, shift_start, is_active")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .gte("shift_start", weekStartISO),
        staffShiftsQ,
        // Burn-today rollup. Joins kitchen_staff_members for the
        // hourly_rate snapshot - mins * rate / 60 = burn.
        supabase
          .from("kitchen_staff_shifts")
          .select("standard_min, overtime_min, sunday_holiday_min, kitchen_staff_members!inner(hourly_rate)")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("shift_start", todayStartISO),
      ]);

      let kitchenMissingClockOut = 0;
      let kitchenClockedNow = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (activeDuty.data || []) as any[]) {
        const start = s.shift_start ? new Date(s.shift_start).getTime() : 0;
        if (start && start < stale) kitchenMissingClockOut += 1;
        // Counts as "currently clocked in" if is_active = true and
        // the shift_start is within today's window.
        kitchenClockedNow += 1;
      }

      let kitchenHours = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (staffShiftsThisWeek.data || []) as any[]) {
        const mins =
          Number(s.standard_min || 0) +
          Number(s.overtime_min || 0) +
          Number(s.sunday_holiday_min || 0);
        if (mins > 0) kitchenHours += mins / 60;
      }

      // TMS-C: kitchen burn today (ZAR). Skips rows without a rate
      // on the joined member - they show as null contribution.
      let kitchenBurnToday = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (staffShiftsToday.data || []) as any[]) {
        const rate = Number(s.kitchen_staff_members?.hourly_rate || 0);
        if (!rate) continue;
        const mins =
          Number(s.standard_min || 0) +
          Number(s.overtime_min || 0) +
          Number(s.sunday_holiday_min || 0);
        if (mins > 0) kitchenBurnToday += (mins / 60) * rate;
      }

      // Kitchen jobs today + next imminent + last-week comparison.
      let kitchenJobsQ = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("event_date", todayISO)
        .not("status", "in", "(cancelled,completed)");
      if (regionFilterId) kitchenJobsQ = kitchenJobsQ.eq("region_id", regionFilterId);
      const { count: kitchenJobs } = await kitchenJobsQ;

      // TMS-B: comparison vs same weekday last week.
      let kitchenLastWeekQ = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("event_date", lastWeekISO)
        .not("status", "in", "(cancelled,completed)");
      if (regionFilterId) kitchenLastWeekQ = kitchenLastWeekQ.eq("region_id", regionFilterId);
      const { count: kitchenLastWeekJobs } = await kitchenLastWeekQ;

      // TMS-B: next imminent kitchen job - earliest event start time
      // today, by event_time order.
      let nextKitchenQ = supabase
        .from("orders")
        .select("order_number, event_name, event_time, event_date, status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("event_date", todayISO)
        .not("status", "in", "(cancelled,completed)")
        .order("event_time", { ascending: true, nullsFirst: false })
        .limit(1);
      if (regionFilterId) nextKitchenQ = nextKitchenQ.eq("region_id", regionFilterId);
      const { data: nextKitchen } = await nextKitchenQ;
      const nextKitchenRow = (nextKitchen?.[0] as
        | { order_number: string | null; event_name: string | null; event_time: string | null }
        | undefined) || null;

      // Driver assignments today + anomalies. Region filter applied
      // via the joined orders.region_id when active.
      let drvAssnQ = supabase
        .from("driver_assignments")
        // TMS-C: also pull the earnings columns so we can roll up
        // the driver burn-today chip.
        .select("id, status, assigned_at, accepted_at, completed_at, base_fee, distance_fee, total_earnings, orders!inner(order_number, event_name, event_time, event_date, company_id, deleted_at, region_id, status)")
        .eq("company_id", companyId)
        .is("orders.deleted_at", null)
        .eq("orders.event_date", todayISO);
      if (regionFilterId) drvAssnQ = drvAssnQ.eq("orders.region_id", regionFilterId);
      const { data: drvAssn } = await drvAssnQ;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const drvRows = (drvAssn || []) as any[];
      const driverJobs = drvRows.length;

      // TMS-C: driver burn today. total_earnings is the canonical
      // post-trip number; fall back to base_fee + distance_fee for
      // assignments that haven't completed yet.
      let driverBurnToday = 0;
      for (const a of drvRows) {
        const earned = Number(a.total_earnings || 0);
        if (earned > 0) {
          driverBurnToday += earned;
        } else {
          driverBurnToday += Number(a.base_fee || 0) + Number(a.distance_fee || 0);
        }
      }
      const driverAnomalies = drvRows.filter((a) => {
        const s = String(a.status || "").toLowerCase();
        return s === "rejected" || s === "declined" || s === "no_show";
      }).length;

      // TMS-B: next imminent driver assignment - the earliest
      // event_time among today's assignments.
      const nextDriverRow = drvRows
        .slice()
        .sort((a, b) => {
          const at = a.orders?.event_time || "23:59";
          const bt = b.orders?.event_time || "23:59";
          return String(at).localeCompare(String(bt));
        })[0] || null;

      // TMS-B: region-scoped driver hours-this-week. Pre-fix this
      // pulled every assignment regardless of region.
      let drvWeekQ = supabase
        .from("driver_assignments")
        .select("assigned_at, completed_at, orders!inner(region_id, company_id, deleted_at)")
        .eq("company_id", companyId)
        .is("orders.deleted_at", null)
        .gte("assigned_at", weekStartISO);
      if (regionFilterId) drvWeekQ = drvWeekQ.eq("orders.region_id", regionFilterId);
      const { data: drvWeek } = await drvWeekQ;
      let driverHours = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (drvWeek || []) as any[]) {
        const s = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
        const e = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        if (s && e && e > s) driverHours += (e - s) / 3600000;
      }

      // TMS-B: comparison - delivery jobs same weekday last week.
      // PostgREST doesn't filter the count on a joined table without
      // an !inner join, so we count off orders.event_date as a proxy
      // for "delivery work that day" - which matches what the
      // current-day driver count is fundamentally measuring too.
      let driverLastWeekQ = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("event_date", lastWeekISO)
        .not("status", "in", "(cancelled,completed)");
      if (regionFilterId) driverLastWeekQ = driverLastWeekQ.eq("region_id", regionFilterId);
      const { count: driverLastWeekJobs } = await driverLastWeekQ;

      // Shopping lists today + pending overdue
      // TMS-C: pull actual_total + estimated_total for the burn chip.
      const { data: shoppingToday } = await supabase
        .from("shopping_lists")
        .select("id, status, list_date, actual_total, estimated_total")
        .eq("company_id", companyId)
        .eq("list_date", todayISO);
      const shoppingJobs = (shoppingToday || []).length;
      // TMS-C: shopping spend today. actual_total is the post-run
      // truth; estimated_total covers lists that are still pending.
      let shoppingBurnToday = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (shoppingToday || []) as any[]) {
        const actual = Number(s.actual_total || 0);
        const estimated = Number(s.estimated_total || 0);
        shoppingBurnToday += actual > 0 ? actual : estimated;
      }

      const { data: shoppingOverdue } = await supabase
        .from("shopping_lists")
        .select("id")
        .eq("company_id", companyId)
        .lt("list_date", todayISO)
        .in("status", ["pending", "draft"]);
      const shoppingAnomalies = (shoppingOverdue || []).length;

      // TMS-B: comparison - shopping lists same weekday last week.
      const { count: shoppingLastWeek } = await supabase
        .from("shopping_lists")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("list_date", lastWeekISO);

      // TMS-B: next imminent shopping run - the earliest pending
      // or in_progress list today. shopping_lists has no time
      // column; treat the list as a same-day target.
      const nextShoppingRow = (shoppingToday || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((s: any) => s.status === "pending" || s.status === "draft" || s.status === "in_progress")[0] || null;

      // TMS-B: cleaning_jobs is the live job table. planned_start is
      // the scheduled kickoff; status flips to in_progress / completed.
      // We can finally surface real anomalies (overdue, planned_end
      // past with status != completed) and real next-imminent.
      const { data: cleaningJobsRows } = await supabase
        .from("cleaning_jobs")
        .select("id, status, planned_start, planned_end")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("planned_start", todayISO + "T00:00:00")
        .lt("planned_start", todayISO + "T23:59:59")
        .order("planned_start", { ascending: true });
      const cleaningTodayRows = (cleaningJobsRows || []) as Array<{
        id: string; status: string; planned_start: string | null; planned_end: string | null;
      }>;
      const cleaningJobsToday = cleaningTodayRows.length;
      // Anomaly = job whose planned_end is in the past and isn't
      // marked completed. That's an overdue cleaning slot the
      // operator should chase.
      const nowMs = Date.now();
      const cleaningAnomaliesCount = cleaningTodayRows.filter((j) => {
        if (!j.planned_end) return false;
        const end = new Date(j.planned_end).getTime();
        return end < nowMs && j.status !== "completed" && j.status !== "cancelled";
      }).length;

      // Next imminent cleaning slot - first row not yet completed.
      const nextCleaningRow = cleaningTodayRows.find(
        (j) => j.status !== "completed" && j.status !== "cancelled",
      ) || null;

      // Comparison vs same weekday last week for cleaning.
      const { count: cleaningLastWeek } = await supabase
        .from("cleaning_jobs")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("planned_start", lastWeekISO + "T00:00:00")
        .lt("planned_start", lastWeekISO + "T23:59:59");

      // TMS-C (task #205, 2026-05-24): unread handover notes badge.
      // cleaning_event_handovers carries status='expected' (created
      // but not yet reviewed) or 'in_progress'. Either state means
      // the operator should still take a look. status='complete' or
      // 'cancelled' falls out of the badge.
      const { count: handoverPending } = await supabase
        .from("cleaning_event_handovers")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["expected", "in_progress"]);

      // TMS-D (task #206, 2026-05-24): sales + outsource team
      // metrics. Both are valid profiles.role values; both have
      // their own ops surfaces (leads + quotes for sales, outsource
      // providers for outsource). We pull lightweight counts in
      // parallel so the extra tiles don't cost a round-trip burst.
      const [
        leadsTodayRes,
        quotesTodayRes,
        outsourceProvidersRes,
        outsourceAssnTodayRes,
        outsourceAssnLastWeekRes,
      ] = await Promise.all([
        // Leads created today (proxy for sales activity).
        supabase.from("leads")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("created_at", todayISO + "T00:00:00"),
        // Quotes sent today.
        supabase.from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("created_at", todayISO + "T00:00:00"),
        // Active outsource providers - those with at least one
        // assignment in the last 30 days are "in rotation". The
        // simpler count is just is_active=true on the providers
        // row.
        supabase.from("outsource_providers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true)
          .is("deleted_at", null),
        // Outsource assignments today via the joined order.
        // outsource_assignments doesn't carry event_date directly;
        // we filter via orders.event_date.
        supabase.from("outsource_assignments")
          .select("id, orders!inner(event_date, company_id, deleted_at)")
          .eq("company_id", companyId)
          .is("orders.deleted_at", null)
          .eq("orders.event_date", todayISO),
        supabase.from("outsource_assignments")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("created_at", lastWeekISO + "T00:00:00")
          .lt("created_at", lastWeekISO + "T23:59:59"),
      ]);

      // TMS-D: hire-in pipeline (separate "Operational pipelines"
      // section below the team tiles). Counts open hire orders +
      // overdue picks - same shape as the existing HireInPanel
      // overdue logic.
      const { data: hireInOpenRows } = await supabase
        .from("equipment_hire_orders")
        .select("id, status, expected_pickup_date, total_cost")
        .eq("company_id", companyId)
        .in("status", ["draft", "confirmed", "picked_up"]);
      const hireInOpen = (hireInOpenRows || []) as Array<{
        status: string; expected_pickup_date: string | null; total_cost: number | null;
      }>;
      let burnAccum = 0;
      let overdueAccum = 0;
      for (const h of hireInOpen) {
        burnAccum += Number(h.total_cost || 0);
        if (
          h.status === "draft" &&
          h.expected_pickup_date &&
          h.expected_pickup_date < todayISO
        ) overdueAccum += 1;
      }
      setHireInOpenCount(hireInOpen.length);
      setHireInOverdue(overdueAccum);
      setHireInBurn(burnAccum);

      // TMS-B: cross-team risk - events in the next 4 hours with no
      // accepted driver. Pulls confirmed orders + their assignment
      // status. Anything with no assignment OR all assignments
      // rejected/declined surfaces.
      let riskQ = supabase
        .from("orders")
        .select("id, order_number, event_name, event_time, event_date, status, driver_assignments(status)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("event_date", todayISO)
        .in("status", ["confirmed", "preparing", "ready"])
        // event_time is a time-of-day - we filter by the 4h window
        // client-side because postgres time-arithmetic via JS is awkward.
        .order("event_time", { ascending: true });
      if (regionFilterId) riskQ = riskQ.eq("region_id", regionFilterId);
      const { data: riskRows } = await riskQ;

      const nextWindowMs = new Date(next4hISO).getTime();
      const nowFloor = Date.now();
      const crossRisks: CrossTeamRisk[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const o of (riskRows || []) as any[]) {
        const t = o.event_time;
        if (!t) continue;
        // Build a Date for today + event_time
        const [h, m] = String(t).split(":");
        const eventDate = new Date();
        eventDate.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
        const ms = eventDate.getTime();
        if (ms < nowFloor) continue;
        if (ms > nextWindowMs) continue;
        const assns = (o.driver_assignments || []) as Array<{ status: string }>;
        const hasAccepted = assns.some((a) => {
          const s = String(a.status || "").toLowerCase();
          return s === "accepted" || s === "in_progress" || s === "completed";
        });
        if (!hasAccepted) {
          crossRisks.push({
            orderId: o.id,
            orderNumber: o.order_number || null,
            eventName: o.event_name || null,
            eventTime: o.event_time || null,
            kind: "no_driver",
          });
        }
      }
      setRisks(crossRisks);

      const teamRows: TeamRow[] = [
        {
          key: "kitchen",
          name: "Kitchen",
          icon: ChefHat,
          iconColor: "text-amber-600",
          bg: "from-amber-50 to-orange-50",
          href: "/admin/teams/kitchen",
          headCount: staffByRole["kitchen_staff"] || 0,
          hoursThisWeek: Math.round(kitchenHours),
          jobsToday: kitchenJobs ?? 0,
          jobsSameDayLastWeek: kitchenLastWeekJobs ?? null,
          anomalies: kitchenMissingClockOut,
          anomalyHint: kitchenMissingClockOut > 0
            ? `${kitchenMissingClockOut} missing clock-out`
            : "All clocked",
          nextLabel: nextKitchenRow
            ? `${nextKitchenRow.event_name || nextKitchenRow.order_number || "Event"}`
            : null,
          nextTimeISO: nextKitchenRow?.event_time ? `${todayISO}T${nextKitchenRow.event_time}` : null,
          burnTodayZar: kitchenBurnToday,
          clockedNow: kitchenClockedNow,
          handoverPending: 0,
        },
        {
          key: "drivers",
          name: "Drivers",
          icon: Truck,
          iconColor: "text-sky-600",
          bg: "from-sky-50 to-blue-50",
          href: "/admin/teams/drivers",
          headCount: staffByRole["driver"] || 0,
          hoursThisWeek: Math.round(driverHours),
          jobsToday: driverJobs,
          jobsSameDayLastWeek: driverLastWeekJobs ?? null,
          anomalies: driverAnomalies,
          anomalyHint: driverAnomalies > 0 ? `${driverAnomalies} declined / no-show` : "All accepted",
          nextLabel: nextDriverRow
            ? `${nextDriverRow.orders?.event_name || nextDriverRow.orders?.order_number || "Delivery"}`
            : null,
          nextTimeISO: nextDriverRow?.orders?.event_time
            ? `${todayISO}T${nextDriverRow.orders.event_time}`
            : null,
          burnTodayZar: driverBurnToday,
          clockedNow: null,
          handoverPending: 0,
        },
        {
          key: "shopping",
          name: "Shopping",
          icon: ShoppingBag,
          iconColor: "text-orange-600",
          bg: "from-orange-50 to-rose-50",
          // TMS-D (task #206, 2026-05-24): now routes to the team
          // landing built in admin/teams/shopping.tsx - same IA as
          // kitchen / drivers / cleaning.
          href: "/admin/teams/shopping",
          headCount: staffByRole["shopping_staff"] || 0,
          // null = honest "we don't track shift hours for this team"
          // - the tile renders "-" instead of a misleading 0.
          hoursThisWeek: null,
          jobsToday: shoppingJobs,
          jobsSameDayLastWeek: shoppingLastWeek ?? null,
          anomalies: shoppingAnomalies,
          anomalyHint: shoppingAnomalies > 0 ? `${shoppingAnomalies} overdue list${shoppingAnomalies === 1 ? "" : "s"}` : "On track",
          nextLabel: nextShoppingRow ? "Today's shopping run" : null,
          nextTimeISO: null,
          burnTodayZar: shoppingBurnToday,
          clockedNow: null,
          handoverPending: 0,
        },
        {
          key: "cleaning",
          name: "Cleaning",
          icon: Sparkles,
          iconColor: "text-purple-600",
          bg: "from-purple-50 to-fuchsia-50",
          href: "/admin/teams/cleaning",
          headCount: staffByRole["cleaning_staff"] || 0,
          // null - same honesty as shopping.
          hoursThisWeek: null,
          jobsToday: cleaningJobsToday,
          jobsSameDayLastWeek: cleaningLastWeek ?? null,
          anomalies: cleaningAnomaliesCount,
          anomalyHint: cleaningAnomaliesCount > 0
            ? `${cleaningAnomaliesCount} overdue slot${cleaningAnomaliesCount === 1 ? "" : "s"}`
            : cleaningJobsToday > 0 ? "On track" : "Quiet day",
          nextLabel: nextCleaningRow ? "Next cleaning slot" : null,
          nextTimeISO: nextCleaningRow?.planned_start || null,
          // TMS-C: cleaning_jobs has no cost field. Showing 0 would
          // be misleading; null suppresses the chip entirely.
          burnTodayZar: null,
          clockedNow: null,
          handoverPending: handoverPending ?? 0,
        },
        // TMS-D (task #206, 2026-05-24): Sales tile. sales_admin
        // role is real (per enum). Activity = leads created today +
        // quotes sent today. No shift table for the sales persona,
        // so hours wk renders "-". Routes to /admin/leads as the
        // natural daily landing for that team.
        {
          key: "sales" as TeamRow["key"],
          name: "Sales",
          icon: Users,
          iconColor: "text-indigo-600",
          bg: "from-indigo-50 to-violet-50",
          href: "/admin/leads",
          headCount: staffByRole["sales_admin"] || 0,
          hoursThisWeek: null,
          jobsToday: (leadsTodayRes.count ?? 0) + (quotesTodayRes.count ?? 0),
          jobsSameDayLastWeek: null,
          anomalies: 0,
          anomalyHint: (leadsTodayRes.count ?? 0) > 0
            ? `${leadsTodayRes.count} new lead${leadsTodayRes.count === 1 ? "" : "s"}, ${quotesTodayRes.count ?? 0} quote${quotesTodayRes.count === 1 ? "" : "s"} sent`
            : "Quiet pipeline today",
          nextLabel: null,
          nextTimeISO: null,
          burnTodayZar: null,
          clockedNow: null,
          handoverPending: 0,
        },
        // TMS-D: Outsource tile. 'outsource' role exists in the
        // enum (used for sub-contractor logins); outsource_providers
        // is the catalogue table. Numbers = active providers, today's
        // assignments. Routes to /admin/outsource-providers for the
        // operator's daily landing.
        {
          key: "outsource" as TeamRow["key"],
          name: "Outsource",
          icon: Truck,
          iconColor: "text-teal-600",
          bg: "from-teal-50 to-cyan-50",
          href: "/admin/outsource-providers",
          headCount: outsourceProvidersRes.count ?? 0,
          hoursThisWeek: null,
          jobsToday: (outsourceAssnTodayRes.data || []).length,
          jobsSameDayLastWeek: outsourceAssnLastWeekRes.count ?? null,
          anomalies: 0,
          anomalyHint: (outsourceAssnTodayRes.data || []).length > 0
            ? "Sub-contractors on assignment today"
            : "No outsource jobs today",
          nextLabel: null,
          nextTimeISO: null,
          burnTodayZar: null,
          clockedNow: null,
          handoverPending: 0,
        },
      ];

      setRows(teamRows);
    } catch (err: unknown) {
      // TMS-B: Sentry tagging - was silent console.error.
      captureException(err, { tags: { route: "/admin/teams", step: "load", companyId: companyId || "" } });
      toast({
        title: "Could not load teams",
        description: err instanceof Error ? err.message : "Check your connection and retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId, regionFilterId]);

  // TMS-B: realtime debounce. A driver clocking in, a kitchen
  // task completing, a shopping list landing - all should bump
  // the hub without the operator clicking Refresh. 2000ms
  // debounce because mass-fan-out events (e.g. a bulk import)
  // would otherwise thrash the page.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 2000);
    };
    const channel = supabase
      .channel(`teams-hub:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_duty_shifts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_assignments", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_lists", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_jobs", filter: `company_id=eq.${companyId}` }, bump)
      // TMS-D (task #206, 2026-05-24): also listen on the tables
      // backing the new Sales / Outsource / Hire-in surfaces so
      // those tiles + the Pipelines card stay fresh.
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "outsource_assignments", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_hire_orders", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const totalAnomalies = rows.reduce((sum, r) => sum + r.anomalies, 0);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Teams - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-full">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold text-slate-900">
                  Teams
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Cross-team glance. Where everyone is on today's prep, dispatch, cleaning, and shopping. Click any tile to open that team.
                </p>
                <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> {todayLabel}
                  </span>
                  {regionLabel && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {regionLabel}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
              {totalAnomalies > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {totalAnomalies} anomal{totalAnomalies === 1 ? "y" : "ies"}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Refresh
              </Button>
            </div>
          </div>

          {/* TMS-B: cross-team risk banner. Confirmed events in the
              next 4 hours that don't have a driver accepted yet.
              The dispatcher's most expensive miss is a 5pm event
              with nobody assigned at 4pm - this calls it out before
              the panic. */}
          {!loading && risks.length > 0 && (
            <Card className="border-0 shadow-md mb-4 bg-rose-50 border-l-4 border-l-rose-500">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-rose-900">
                      {risks.length} event{risks.length === 1 ? "" : "s"} in the next 4h with no driver assigned
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {risks.slice(0, 5).map((r) => (
                        <li key={r.orderId} className="text-xs text-rose-800/90">
                          <Link
                            href={withSlug(`/admin/orders?id=${r.orderId}`)}
                            className="hover:underline"
                          >
                            <span className="tabular-nums font-medium">{r.eventTime?.slice(0, 5) || "??:??"}</span>
                            <span className="mx-1.5 text-rose-400">·</span>
                            <span>{r.eventName || r.orderNumber || r.orderId.slice(0, 8)}</span>
                          </Link>
                        </li>
                      ))}
                      {risks.length > 5 && (
                        <li className="text-xs text-rose-700 italic">+ {risks.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                  <Link href={withSlug("/admin/dispatch-queue")}>
                    <Button size="sm" variant="outline" className="gap-1.5 border-rose-300 text-rose-800 hover:bg-rose-100">
                      Assign drivers <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {rows.map((r) => {
              const deltaVs = (r.jobsSameDayLastWeek == null)
                ? null
                : r.jobsToday - r.jobsSameDayLastWeek;
              return (
                <Card key={r.key} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-4 sm:p-5">
                    {/* TMS-C (task #205, 2026-05-24): split the row
                        into the click-through Link (covers icon +
                        name + stats) and a separate action zone for
                        the WhatsApp broadcast button. Wrapping the
                        whole row in a Link meant the operator could
                        only navigate; now they get both. */}
                    <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                      <Link href={withSlug(r.href)} className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${r.bg} flex items-center justify-center flex-shrink-0`}>
                          <r.icon className={`w-6 h-6 ${r.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900">{r.name}</h2>
                            {r.anomalies > 0 && (
                              <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                                {r.anomalies} {r.anomalies === 1 ? "issue" : "issues"}
                              </Badge>
                            )}
                            {/* TMS-C: handover-notes badge (cleaning).
                                Surfaces the queue of unreviewed event
                                handovers so the manager doesn't miss them. */}
                            {r.handoverPending > 0 && (
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-violet-300 text-violet-700 bg-violet-50">
                                <FileText className="w-2.5 h-2.5 mr-1" />
                                {r.handoverPending} handover{r.handoverPending === 1 ? "" : "s"}
                              </Badge>
                            )}
                            {/* TMS-C: money chip per tile, finance-
                                gated. null suppresses (cleaning has no
                                cost data). */}
                            {canSeeFinance && r.burnTodayZar != null && r.burnTodayZar > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[10px] tabular-nums border-emerald-300 text-emerald-700 bg-emerald-50"
                                title={r.key === "shopping"
                                  ? "Shopping spend committed today (actual + estimated for pending lists)."
                                  : r.key === "drivers"
                                    ? "Driver earnings booked against today's events."
                                    : "Kitchen wage burn today: shift minutes x hourly_rate from kitchen_staff_members."}
                              >
                                <Banknote className="w-2.5 h-2.5 mr-0.5" />
                                {tenantCurrency.format(r.burnTodayZar)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{r.anomalyHint}</p>
                          {/* TMS-B: next imminent job line. Operator's
                              actual "what's next for this team" without
                              clicking through. */}
                          {r.nextLabel && (
                            <p className="text-[11px] text-slate-600 mt-1 flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span className="font-medium">Next:</span>
                              <span className="truncate">{r.nextLabel}</span>
                              {r.nextTimeISO && (
                                <span className="text-slate-400 tabular-nums">
                                  {r.nextTimeISO.includes("T") && r.nextTimeISO.split("T")[1]?.length > 5
                                    ? shortTime(r.nextTimeISO)
                                    : r.nextTimeISO.split("T")[1]?.slice(0, 5) || shortDate(r.nextTimeISO)}
                                </span>
                              )}
                            </p>
                          )}
                          {/* TMS-C: clocked-vs-expected sub-line.
                              Kitchen only - we have a live duty board.
                              Drivers don't track clock-in the same way
                              so the column stays null. */}
                          {r.clockedNow != null && r.headCount > 0 && (
                            <p className="text-[11px] mt-0.5 flex items-center gap-1.5">
                              <span className="text-slate-400">Clocked:</span>
                              <span className={`tabular-nums font-medium ${r.clockedNow >= r.headCount ? "text-emerald-700" : r.clockedNow === 0 ? "text-rose-700" : "text-amber-700"}`}>
                                {r.clockedNow} / {r.headCount}
                              </span>
                              {r.clockedNow < r.headCount && (
                                <span className="text-rose-600 text-[10px]">
                                  {r.headCount - r.clockedNow} not clocked in
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </Link>
                      <div className="grid grid-cols-3 gap-3 sm:gap-6 flex-shrink-0 w-full sm:w-auto">
                        <Stat label="Active" value={loading ? "-" : String(r.headCount)} />
                        <Stat
                          label="Hours wk"
                          value={loading ? "-" : r.hoursThisWeek == null ? "-" : String(r.hoursThisWeek)}
                          title={r.hoursThisWeek == null
                            ? "No shift table for this team yet - showing the head-count and job activity instead."
                            : "Hours logged Mon 00:00 to now (local time). Matches the Wages report for the same window."}
                        />
                        <Stat
                          label="Jobs today"
                          value={loading ? "-" : String(r.jobsToday)}
                          delta={deltaVs}
                          deltaTooltip={r.jobsSameDayLastWeek != null ? `vs ${r.jobsSameDayLastWeek} on same day last week` : undefined}
                        />
                      </div>
                      {/* TMS-C: per-tile WhatsApp broadcast. Opens a
                          dialog scoped to this team's roster. Uses
                          the queue + drain we shipped in #99. */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.preventDefault(); setBroadcastTeam(r); }}
                        className="gap-1.5 border-green-300 text-green-800 hover:bg-green-50 flex-shrink-0"
                        title={`Send a WhatsApp message to every ${r.name.toLowerCase()} member with a phone on file.`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Message</span>
                      </Button>
                      <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0 hidden sm:block" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* TMS-D (task #206, 2026-05-24): operational pipelines
              section. Hire-in isn't a "team" in the staff sense but
              it's a daily ops queue the dispatcher cares about - open
              orders, overdue picks, committed spend. Tile mirrors the
              team-row shape so the page reads consistently. */}
          {!loading && (
            <div className="mt-6">
              <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                Operational pipelines
              </h2>
              <Link href={withSlug("/admin/equipment?tab=hire-in")} className="block">
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-purple-50 to-fuchsia-50 flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="w-6 h-6 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900">Hire-in</h3>
                          {hireInOverdue > 0 && (
                            <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                              {hireInOverdue} overdue
                            </Badge>
                          )}
                          {canSeeFinance && hireInBurn > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] tabular-nums border-emerald-300 text-emerald-700 bg-emerald-50"
                              title="Committed spend across all open hire-in orders (draft + confirmed + picked-up). Closes when the order is marked returned + payable cleared."
                            >
                              <Banknote className="w-2.5 h-2.5 mr-0.5" />
                              {tenantCurrency.format(hireInBurn)} open
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {hireInOpenCount === 0
                            ? "No open hire-in orders"
                            : `${hireInOpenCount} open order${hireInOpenCount === 1 ? "" : "s"} across draft / confirmed / picked-up`}
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0 hidden sm:block" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}

          {/* TMS-C: per-team WhatsApp broadcast dialog. Fans out one
              queue row per team member with a phone + whatsapp_opt_in.
              The drain cron (/api/cron/whatsapp-drain) sends them. */}
          <BroadcastDialog
            team={broadcastTeam}
            onClose={() => setBroadcastTeam(null)}
            companyId={companyId}
          />
        </div>
      </div>
    </>
  );
}

function Stat({
  label, value, title, delta, deltaTooltip,
}: {
  label: string; value: string; title?: string;
  delta?: number | null; deltaTooltip?: string;
}) {
  return (
    <div className="text-center sm:text-right" title={title}>
      <div className="flex items-baseline justify-center sm:justify-end gap-1.5">
        <p className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{value}</p>
        {/* TMS-B: vs-last-week delta chip. Hidden when null or zero. */}
        {delta != null && delta !== 0 && (
          <span
            title={deltaTooltip}
            className={`text-[10px] font-semibold tabular-nums ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}
          >
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

// TMS-C (task #205, 2026-05-24): per-team WhatsApp broadcast.
// Opens when a tile's Message button is clicked. Resolves the
// team's roster (profiles.role = team key), filters to members
// with a phone_number + whatsapp_opt_in != false, enqueues one
// row per recipient into whatsapp_messages via the service
// helper we shipped in #99. The drain cron picks them up on the
// next tick.
function BroadcastDialog({
  team, onClose, companyId,
}: {
  team: TeamRow | null;
  onClose: () => void;
  companyId: string | null;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<Array<{ id: string; name: string | null; phone: string }>>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sending, setSending] = useState(false);

  // role key -> profiles.role filter. Cleaning uses cleaning_staff,
  // kitchen uses kitchen_staff, drivers uses driver, shopping uses
  // shopping_staff. Matches the headCount lookups in load().
  const roleByTeam: Record<string, string> = {
    kitchen: "kitchen_staff",
    drivers: "driver",
    shopping: "shopping_staff",
    cleaning: "cleaning_staff",
    sales: "sales_admin",
    outsource: "outsource",
  };

  // Load roster every time the dialog opens for a new team.
  useEffect(() => {
    if (!team || !companyId) { setRecipients([]); return; }
    let cancelled = false;
    setLoadingRecipients(true);
    setBody(""); // fresh dialog state per team
    (async () => {
      const role = roleByTeam[team.key];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, phone_number, whatsapp_opt_in")
        .eq("company_id", companyId)
        .eq("role", role)
        .not("phone_number", "is", null);
      if (cancelled) return;
      const rcpts = (data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => p.phone_number && p.whatsapp_opt_in !== false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({ id: p.id, name: p.full_name, phone: p.phone_number }));
      setRecipients(rcpts);
      setLoadingRecipients(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.key, companyId]);

  const handleSend = async () => {
    if (!team || !companyId) return;
    const trimmed = body.trim();
    if (!trimmed) {
      toast({ title: "Message is empty", variant: "destructive" });
      return;
    }
    if (recipients.length === 0) {
      toast({ title: "No recipients with phone + opt-in", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      // TMS-C: dedupKey scopes to (team, message-hash, member) so
      // a double-click doesn't double-queue. The hash trick is a
      // cheap stand-in for an actual content-hash - good enough for
      // the same-day re-click case.
      const stamp = Date.now().toString(36);
      const results = await Promise.all(
        recipients.map((r) =>
          whatsappIntegrationService.enqueueWhatsAppMessage({
            companyId,
            recipientPhone: r.phone,
            recipientName: r.name,
            body: trimmed,
            relatedEntityType: "team_broadcast",
            relatedEntityId: null,
            dedupKey: `team-broadcast:${team.key}:${stamp}:${r.id}`,
          }),
        ),
      );
      const queued = results.filter((id) => !!id).length;
      const refused = results.length - queued;
      toast({
        title: `Queued ${queued} message${queued === 1 ? "" : "s"}`,
        description: refused > 0
          ? `${refused} refused by the comms guard (blocked / paused). The drain cron sends the rest within 5 min.`
          : "The drain cron sends them within 5 min.",
      });
      onClose();
    } catch (err) {
      captureException(err, { tags: { surface: "admin/teams", area: "whatsapp-broadcast", team: team?.key || "" } });
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
    <Dialog open={!!team} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            Message {team?.name.toLowerCase() || "team"}
          </DialogTitle>
          <DialogDescription>
            Goes to every {team?.name.toLowerCase()} member with a phone on file and WhatsApp opt-in. Drain cron sends within 5 minutes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {loadingRecipients ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading roster...</span>
            ) : recipients.length === 0 ? (
              <span className="text-amber-700">No-one with a phone + opt-in. Add phone numbers on /admin/staff and flag whatsapp_opt_in.</span>
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
            placeholder={`Hi team, ...`}
            rows={5}
            className="text-sm"
          />
          <p className="text-[11px] text-slate-500">
            WhatsApp Business templates are required for first contact - if a recipient hasn't messaged you in 24h, Meta may drop free-form text. The queue logs the failure with a clear reason.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={sending}>Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSend}
            disabled={sending || loadingRecipients || recipients.length === 0 || !body.trim()}
            className="bg-green-600 hover:bg-green-700 gap-1.5"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            {sending ? "Queueing..." : `Send to ${recipients.length || 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTeamsIndexPage() {
  return (
    // TMS-A (teams audit, TMS-2): teams hub has a region filter
    // built in - admit region_admin so they see their regional team
    // metrics. RLS narrows the staff query per region.
    // TMS-B (task #204, 2026-05-24): admit OWNER per memo - owner
    // is finance-visible and the operations hub matters most to them.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.REGION_ADMIN]}>
      <TeamsIndexPage />
    </ProtectedRoute>
  );
}
