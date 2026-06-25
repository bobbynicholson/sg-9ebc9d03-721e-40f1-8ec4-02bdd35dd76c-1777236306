/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: full lifecycle timeline. Every recordable step from order
 * confirmed through to equipment collected back at base, rendered
 * as a vertical stepper.
 *
 * Most timestamps live denormalised on orders (filled by RPCs and
 * triggers when each event fires). Three tail timestamps live on
 * event_attendance per waiter - we take the earliest stamp across
 * waiters as the moment that phase started for the order.
 *
 * Service-phase steps (setup -> service -> equipment) are only
 * rendered if the order needs them (requires_waiter / has any
 * event_attendance signal). Cancellation / postponement render as
 * a banner above the main spine, not as inline steps.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isAdmin } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, Circle, Clock, ChefHat, PackageCheck, Truck, MapPin,
  Sparkles, Users, PartyPopper, ArrowLeftRight, PackageOpen, Flag, Ban, Pause, FileSignature, Droplets,
  ShoppingCart, Wrench, AlertCircle, Loader2, Lock,
} from "lucide-react";

const fmtZAR = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

interface OrderForTimeline {
  id: string;
  status: string;
  event_date: string;
  event_time: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  prep_started_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  arrived_at_venue_at: string | null;
  pod_captured_at: string | null;
  delivered_at: string | null;
  setup_started_at: string | null;
  service_started_at: string | null;
  departed_venue_at: string | null;
  // Wave 70.x - on-site service tail, mirrored onto orders by the
  // departed_venue trigger. Optional: older callers may not select them.
  service_ended_at?: string | null;
  event_complete_at?: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  postponed_at: string | null;
  requires_waiter: boolean | null;
  waiter_service_required: boolean | null;
  equipment_return_method: string | null;
}

interface Props {
  order: OrderForTimeline;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

// Earliest non-null timestamp across multiple sources.
function earliest(...stamps: (string | null | undefined)[]): string | null {
  const filled = stamps.filter((s): s is string => !!s);
  if (filled.length === 0) return null;
  return filled.sort()[0];
}

function fmtStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function OrderTimelineSection({ order, defaultOpen, forceOpen }: Props) {
  const { profile } = useAuth() as any;
  const { toast } = useToast();
  const canForceClose = !!profile?.role && isAdmin(profile.role as UserRole);
  // Closeout money - the order prop doesn't carry the balance, so fetch what
  // we need to tell the admin "still R X to pay before this auto-closes".
  const [closeMoney, setCloseMoney] = useState<{ balance_amount: number | null; balance_paid: boolean | null; payment_status: string | null } | null>(null);
  const [forcingClose, setForcingClose] = useState(false);

  useEffect(() => {
    if (!order.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("orders")
        .select("balance_amount, balance_paid, payment_status")
        .eq("id", order.id)
        .maybeSingle();
      if (!cancelled && data) setCloseMoney(data as any);
    })();
    return () => { cancelled = true; };
  }, [order.id, order.status, order.completed_at]);

  const handleForceClose = async () => {
    if (forcingClose) return;
    const reason = window.prompt(
      "Force-close this order (mark completed)?\n\nUse this only when the order is genuinely done. The balance may still be unpaid - that's tracked separately on the invoice. Optional reason:",
      "",
    );
    if (reason === null) return; // cancelled
    setForcingClose(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/force-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_status: "completed", reason: reason || "Force-closed from order timeline" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Could not close", description: json?.error || "Try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Order closed", description: "Marked completed." });
      if (typeof window !== "undefined") window.location.reload();
    } catch (e: any) {
      toast({ title: "Could not close", description: e?.message || "Try again.", variant: "destructive" });
    } finally {
      setForcingClose(false);
    }
  };

  // Service-phase tail timestamps live on event_attendance (one row
  // per waiter). Take the earliest stamp across all waiters for each
  // phase to represent when the order moved through that step.
  const [serviceEnded, setServiceEnded] = useState<string | null>(null);
  const [eventComplete, setEventComplete] = useState<string | null>(null);
  const [equipmentReturned, setEquipmentReturned] = useState<string | null>(null);
  const [hasAttendance, setHasAttendance] = useState(false);
  // service_ended_at / event_complete_at are also mirrored onto the
  // orders row by the departed_venue trigger (for driver-run orders with
  // no waiter event_attendance). Fetched separately + defensively so the
  // section keeps working before the migration that adds the columns
  // (a select on a missing column returns an error we simply ignore,
  // falling back to the inferred-time view).
  const [orderServiceEnded, setOrderServiceEnded] = useState<string | null>(null);
  const [orderEventComplete, setOrderEventComplete] = useState<string | null>(null);
  // ODOC H.11: the cleaning cycle is its own step in the lifecycle.
  // cleaning_jobs.triggered_by_event_id ties cleaning rows to orders;
  // when the first job exists for this order, the cleaning cycle has
  // started. cleaningCycleDone fires when every cleaning_job for the
  // order has status='complete' so the timeline shows "fully cleaned
  // and back in stock" as the closeout milestone.
  const [cleaningStarted, setCleaningStarted] = useState<string | null>(null);
  const [cleaningAllDone, setCleaningAllDone] = useState<string | null>(null);
  const [hasCleaningJobs, setHasCleaningJobs] = useState(false);
  // The driver's "Equipment collected" tap (markEquipmentCollected) flips
  // the collection driver_assignment to status='picked_up' and stamps
  // picked_up_at - it does NOT touch event_attendance.equipment_returned_at
  // (no waiter on a driver-run collection) nor create a cleaning_job yet. So
  // the closeout "Equipment collected" step never lit from those two signals
  // alone. Read the collection assignment directly: collectionPickedUpAt =
  // picked_up_at (or completed_at as a fallback if the trip was completed in
  // one go) so the step ticks the moment the driver collects the gear.
  const [collectionPickedUpAt, setCollectionPickedUpAt] = useState<string | null>(null);
  // ODOC H.12: prereq readiness gates.
  //
  // shopping = shopping_list_items linked to the order via
  // source_order_id. Reached when every non-removed item is
  // purchased=true. Hidden when there's nothing to shop for (kitchen
  // already has stock, the order didn't generate a shopping list).
  //
  // equipment = the union of three concerns -- bookings exist and
  // they're not in a blocking state, no open equipment_shortages,
  // and every hire-in row is confirmed (not stuck at 'draft').
  // Hidden when the order has none of those signals (no equipment
  // tracked at all). This is the "do we have the gear or do we need
  // to hire in" question Bobby asked for, surfaced inline.
  const [shoppingTotal, setShoppingTotal] = useState(0);
  const [shoppingPurchased, setShoppingPurchased] = useState(0);
  const [shoppingReadyAt, setShoppingReadyAt] = useState<string | null>(null);
  const [shoppingBlockedReason, setShoppingBlockedReason] = useState<string | null>(null);
  const [equipmentSignals, setEquipmentSignals] = useState({
    bookings: 0,
    openShortages: 0,
    hireOrdersTotal: 0,
    hireOrdersConfirmed: 0,
  });
  const [equipmentReadyAt, setEquipmentReadyAt] = useState<string | null>(null);
  const [equipmentBlockedReason, setEquipmentBlockedReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("event_attendance")
          .select("setup_started_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at")
          .eq("order_id", order.id);
        if (cancelled) return;
        const rows = (data || []) as any[];
        setHasAttendance(rows.length > 0);
        setServiceEnded(earliest(...rows.map((r) => r.service_ended_at)));
        setEventComplete(earliest(...rows.map((r) => r.event_complete_at)));
        setEquipmentReturned(earliest(...rows.map((r) => r.equipment_returned_at)));
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadTimelineAttendance", orderId: order.id } });
      }
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  // Order-level service tail (driver-run orders with no waiter rows).
  // Prefer values already on the order prop; otherwise fetch them.
  // Silent on error so a pre-migration order page never breaks.
  useEffect(() => {
    if (order.service_ended_at || order.event_complete_at) {
      setOrderServiceEnded(order.service_ended_at || null);
      setOrderEventComplete(order.event_complete_at || null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("service_ended_at, event_complete_at")
        .eq("id", order.id)
        .maybeSingle();
      if (cancelled || error || !data) return; // column missing pre-migration -> ignore
      setOrderServiceEnded((data as any).service_ended_at || null);
      setOrderEventComplete((data as any).event_complete_at || null);
    })();
    return () => { cancelled = true; };
  }, [order.id, order.service_ended_at, order.event_complete_at]);

  // ODOC H.11: cleaning cycle signal. Pulls cleaning_jobs linked to
  // this order via triggered_by_event_id. cleaningStarted = earliest
  // created_at across all jobs (whether complete or not). cleaningAllDone
  // = max(actual_end) across all jobs IFF every non-cancelled job is
  // status='complete' - which is when the equipment is back in stock
  // and the order can close out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("cleaning_jobs")
          .select("created_at, actual_end, status")
          .eq("triggered_by_event_id", order.id)
          .is("deleted_at", null);
        if (cancelled) return;
        const rows = (data || []) as Array<{ created_at: string | null; actual_end: string | null; status: string }>;
        setHasCleaningJobs(rows.length > 0);
        if (rows.length === 0) {
          setCleaningStarted(null);
          setCleaningAllDone(null);
          return;
        }
        // Earliest created_at = cycle started.
        setCleaningStarted(earliest(...rows.map((r) => r.created_at)));
        // Every active job complete? Take max actual_end as the cycle-done stamp.
        const active = rows.filter((r) => r.status !== "cancelled");
        const allComplete = active.length > 0 && active.every((r) => r.status === "complete");
        if (allComplete) {
          const ends = active.map((r) => r.actual_end).filter((e): e is string => !!e);
          ends.sort();
          setCleaningAllDone(ends.length > 0 ? ends[ends.length - 1] : null);
        } else {
          setCleaningAllDone(null);
        }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadTimelineCleaning", orderId: order.id } });
      }
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  // Realtime: re-pull attendance phase stamps when waiters tap their
  // chips. Cheap enough - 5 timestamps per waiter row.
  useEffect(() => {
    if (!order.id) return;
    const ch = supabase
      .channel(`order-timeline-attend:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "event_attendance", filter: `order_id=eq.${order.id}` },
        async () => {
          const { data } = await (supabase as any)
            .from("event_attendance")
            .select("setup_started_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at")
            .eq("order_id", order.id);
          const rows = (data || []) as any[];
          setHasAttendance(rows.length > 0);
          setServiceEnded(earliest(...rows.map((r) => r.service_ended_at)));
          setEventComplete(earliest(...rows.map((r) => r.event_complete_at)));
          setEquipmentReturned(earliest(...rows.map((r) => r.equipment_returned_at)));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [order.id]);

  // ODOC H.12: shopping readiness signal. shopping_list_items
  // carries source_order_id pointing back at the catering order that
  // generated the buy line. Reached when every non-removed item has
  // purchased=true. Loads + realtime so the timeline ticks live as
  // the shopping team checks items off.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await (supabase as any)
          .from("shopping_list_items")
          // shopping_list_items has `name`/`created_at`, not item_name/updated_at;
          // alias them so the downstream row shape is unchanged.
          .select("purchased, updated_at:created_at, item_name:name")
          .eq("source_order_id", order.id)
          .is("removed_at", null);
        if (cancelled) return;
        const rows = (data || []) as Array<{ purchased: boolean | null; updated_at: string | null; item_name: string | null }>;
        const total = rows.length;
        const purchased = rows.filter((r) => r.purchased === true).length;
        setShoppingTotal(total);
        setShoppingPurchased(purchased);
        if (total > 0 && purchased === total) {
          const stamps = rows.map((r) => r.updated_at).filter((s): s is string => !!s).sort();
          setShoppingReadyAt(stamps.length > 0 ? stamps[stamps.length - 1] : null);
          setShoppingBlockedReason(null);
        } else {
          setShoppingReadyAt(null);
          setShoppingBlockedReason(
            total === 0 ? null : `${total - purchased} of ${total} item${total === 1 ? "" : "s"} still to buy`,
          );
        }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadTimelineShopping", orderId: order.id } });
      }
    };
    void load();
    const ch = supabase
      .channel(`order-timeline-shopping:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "shopping_list_items", filter: `source_order_id=eq.${order.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [order.id]);

  // ODOC H.12: equipment readiness signal. Triple-source - bookings
  // exist and aren't blocking, no open shortages, and every hire-in
  // row is in a confirmed / picked-up / returned state (not draft or
  // cancelled). Reached when ALL of those conditions hold AND the
  // order has at least one equipment signal (otherwise we'd light up
  // a "ready" step for orders that don't track equipment at all).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [bookingsRes, shortagesRes, hiresRes] = await Promise.all([
          (supabase as any)
            .from("equipment_bookings")
            // equipment_bookings has no updated_at; alias created_at to keep
            // the readiness-stamp logic below unchanged.
            .select("status, updated_at:created_at")
            .eq("order_id", order.id),
          (supabase as any)
            .from("equipment_shortage_flags")
            .select("status, priority, created_at, resolved_at")
            .eq("order_id", order.id),
          (supabase as any)
            .from("equipment_hire_orders")
            .select("status, updated_at, supplier_name")
            .eq("order_id", order.id),
        ]);
        if (cancelled) return;
        const bookings = (bookingsRes.data || []) as Array<{ status: string | null; updated_at: string | null }>;
        const shortages = (shortagesRes.data || []) as Array<{ status: string | null; priority: string | null; created_at: string | null; resolved_at: string | null }>;
        const hires = (hiresRes.data || []) as Array<{ status: string | null; updated_at: string | null; supplier_name: string | null }>;
        const openShortages = shortages.filter((s) => {
          const st = String(s.status || "").toLowerCase();
          return st !== "resolved" && st !== "cancelled" && st !== "closed";
        }).length;
        const hireOrdersTotal = hires.length;
        const hireOrdersConfirmed = hires.filter((h) => {
          const st = String(h.status || "").toLowerCase();
          return st === "confirmed" || st === "picked_up" || st === "returned";
        }).length;
        setEquipmentSignals({
          bookings: bookings.length,
          openShortages,
          hireOrdersTotal,
          hireOrdersConfirmed,
        });
        const allHiresConfirmed = hireOrdersTotal === 0 || hireOrdersConfirmed === hireOrdersTotal;
        const isReady = openShortages === 0 && allHiresConfirmed;
        if (isReady && (bookings.length > 0 || hireOrdersTotal > 0)) {
          const stamps = [
            ...bookings.map((b) => b.updated_at),
            ...hires.map((h) => h.updated_at),
            ...shortages.map((s) => s.resolved_at || s.created_at),
          ].filter((s): s is string => !!s).sort();
          setEquipmentReadyAt(stamps.length > 0 ? stamps[stamps.length - 1] : null);
          setEquipmentBlockedReason(null);
        } else {
          setEquipmentReadyAt(null);
          const reasons: string[] = [];
          if (openShortages > 0) reasons.push(`${openShortages} open shortage${openShortages === 1 ? "" : "s"}`);
          if (hireOrdersTotal > 0 && hireOrdersConfirmed < hireOrdersTotal) {
            reasons.push(`${hireOrdersTotal - hireOrdersConfirmed} hire-in${hireOrdersTotal - hireOrdersConfirmed === 1 ? "" : "s"} unconfirmed`);
          }
          setEquipmentBlockedReason(reasons.length > 0 ? reasons.join(" · ") : null);
        }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadTimelineEquipmentReady", orderId: order.id } });
      }
    };
    void load();
    const ch = supabase
      .channel(`order-timeline-equip:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "equipment_bookings", filter: `order_id=eq.${order.id}` },
        () => { void load(); },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "equipment_shortage_flags", filter: `order_id=eq.${order.id}` },
        () => { void load(); },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "equipment_hire_orders", filter: `order_id=eq.${order.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [order.id]);

  // ODOC H.11: realtime sub on cleaning_jobs so the cleaning step
  // ticks live as the cleaning team flips jobs queued -> in_progress
  // -> complete. Same cheap re-pull pattern as the attendance sub.
  useEffect(() => {
    if (!order.id) return;
    const ch = supabase
      .channel(`order-timeline-cleaning:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "cleaning_jobs", filter: `triggered_by_event_id=eq.${order.id}` },
        async () => {
          const { data } = await (supabase as any)
            .from("cleaning_jobs")
            .select("created_at, actual_end, status")
            .eq("triggered_by_event_id", order.id)
            .is("deleted_at", null);
          const rows = (data || []) as Array<{ created_at: string | null; actual_end: string | null; status: string }>;
          setHasCleaningJobs(rows.length > 0);
          setCleaningStarted(earliest(...rows.map((r) => r.created_at)));
          const active = rows.filter((r) => r.status !== "cancelled");
          const allComplete = active.length > 0 && active.every((r) => r.status === "complete");
          if (allComplete) {
            const ends = active.map((r) => r.actual_end).filter((e): e is string => !!e);
            ends.sort();
            setCleaningAllDone(ends.length > 0 ? ends[ends.length - 1] : null);
          } else {
            setCleaningAllDone(null);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [order.id]);

  // Collection driver_assignment signal. The "Equipment collected"
  // closeout step lights from this the moment the driver taps it on the
  // trip (markEquipmentCollected flips the row to picked_up + stamps
  // picked_up_at). Load + realtime so the step ticks live without a refresh.
  useEffect(() => {
    if (!order.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await (supabase as any)
          .from("driver_assignments")
          .select("status, picked_up_at, completed_at")
          .eq("order_id", order.id)
          .eq("assignment_type", "collection");
        if (cancelled) return;
        const rows = (data || []) as Array<{ status: string | null; picked_up_at: string | null; completed_at: string | null }>;
        // Done = collection physically picked up (or the whole trip
        // completed). Take the earliest such stamp across any collection
        // rows on the order.
        const stamps = rows
          .filter((r) => r.status === "picked_up" || r.status === "completed")
          .map((r) => r.picked_up_at || r.completed_at)
          .filter((s): s is string => !!s);
        setCollectionPickedUpAt(earliest(...stamps));
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadTimelineCollection", orderId: order.id } });
      }
    };
    void load();
    const ch = supabase
      .channel(`order-timeline-collection:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "driver_assignments", filter: `order_id=eq.${order.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [order.id]);

  // Effective service-tail stamps: prefer the precise waiter-panel value
  // (event_attendance), fall back to the order column stamped by the
  // departed_venue trigger. Keeps the timeline complete for driver-run
  // orders that never had a waiter tap service-ended / event-complete.
  const effServiceEnded = serviceEnded || orderServiceEnded;
  const effEventComplete = eventComplete || orderEventComplete;

  const cancelled = !!order.cancelled_at;
  const postponed = !!order.postponed_at;
  // Service-phase steps are relevant if the order needs waiters, any
  // waiter has actually checked in (event_attendance), OR any on-site
  // timestamp has actually been stamped on the order row. The driver's
  // setup/service/depart taps in DriverConfirmationPanel fire the
  // tg_stamp_order_event_day trigger which fills orders.setup_started_at
  // / service_started_at / departed_venue_at - so those stamps can exist
  // even when requires_waiter is false. Without the timestamp clauses the
  // step rendered a real time AND an "N/A" chip at once. This mirrors the
  // `onSite` derivation in computeOrderTimeline() (orderTimeline.ts) so
  // the /order/[id] stepper and the admin/client timelines stay in sync.
  const needsService = !!(
    order.requires_waiter ||
    order.waiter_service_required ||
    hasAttendance ||
    order.setup_started_at ||
    order.service_started_at ||
    order.departed_venue_at ||
    effServiceEnded ||
    effEventComplete
  );
  // Equipment-return step shows if there's any equipment-return
  // signal (a method on the order, an attendance stamp, the
  // departed_venue_at field, or a cleaning_job exists for the order).
  // For most catering jobs there's something to bring back, so this
  // is conservative.
  const hasEquipmentSignal = !!(
    equipmentReturned ||
    collectionPickedUpAt ||
    hasCleaningJobs ||
    // Equipment is BOOKED on this order - there's gear to bring back, so
    // the collection + cleaning closeout steps are applicable (pending),
    // not N/A. Without this the "Up next" marker skipped them and jumped
    // straight to "Closed" even though 108 items were still out.
    equipmentSignals.bookings > 0 ||
    (order.equipment_return_method && order.equipment_return_method !== "none" && order.equipment_return_method !== "client_keeps")
  );

  type Step = {
    key: string;
    label: string;
    Icon: any;
    at: string | null;
    /** Hide entirely when false (vs render as pending) */
    show?: boolean;
    /** Lane: kitchen / driver / service / closeout - drives the accent dot colour */
    lane: "open" | "kitchen" | "driver" | "service" | "closeout";
  };

  // ODOC H.12: prereq gates - only render when there's something to
  // gate on. A simple catering job with stock in hand and no
  // equipment shows neither step; a complex one with shopping +
  // hire-in surfaces both with a live count.
  const showShoppingStep = shoppingTotal > 0;
  const showEquipmentStep = equipmentSignals.bookings > 0
    || equipmentSignals.openShortages > 0
    || equipmentSignals.hireOrdersTotal > 0;

  const shoppingLabel = shoppingTotal === 0
    ? "Stock & shopping"
    : shoppingReadyAt
      ? `Shopping complete (${shoppingPurchased}/${shoppingTotal})`
      : `Shopping (${shoppingPurchased}/${shoppingTotal})`;
  const equipmentLabel = !showEquipmentStep
    ? "Equipment ready"
    : equipmentReadyAt
      ? equipmentSignals.hireOrdersTotal > 0
        ? `Equipment ready (incl ${equipmentSignals.hireOrdersTotal} hire-in)`
        : "Equipment ready"
      : equipmentBlockedReason
        ? `Equipment: ${equipmentBlockedReason}`
        : "Equipment ready";

  const allSteps: Step[] = ([
    { key: "created",       label: "Order created",        Icon: Flag,           at: order.created_at,          lane: "open" },
    { key: "confirmed",     label: "Confirmed",            Icon: CheckCircle2,   at: order.confirmed_at,        lane: "open" },
    // ODOC H.12: stock & equipment prereqs sit between confirmation
    // and the kitchen starting prep, because the kitchen physically
    // cannot start without ingredients and gear. They show only when
    // there's a signal worth surfacing.
    { key: "shopping",      label: shoppingLabel,          Icon: ShoppingCart,   at: shoppingReadyAt,           show: showShoppingStep, lane: "open" },
    { key: "equipment_ready", label: equipmentLabel,       Icon: Wrench,         at: equipmentReadyAt,          show: showEquipmentStep, lane: "open" },
    { key: "prep",          label: "Prep started",         Icon: ChefHat,        at: order.prep_started_at,     lane: "kitchen" },
    { key: "ready",         label: "Ready for collection", Icon: PackageCheck,   at: order.ready_at,            lane: "kitchen" },
    { key: "picked_up",     label: "Collected by driver",  Icon: Truck,          at: order.picked_up_at,        lane: "driver" },
    { key: "arrived",       label: "Arrived at venue",     Icon: MapPin,         at: order.arrived_at_venue_at, lane: "driver" },
    { key: "pod",           label: "POD captured",         Icon: FileSignature,  at: order.pod_captured_at,     lane: "driver" },
    { key: "delivered",     label: "Delivered",            Icon: PackageOpen,    at: order.delivered_at,        lane: "driver" },
    { key: "setup",         label: "Setup started",        Icon: Sparkles,       at: order.setup_started_at,    show: needsService, lane: "service" },
    { key: "service_start", label: "Service started",     Icon: Users,          at: order.service_started_at,  show: needsService, lane: "service" },
    { key: "service_end",   label: "Service ended",        Icon: Clock,          at: effServiceEnded,           show: needsService, lane: "service" },
    { key: "event_done",    label: "Event complete",       Icon: PartyPopper,    at: effEventComplete,          show: needsService, lane: "service" },
    { key: "departed",      label: "Departed venue",       Icon: ArrowLeftRight, at: order.departed_venue_at,   lane: "closeout" },
    // ODOC H.11: equipment closeout now spans two steps. First the
    // driver / waiter brings the gear back from the venue (uses the
    // existing equipment_returned_at stamp from event_attendance, or
    // - failing that - the first cleaning_job created_at as a fallback
    // proof that gear arrived back at base). Then the cleaning team
    // takes over and the order can't close until every cleaning job
    // for it lands on status='complete'.
    { key: "equipment",     label: "Equipment collected",  Icon: PackageCheck,   at: equipmentReturned || collectionPickedUpAt || cleaningStarted, show: hasEquipmentSignal, lane: "closeout" },
    { key: "cleaning",      label: "In cleaning cycle",    Icon: Droplets,       at: cleaningAllDone || cleaningStarted,   show: hasEquipmentSignal, lane: "closeout" },
    { key: "completed",     label: "Closed",               Icon: CheckCircle2,   at: order.completed_at,        lane: "closeout" },
  ] as Step[]);
  // "Stock & shopping" and "Equipment ready" are PARALLEL prereqs -
  // neither depends on the other, and they can complete in either order
  // (equipment-ready is inferred from the booking's creation time, which
  // is usually order-creation; shopping finishes whenever the buy run
  // does). A fixed list order therefore reads backwards in time when
  // shopping (e.g. 06:51) lands above equipment-ready (06:05). Order this
  // adjacent pair by completion time so the timeline never shows a later
  // step above an earlier one. Every other step is genuinely sequential,
  // so their stamps are naturally monotonic and we leave them put.
  const prereqPositions = allSteps
    .map((s, i) => (s.key === "shopping" || s.key === "equipment_ready" ? i : -1))
    .filter((i) => i >= 0);
  if (prereqPositions.length === 2) {
    const [a, b] = prereqPositions;
    const ta = allSteps[a].at ? new Date(allSteps[a].at as string).getTime() : Infinity;
    const tb = allSteps[b].at ? new Date(allSteps[b].at as string).getTime() : Infinity;
    if (ta > tb) {
      const tmp = allSteps[a];
      allSteps[a] = allSteps[b];
      allSteps[b] = tmp;
    }
  }

  // Show the WHOLE lifecycle on every order - render every step, even
  // the ones that don't apply to this particular order (no shopping
  // list, no equipment, no waiter service). Non-applicable steps are
  // drawn faint + marked "N/A" rather than removed, so the timeline is
  // a consistent full length and the operator can see the complete
  // pipeline at a glance. `step.show === false` = not applicable here.
  const steps: Step[] = allSteps;

  // Pick the current step: the last APPLICABLE one with a timestamp.
  // N/A steps never carry a timestamp so they can't be "done".
  const lastDoneIdx = (() => {
    let idx = -1;
    steps.forEach((s, i) => { if (s.at && s.show !== false) idx = i; });
    return idx;
  })();

  // First applicable, not-yet-reached step after the last done one -
  // this is the real "Up next". Skips N/A steps so the action cue never
  // lands on a step that doesn't apply to this order.
  const nextPendingIdx = (() => {
    for (let i = lastDoneIdx + 1; i < steps.length; i++) {
      if (steps[i].show !== false && !steps[i].at) return i;
    }
    return -1;
  })();
  const currentLabel = cancelled
    ? "Cancelled"
    : postponed
      ? "Postponed"
      : lastDoneIdx >= 0
        ? steps[lastDoneIdx].label
        : "Awaiting confirmation";

  // ODOC Wave D: stuck-stage detection. If the order is sitting at
  // a step longer than is reasonable (and the event is approaching),
  // we flag it. Thresholds are deliberately generous - we want to
  // call attention, not noise the operator with false alarms.
  const STUCK_THRESHOLDS_HOURS: Record<string, number> = {
    created: 48,        // 2 days to get confirmed
    confirmed: 0,       // no fixed SLA before prep starts - drives via event_date
    shopping: 48,       // shopping should clear within 2 days of confirmation
    equipment_ready: 72, // bookings + hire-ins confirmed within 3 days
    prep: 24,           // prep should land in ready within a day
    ready: 12,          // ready -> picked_up
    picked_up: 4,       // collected -> at venue
    arrived: 2,         // arrived -> POD
    pod: 2,             // POD captured -> delivered status flip
    delivered: 6,       // delivered -> setup started (if service)
    setup: 6,           // setup -> service started
    service_start: 8,   // service window
    service_end: 2,     // service ended -> event complete
    event_done: 24,     // event done -> departed venue
    departed: 48,       // departed -> equipment back
    equipment: 72,      // equipment back -> in cleaning cycle
    cleaning: 168,      // cleaning cycle -> closed (admin closes once stock is back)
  };
  const hoursSince = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    return (Date.now() - new Date(iso).getTime()) / 3_600_000;
  };
  const currentStep = lastDoneIdx >= 0 ? steps[lastDoneIdx] : null;
  const currentHoursSince = currentStep ? hoursSince(currentStep.at) : null;
  const stuckThreshold = currentStep ? STUCK_THRESHOLDS_HOURS[currentStep.key] : undefined;
  const isStuck = !cancelled && !postponed && currentHoursSince != null && stuckThreshold != null && stuckThreshold > 0 && currentHoursSince > stuckThreshold && order.status !== "completed" && order.status !== "delivered";

  const fmtRelative = (h: number): string => {
    if (h < 1) return `${Math.round(h * 60)}m ago`;
    if (h < 24) return `${Math.round(h)}h ago`;
    const days = Math.round(h / 24);
    return `${days}d ago`;
  };

  // Lane accent palette - matches each section's colour so the
  // viewer sees at a glance which team owns which step.
  const laneClass = (lane: Step["lane"], reached: boolean) => {
    if (!reached) return "bg-slate-100 text-slate-400 border-slate-200";
    switch (lane) {
      case "kitchen":  return "bg-rose-500 text-white border-rose-600";
      case "driver":   return "bg-indigo-500 text-white border-indigo-600";
      case "service":  return "bg-amber-500 text-white border-amber-600";
      case "closeout": return "bg-brand-primary text-white border-brand-primary/80";
      default:         return "bg-slate-500 text-white border-slate-600";
    }
  };

  // ODOC H.1: who owns each step. Drives the "Whose turn" badge.
  // System = auto-fires from a trigger or admin action (created,
  // confirmed). Cleaning closes out equipment when waiters aren't
  // involved.
  const stepOwner = (key: string): { role: string; tone: string } => {
    switch (key) {
      case "created":       return { role: "System",   tone: "bg-slate-100 text-slate-700 border-slate-200" };
      case "confirmed":     return { role: "Admin",    tone: "bg-slate-100 text-slate-700 border-slate-200" };
      case "shopping":      return { role: "Shopping", tone: "bg-brand-primary/10 text-brand-primary border-brand-primary/20" };
      case "equipment_ready": return { role: "Admin",  tone: "bg-violet-50 text-violet-800 border-violet-200" };
      case "prep":          return { role: "Kitchen",  tone: "bg-rose-50 text-rose-800 border-rose-200" };
      case "ready":         return { role: "Kitchen",  tone: "bg-rose-50 text-rose-800 border-rose-200" };
      case "picked_up":     return { role: "Driver",   tone: "bg-indigo-50 text-indigo-800 border-indigo-200" };
      case "arrived":       return { role: "Driver",   tone: "bg-indigo-50 text-indigo-800 border-indigo-200" };
      case "pod":           return { role: "Driver",   tone: "bg-indigo-50 text-indigo-800 border-indigo-200" };
      case "delivered":     return { role: "Driver",   tone: "bg-indigo-50 text-indigo-800 border-indigo-200" };
      case "setup":         return { role: "Waiter",   tone: "bg-amber-50 text-amber-800 border-amber-200" };
      case "service_start": return { role: "Waiter",   tone: "bg-amber-50 text-amber-800 border-amber-200" };
      case "service_end":   return { role: "Waiter",   tone: "bg-amber-50 text-amber-800 border-amber-200" };
      case "event_done":    return { role: "Waiter",   tone: "bg-amber-50 text-amber-800 border-amber-200" };
      case "departed":      return { role: "Driver",   tone: "bg-indigo-50 text-indigo-800 border-indigo-200" };
      case "equipment":     return { role: "Driver",   tone: "bg-indigo-50 text-indigo-800 border-indigo-200" };
      case "cleaning":      return { role: "Cleaning", tone: "bg-brand-primary/10 text-brand-primary border-brand-primary/20" };
      case "completed":     return { role: "Admin",    tone: "bg-slate-100 text-slate-700 border-slate-200" };
      default:              return { role: "-",        tone: "bg-slate-50 text-slate-500 border-slate-200" };
    }
  };

  return (
    <CollapsibleSection
      id="section-timeline"
      title="Status timeline"
      summary={`Currently: ${currentLabel}`}
      icon={Clock}
      accent="blue"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      <div className="space-y-3">
        {/* Cancellation / postponement banner - takes precedence over
            the main spine because it changes how the rest reads. */}
        {cancelled && (
          <div className="flex items-start gap-2 p-2.5 rounded border border-rose-200 bg-rose-50">
            <Ban className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-rose-900">Order cancelled</p>
              <p className="text-rose-700 mt-0.5">{fmtStamp(order.cancelled_at)}</p>
            </div>
          </div>
        )}
        {/* Stuck-stage warning - timeline-scoped (the doc-wide
            banners cover terminal states). Only fires when the
            current step has dwelt longer than its threshold. */}
        {isStuck && currentStep && (
          <div className="flex items-start gap-2 p-2.5 rounded border border-amber-300 bg-amber-50">
            <Pause className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-amber-900">Stuck at {currentStep.label}</p>
              <p className="text-amber-800 mt-0.5">
                {fmtRelative(currentHoursSince!)} - typical move-on within {stuckThreshold}h. Worth a chase.
              </p>
            </div>
          </div>
        )}
        {postponed && !cancelled && (
          <div className="flex items-start gap-2 p-2.5 rounded border border-amber-200 bg-amber-50">
            <Pause className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-amber-900">Order postponed</p>
              <p className="text-amber-700 mt-0.5">{fmtStamp(order.postponed_at)}</p>
            </div>
          </div>
        )}

        {/* Vertical stepper. Each row is icon-dot + connector line +
            label + timestamp. Dots colour-match the responsible team. */}
        <ol className="relative">
          {/* ODOC H.1: identify the "next" step (first pending) so
              we can highlight the owner whose turn it is. */}
          {(() => null)()}
          {steps.map((step, i) => {
            const reached = !!step.at;
            // A step that was actually reached (has a real timestamp) can
            // never be "not applicable" - guard against the show-flag and a
            // real stamp disagreeing (e.g. a driver-stamped service step on
            // an order we hadn't flagged as needing service). Without this a
            // row showed its timestamp AND a faint "N/A" chip at once.
            const notApplicable = step.show === false && !step.at;
            // An applicable step that sits BEFORE the last completed step but
            // carries no stamp of its own has still been passed - the
            // lifecycle has provably moved beyond it (a later milestone is
            // stamped). Render it as done so the spine reads cleanly top to
            // bottom (everything up to the current point green, only genuine
            // future steps pending at the end) instead of showing a grey
            // "hole" mid-spine. The step has no stamp of its own (e.g. POD
            // skipped because delivery was confirmed via the "Arrived at
            // venue" tap, or service-ended/event-complete never tapped on the
            // waiter panel), so we infer an APPROXIMATE time from the next
            // recorded step - the step must have completed no later than the
            // milestone that follows it. Shown with a "~" prefix + tooltip so
            // it reads as a complete, chronological timeline without claiming
            // an exact stamp that was never captured.
            const passed = !step.at && !notApplicable && lastDoneIdx >= 0 && i < lastDoneIdx;
            const inferredAt = passed
              ? (() => {
                  for (let j = i + 1; j < steps.length; j++) {
                    if (steps[j].at) return steps[j].at as string;
                  }
                  return null;
                })()
              : null;
            const done = reached || passed;
            const isCurrent = i === lastDoneIdx;
            const isNextPending = i === nextPendingIdx;
            const Icon = step.Icon;
            const isLast = i === steps.length - 1;
            const owner = stepOwner(step.key);
            return (
              <li key={step.key} className="relative flex items-start gap-3 pb-3 last:pb-0">
                {/* Connector line drops from this dot to the next.
                    The line itself uses a slate background and the
                    "reached" half is a gradient overlay to keep it
                    legible without per-row state.   */}
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[15px] top-7 bottom-0 w-px ${done ? "bg-brand-primary/70" : "bg-slate-200"}`}
                  />
                )}
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 transition ${laneClass(step.lane, done)} ${notApplicable ? "opacity-50 border-dashed" : ""} ${isCurrent ? "ring-2 ring-offset-2 ring-blue-300" : ""} ${isNextPending && !cancelled && !postponed ? "ring-2 ring-offset-2 ring-amber-300" : ""}`}
                >
                  {done ? <Icon className="w-4 h-4" /> : <Circle className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <p className={`text-sm ${notApplicable ? "text-slate-400 italic" : done ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                      {step.label}
                      {/* ODOC H.1: whose turn badge. Always shown -
                          informational for past steps, action-cue
                          for the next pending step (with 'Up next').
                          N/A steps (not relevant to this order) carry an
                          'N/A' chip instead of the owner + action cues. */}
                      {notApplicable ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border bg-slate-50 text-slate-400 border-slate-200">
                          N/A
                        </span>
                      ) : (
                        <span className={`ml-2 text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border ${owner.tone}`}>
                          {owner.role}
                        </span>
                      )}
                      {!notApplicable && isNextPending && !cancelled && !postponed && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 font-semibold">
                          Up next
                        </span>
                      )}
                      {!notApplicable && isCurrent && !cancelled && !isStuck && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">Now</span>
                      )}
                      {!notApplicable && isCurrent && isStuck && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">Stuck</span>
                      )}
                    </p>
                    <div className="flex items-baseline gap-1.5 text-xs tabular-nums text-slate-500">
                      {(reached || (passed && inferredAt)) && (
                        <span
                          className="text-[10px] text-slate-400"
                          title={reached
                            ? `Stamped: ${fmtStamp(step.at)}`
                            : "Approximate - inferred from the next recorded step (not separately stamped)"}
                        >
                          {fmtRelative(hoursSince((reached ? step.at : inferredAt) as string)!)}
                        </span>
                      )}
                      <span
                        className={passed ? "text-slate-400 italic" : undefined}
                        title={passed && inferredAt
                          ? "Approximate - inferred from the next recorded step (not separately stamped)"
                          : undefined}
                      >
                        {reached
                          ? fmtStamp(step.at)
                          : passed && inferredAt
                            ? `~${fmtStamp(inferredAt)}`
                            : notApplicable
                              ? "N/A"
                              : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Closeout box - shown when the order is operationally delivered but
            not yet closed. Surfaces the outstanding balance (so the admin
            KNOWS payment is still due) + a force-close action. The order
            normally auto-closes once the balance is paid; force-close is the
            admin override. */}
        {order.status !== "completed" && order.status !== "cancelled" && !cancelled && (
          (() => {
            const outstanding = Number(closeMoney?.balance_amount ?? 0);
            const balanceUnpaid = !closeMoney?.balance_paid && outstanding > 0;
            const delivered = order.status === "delivered" || !!order.delivered_at;
            if (!delivered && !balanceUnpaid) return null;
            return (
              <div className={`rounded-lg border p-3 ${balanceUnpaid ? "border-amber-300 bg-amber-50" : "border-brand-primary/30 bg-brand-primary/10"}`}>
                <div className="flex items-start gap-2">
                  {balanceUnpaid
                    ? <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    : <CheckCircle2 className="w-4 h-4 text-brand-primary flex-shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {balanceUnpaid ? "Payment still outstanding" : "Ready to close"}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {balanceUnpaid
                        ? <>Balance <strong className="text-amber-800">{fmtZAR.format(outstanding)}</strong> still to pay. The order closes automatically once it's paid in full, or an admin can force-close it now.</>
                        : <>Balance settled. This order will auto-close shortly, or close it now.</>}
                    </p>
                    <div className="mt-2">
                      {canForceClose ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleForceClose}
                          disabled={forcingClose}
                          className="text-xs h-8 gap-1.5 border-slate-300"
                        >
                          {forcingClose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                          Force-close order
                        </Button>
                      ) : (
                        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Only an admin / owner can force-close.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()
        )}

        {/* Lane legend - small helper so the dot colours mean
            something at a glance. Hidden when there's nothing
            interesting to disambiguate. */}
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500 pt-2 border-t border-slate-100 flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" />Open</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Kitchen</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" />Driver</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Service</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-primary" />Closeout</span>
        </div>
      </div>
    </CollapsibleSection>
  );
}
