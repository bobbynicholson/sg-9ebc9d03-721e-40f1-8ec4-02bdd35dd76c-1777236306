/* eslint-disable @typescript-eslint/no-explicit-any */
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";

/**
 * Order Timeline - derives a richer 22-stage view of an order's
 * progress from the joined data (orders + payments + equipment + prep
 * tasks + driver assignments + invoices + email log).
 *
 * Wave 25 architecture: the previous /admin/orders timeline was 7
 * binary stages mapped 1:1 to orders.status. The catering operator
 * could not see deposit status, hire flow, post-event collection,
 * cleaning, final invoice, balance paid, or thank-you sent. This
 * function exposes ALL of those as derived stages without changing
 * the orders.status enum.
 *
 * The function is PURE - it takes a `joined` payload of related
 * rows and returns the derived timeline. No DB calls inside, so the
 * /admin/orders list page can batch-fetch all related tables once and
 * call computeOrderTimeline() per row without N+1 fan-out. The order
 * detail drawer re-runs it with a richer per-row fetch to populate
 * tooltip meta.
 *
 * Each stage has:
 *   - status: completed | current | blocked | upcoming | skipped | not_applicable
 *   - startedAt / completedAt timestamps where derivable
 *   - blockedReason (e.g. "deposit not paid" when the next gate hasn't passed)
 *   - sourceLink: deep-link to the artifact for click-through
 *   - meta: optional payload for richer tooltips (prep progress, supplier,
 *     assigned driver, etc.)
 *
 * Always exactly one stage per order has status='current'. The function
 * walks the stage list, skipping not_applicable, and assigns 'current'
 * to the first not-yet-completed stage. Earlier completed stages stay
 * green; later upcoming stages stay grey. A blocked dependency
 * (e.g. deposit unpaid blocking kitchen prep) flips the current stage
 * red with a blockedReason.
 *
 * Stage list deliberately stays full (22 entries) regardless of which
 * branches apply to this order - the UI hides not_applicable entries
 * behind a cluster chevron, but the upstream array is stable so the
 * cluster band has a consistent layout no matter which conditional
 * features the tenant uses.
 */

// --- Types -----------------------------------------------------------------

export type StageStatus =
  | "completed"
  | "current"
  | "blocked"
  | "upcoming"
  | "skipped"
  | "not_applicable";

export type StageGroup =
  | "booking"
  | "logistics"
  | "dispatch"
  | "on_site"
  | "post_event"
  | "closure";

export type StageKey =
  | "quote_accepted"
  | "order_created"
  | "deposit_invoice_issued"
  | "deposit_paid"
  | "confirmed"
  | "equipment_hire_booked"
  | "equipment_hire_collected"
  | "pre_event_cleaning"
  | "pre_event_shopping"
  | "kitchen_prep_in_progress"
  | "ready_for_dispatch"
  | "driver_assigned_delivery"
  | "in_transit"
  | "delivered"
  | "setup_started"
  | "service_started"
  | "service_ended"
  | "event_complete"
  | "departed_venue"
  | "collection_scheduled"
  | "collection_done"
  | "post_event_cleaning"
  | "final_invoice_issued"
  | "final_invoice_sent"
  | "balance_paid"
  | "receipt_issued"
  | "completed"
  | "thank_you_sent";

export interface OrderTimelineStage {
  key: StageKey;
  label: string;
  group: StageGroup;
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  sourceLink: string | null;
  meta?: {
    progress?: { done: number; total: number };
    expectedAt?: string | null;
    actor?: string | null;
    note?: string | null;
  };
}

export interface OrderTimelineFlags {
  hasDeposit: boolean;
  hasBalance: boolean;
  hasExternalHire: boolean;
  hasOwnedEquipment: boolean;
  isDeliverAndCollect: boolean;
  hasCleaningWork: boolean;
  hasPrepTasks: boolean;
}

/**
 * Wave 43 T3 + Wave 46 T1 - urgency tier derived from event_date
 * vs now using CALENDAR-DAY comparison in the tenant's timezone.
 *
 *   normal   - event > 7 days away, or order is fully complete
 *   soon     - event within 7 days but not today/tomorrow
 *   tomorrow - event is the next calendar day (tenant tz)
 *   today    - event is today (tenant tz)
 *   overdue  - event date has passed AND stages still incomplete
 *
 * Wave 46 T1 fix: previously a hour-bucket (`<=24h -> 'today'`)
 * incorrectly labelled tomorrow's evening event as "today" when
 * the operator opened the page after midday. Calendar-day match
 * matches the operator's wall clock.
 *
 * Drives the chip tone + pulse + sort. Pure derivation - no DB.
 */
export type OrderTimelineUrgency = "normal" | "soon" | "tomorrow" | "today" | "overdue";

export interface OrderTimeline {
  orderId: string;
  computedAt: string;
  currentStageKey: StageKey | null;
  currentClusterKey: StageGroup | null;
  blocked: boolean;
  blockedReason: string | null;
  stages: OrderTimelineStage[];
  flags: OrderTimelineFlags;
  /** Number of applicable (non n/a non skipped) stages completed. */
  completedCount: number;
  /** Number of applicable stages total. */
  applicableCount: number;
  /** Wave 43 T3 - urgency tier for the orange chip + sort. */
  urgency: OrderTimelineUrgency;
  /** Wave 43 T3 - ms until event_date+event_time; negative if past. */
  msToEvent: number | null;
  /** Wave 44 T2 - cross-system blockers that explain why the
   *  current stage isn't moving (e.g. equipment still in cleaning,
   *  no driver shift covers dispatch window). Empty when nothing
   *  is blocking. */
  crossSystemBlockers: CrossSystemBlocker[];
}

/**
 * Wave 44 T2 - cross-system blocker.
 *
 * Each entry is one specific reason the current stage can't make
 * progress, sourced from data outside the orders table itself
 * (cleaning_jobs, kitchen_shifts deliveries, etc). Surfaced
 * inline on the TimelineTrack chip so the operator sees exactly
 * what to unstick.
 */
export interface CrossSystemBlocker {
  kind:
    | "equipment_in_cleaning"
    | "no_delivery_shift"
    // Wave 66.6 - new blockers for the dispatch leg.
    | "vehicle_not_booked"
    | "pickup_time_missing"
    | "setup_time_missing"
    // Wave 67 Phase E - outsource provider hasn't responded yet.
    | "outsource_pending";
  message: string;
  severity: "warning" | "error";
}

/**
 * Joined payload the compute function expects. All arrays default to
 * empty so callers that haven't joined a particular table get a
 * sensible "branch not applicable" result instead of crashing.
 *
 * The `order` field is the only required one. Everything else is the
 * row-set scoped to that single order.
 */
export interface OrderTimelineInput {
  order: any;
  payments?: any[];
  equipmentBookings?: any[];
  equipmentHireOrders?: any[];
  equipmentCleaningStatus?: any[];
  kitchenPrepTasks?: any[];
  driverAssignments?: any[];
  invoices?: any[];
  emailLog?: any[];
  /** Truthy when the linked quote has status='accepted'. Optional --
   *  if missing, falls back to inferring from order existence. */
  quoteAccepted?: boolean;
  /** Wave 44 T2 - active cleaning_jobs (status in queued/in_progress)
   *  for any equipment booked on this order. When kitchen_prep is
   *  the current stage and any equipment_id from equipmentBookings
   *  appears here, surface a blocker chip ("Equipment X still being
   *  cleaned"). Empty array when not joined. */
  cleaningJobsActive?: Array<{ equipment_id: string; equipment_name?: string | null; status?: string }>;
  /** Order-level cleaning cycle: ALL cleaning_jobs linked to this order
   *  via triggered_by_event_id (any status). Mirrors how OrderTimelineSection
   *  on /order/[id] derives the post-event cleaning step - the equipment-
   *  level equipment_cleaning_status table was retired (Wave 45), so when
   *  equipmentCleaningStatus is empty we derive post_event_cleaning from
   *  these instead: done when every non-cancelled job is status='complete'. */
  cleaningJobsForOrder?: Array<{ created_at?: string | null; actual_end?: string | null; actual_start?: string | null; status?: string | null }>;
  /** Wave 44 T2 - delivery shifts linked to this order via
   *  kitchen_shifts.order_id. When driver_assigned_delivery is the
   *  current stage and this is empty, surface "No driver claimed
   *  yet". */
  deliveryShifts?: Array<{ id: string; staff_id?: string | null; planned_start?: string | null; actual_start?: string | null }>;
  /** Wave 67 Phase E - outsource_assignments rows for this order.
   *  Drives the new outsource_pending blocker on the dispatch leg
   *  when the event is close + at least one provider hasn't
   *  responded yet. Empty array when not joined. */
  outsourceAssignments?: Array<{
    id: string;
    provider_id: string;
    status: string;
    quoted_cost?: number | string | null;
    provider_name?: string | null;
  }>;
  /** Wave 46 T1 - tenant timezone (IANA). Used for calendar-day
   *  comparison when bucketing the urgency tier so "tomorrow" doesn't
   *  collapse to "today" just because the event is <24h away.
   *  Defaults to Africa/Johannesburg if missing. */
  tenantTimezone?: string | null;
  /** On-site service flag (waiter/setup/service phase applies). When false
   *  and no on-site timestamp exists, the setup/service/event/departed
   *  stages are not_applicable (delivery-only orders don't show them).
   *  Derived from requires_waiter / waiter_service_required / attendance. */
  hasOnSiteService?: boolean;
  /** service_ended_at / event_complete_at - sourced from event_attendance
   *  (the waiter panel), which the order row doesn't carry. */
  serviceEndedAt?: string | null;
  eventCompleteAt?: string | null;
  /** Pre-event shopping: whether a shopping run applies + when it finished.
   *  not_applicable when no shopping signal at all. */
  hasShopping?: boolean;
  shoppingReadyAt?: string | null;
}

// --- Cluster + label table -------------------------------------------------

const STAGE_DEFS: Array<{
  key: StageKey;
  label: string;
  group: StageGroup;
}> = [
  { key: "quote_accepted",            label: "Quote accepted",     group: "booking" },
  { key: "order_created",             label: "Order created",      group: "booking" },
  { key: "deposit_invoice_issued",    label: "Deposit invoice",    group: "booking" },
  { key: "deposit_paid",              label: "Deposit paid",       group: "booking" },
  { key: "confirmed",                 label: "Confirmed",          group: "booking" },
  { key: "equipment_hire_booked",     label: "Hire booked",        group: "logistics" },
  { key: "equipment_hire_collected",  label: "Hire collected",     group: "logistics" },
  { key: "pre_event_cleaning",        label: "Pre-event cleaning", group: "logistics" },
  { key: "pre_event_shopping",        label: "Shopping done",      group: "logistics" },
  { key: "kitchen_prep_in_progress",  label: "Kitchen prep",       group: "logistics" },
  { key: "ready_for_dispatch",        label: "Ready",              group: "logistics" },
  { key: "driver_assigned_delivery",  label: "Driver assigned",    group: "dispatch" },
  { key: "in_transit",                label: "On the road",        group: "dispatch" },
  { key: "delivered",                 label: "Delivered",          group: "dispatch" },
  { key: "setup_started",             label: "Setup started",      group: "on_site" },
  { key: "service_started",           label: "Service started",    group: "on_site" },
  { key: "service_ended",             label: "Service ended",      group: "on_site" },
  { key: "event_complete",            label: "Event complete",     group: "on_site" },
  { key: "departed_venue",            label: "Departed venue",     group: "on_site" },
  { key: "collection_scheduled",      label: "Collection scheduled", group: "post_event" },
  { key: "collection_done",           label: "Equipment back",     group: "post_event" },
  { key: "post_event_cleaning",       label: "Post-event cleaning", group: "post_event" },
  { key: "final_invoice_issued",      label: "Final invoice",      group: "closure" },
  { key: "final_invoice_sent",        label: "Invoice sent",       group: "closure" },
  { key: "balance_paid",              label: "Balance paid",       group: "closure" },
  { key: "receipt_issued",            label: "Receipt issued",     group: "closure" },
  { key: "completed",                 label: "Completed",          group: "closure" },
  { key: "thank_you_sent",            label: "Thank-you sent",     group: "closure" },
];

export const STAGE_GROUP_LABELS: Record<StageGroup, string> = {
  booking:    "Booking",
  logistics:  "Logistics",
  dispatch:   "Dispatch",
  on_site:    "On site",
  post_event: "Post-event",
  closure:    "Closure",
};

// --- Flag detection --------------------------------------------------------

function deriveFlags(input: OrderTimelineInput): OrderTimelineFlags {
  const o = input.order || {};
  const hasDeposit = Number(o.deposit_amount || 0) > 0;
  const hasBalance = Number(o.balance_amount || 0) > 0;
  const hasExternalHire =
    (input.equipmentHireOrders || []).length > 0;
  // Owned equipment = an equipment_bookings row pointing to a real
  // equipment_id (vs a hire-only booking). When the joined payload
  // doesn't carry the `equipment` join we fall back to "any booking".
  const hasOwnedEquipment =
    (input.equipmentBookings || []).some((b) => !!b?.equipment_id);
  // Deliver-and-collect logic. Use the explicit column when set; if
  // null, default to "true if the order has any equipment at all" so
  // we don't miss collection on a real event. Reverse this default
  // once the column is reliably populated by the order builder.
  const returnMethod = String(o.equipment_return_method || "").toLowerCase();
  const isDeliverAndCollect = returnMethod
    ? returnMethod === "deliver_and_collect" || returnMethod === "collect"
    : (input.equipmentBookings || []).length > 0;
  const hasCleaningWork =
    (input.equipmentCleaningStatus || []).length > 0 || hasOwnedEquipment;
  const hasPrepTasks = (input.kitchenPrepTasks || []).length > 0;

  return {
    hasDeposit,
    hasBalance,
    hasExternalHire,
    hasOwnedEquipment,
    isDeliverAndCollect,
    hasCleaningWork,
    hasPrepTasks,
  };
}

// --- Per-stage resolvers ---------------------------------------------------
//
// Each resolver returns { status, startedAt, completedAt, blockedReason,
// sourceLink, meta }. The walker calls them in declaration order, then
// applies the "exactly one current" rule on top of the raw outputs.

type Resolved = Omit<OrderTimelineStage, "key" | "label" | "group">;

function resolveStage(
  key: StageKey,
  input: OrderTimelineInput,
  flags: OrderTimelineFlags,
): Resolved {
  const o = input.order || {};
  const orderId = String(o.id || "");
  const adminLink = `/admin/orders?orderId=${orderId}`;

  // Helper: most-recent timestamp from a candidate list.
  const firstTs = (...cs: Array<string | null | undefined>): string | null => {
    for (const c of cs) if (c) return String(c);
    return null;
  };

  switch (key) {
    case "quote_accepted": {
      // Wave 70.49d - if the order was never linked to a quote (manual
      // entry / phone booking / walk-in), this stage doesn't apply at
      // all. Previously it stayed 'upcoming' forever, inflating the
      // admin BOOKING count to N/5 with a phantom 5th step the
      // operator could never close. Mark it not_applicable so the
      // group denominator drops by one and the count reflects what's
      // actually actionable.
      if (!o.quote_id && !input.quoteAccepted) {
        return notApplicable();
      }
      const completedAt = input.quoteAccepted
        ? firstTs(o.created_at)
        : o.created_at && o.quote_id
          ? firstTs(o.created_at)
          : null;
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: o.quote_id ? `/admin/quotes/${o.quote_id}` : null,
      };
    }

    case "order_created": {
      const completedAt = firstTs(o.created_at);
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: adminLink,
      };
    }

    case "deposit_invoice_issued": {
      if (!flags.hasDeposit) {
        return notApplicable();
      }
      const depositInvoice = (input.invoices || []).find(
        (inv) => Number(inv?.total_amount || 0) > 0 && inv?.created_at,
      );
      const completedAt = depositInvoice ? firstTs(depositInvoice.created_at) : null;
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: depositInvoice
          ? `/admin/invoices?id=${depositInvoice.id}`
          : `/admin/invoices?orderId=${orderId}`,
      };
    }

    case "deposit_paid": {
      if (!flags.hasDeposit) {
        return notApplicable();
      }
      const paid = !!o.deposit_paid;
      const completedAt = paid ? firstTs(o.deposit_paid_at) : null;
      const depositPayment = (input.payments || []).find(
        (p) =>
          String(p?.payment_type || "").toLowerCase() === "deposit" &&
          String(p?.status || "").toLowerCase() === "completed",
      );
      return {
        status: paid ? "completed" : "upcoming",
        startedAt: null,
        completedAt: completedAt || (depositPayment ? firstTs(depositPayment.processed_at) : null),
        blockedReason: null,
        sourceLink: `/admin/invoices?orderId=${orderId}`,
        meta: depositPayment
          ? {
              note: `${depositPayment.payment_method || "Payment"} • ${depositPayment.amount}`,
            }
          : undefined,
      };
    }

    case "confirmed": {
      const completedAt = firstTs(o.confirmed_at);
      const isConfirmed = completedAt || (o.status && o.status !== "pending" && o.status !== "draft");
      // Block if deposit required but unpaid - operator should see why
      // confirmation hasn't happened.
      const blocked = !isConfirmed && flags.hasDeposit && !o.deposit_paid;
      return {
        status: isConfirmed ? "completed" : blocked ? "blocked" : "upcoming",
        startedAt: null,
        completedAt: isConfirmed ? (completedAt || firstTs(o.created_at)) : null,
        blockedReason: blocked ? "Deposit not paid" : null,
        sourceLink: adminLink,
      };
    }

    case "equipment_hire_booked": {
      if (!flags.hasExternalHire) return notApplicable();
      const hires = input.equipmentHireOrders || [];
      const allBooked = hires.every((h) => !!h?.expected_pickup_date);
      const earliest = hires
        .map((h) => h?.created_at)
        .filter(Boolean)
        .sort()[0] || null;
      return {
        status: allBooked ? "completed" : "upcoming",
        startedAt: null,
        completedAt: allBooked ? earliest : null,
        blockedReason: null,
        // Wave 66.6 - repoint from /admin/suppliers?orderId=X (which
        // is a generic supplier list that doesn't honour orderId) to
        // the Hire-in tab on /admin/equipment which actually surfaces
        // the equipment_hire_orders rows. HireInPanel was extended in
        // the same wave to honour ?orderId= and filter to this order.
        sourceLink: `/admin/equipment?tab=hire-in&orderId=${orderId}`,
        meta: {
          actor: hires[0]?.supplier_name || null,
          expectedAt: hires[0]?.expected_pickup_date || null,
        },
      };
    }

    case "equipment_hire_collected": {
      if (!flags.hasExternalHire) return notApplicable();
      const hires = input.equipmentHireOrders || [];
      const allCollected = hires.length > 0 && hires.every((h) => !!h?.actual_pickup_date);
      const latest = hires
        .map((h) => h?.actual_pickup_date)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;
      return {
        status: allCollected ? "completed" : "upcoming",
        startedAt: null,
        completedAt: allCollected ? latest : null,
        blockedReason: null,
        // Wave 66.6 - same destination as equipment_hire_booked. The
        // Hire-in tab is the only admin surface that shows hire rows
        // with their actual_pickup_date editable inline.
        sourceLink: `/admin/equipment?tab=hire-in&orderId=${orderId}`,
        meta: {
          expectedAt: hires.find((h) => !h.actual_pickup_date)?.expected_pickup_date || null,
        },
      };
    }

    case "pre_event_cleaning": {
      if (!flags.hasOwnedEquipment) return notApplicable();
      // No column today. Render not_applicable until the migration in
      // Wave 25.4 ships pre_event_cleaning_done_at on equipment_bookings.
      const bookings = input.equipmentBookings || [];
      const allCleaned = bookings.length > 0 && bookings.every(
        (b) => !!b?.pre_event_cleaning_done_at,
      );
      const anyHas = bookings.some((b) => "pre_event_cleaning_done_at" in (b || {}));
      if (!anyHas) {
        return notApplicable();
      }
      return {
        status: allCleaned ? "completed" : "upcoming",
        startedAt: null,
        completedAt: allCleaned
          ? bookings.map((b) => b.pre_event_cleaning_done_at).filter(Boolean).sort().reverse()[0]
          : null,
        blockedReason: null,
        // Wave 66.6 - repoint from /admin/equipment?orderId=X (which
        // didn't honour the param) to /admin/cleaning-schedule, the
        // actual surface where cleaning crew get rostered against the
        // event date. cleaning-schedule was extended in the same wave
        // to honour ?date= and jump to that week.
        sourceLink: o.event_date
          ? `/admin/cleaning-schedule?date=${o.event_date}`
          : `/admin/cleaning-schedule`,
      };
    }

    case "kitchen_prep_in_progress": {
      const tasks = input.kitchenPrepTasks || [];
      if (tasks.length === 0) {
        // No tasks generated yet - upcoming until they are.
        return {
          status: "upcoming",
          startedAt: null,
          completedAt: null,
          blockedReason: null,
          // Wave 66.4 - route to kitchen schedule (see note on the
          // active-tasks branch below). Same destination so the
          // operator always lands on the kitchen surface regardless
          // of whether prep has started.
          sourceLink: o.event_date
            ? `/admin/kitchen-schedule?date=${o.event_date}`
            : `/admin/kitchen-schedule`,
        };
      }
      const totalActive = tasks.filter((t) => String(t?.status || "") !== "skipped").length;
      const done = tasks.filter((t) => String(t?.status || "") === "done").length;
      const inProgress = tasks.some((t) => String(t?.status || "") === "in_progress" || !!t?.started_at);
      const allDone = totalActive > 0 && done >= totalActive;
      let status: StageStatus = "upcoming";
      if (allDone) status = "completed";
      else if (inProgress || o.prep_started_at) status = "current";
      const startedAt = firstTs(o.prep_started_at,
        tasks.map((t) => t?.started_at).filter(Boolean).sort()[0] || null);
      return {
        status,
        startedAt,
        completedAt: allDone
          ? tasks.map((t) => t?.completed_at).filter(Boolean).sort().reverse()[0] || null
          : null,
        blockedReason: null,
        // Wave 66.4 - deep-link to /admin/kitchen-schedule for the
        // event date. The order modal has no kitchen tab (the
        // Wave 25.1 plan to expose prep tasks in the modal never
        // shipped), so the previous link dropped the operator on
        // the order details with no kitchen state visible. The
        // kitchen schedule's Wave 66.2 events row + week grid is
        // the real surface for "open this order's kitchen state".
        sourceLink: o.event_date
          ? `/admin/kitchen-schedule?date=${o.event_date}`
          : `/admin/kitchen-schedule`,
        meta: { progress: { done, total: totalActive } },
      };
    }

    case "ready_for_dispatch": {
      const tasks = input.kitchenPrepTasks || [];
      const totalActive = tasks.filter((t) => String(t?.status || "") !== "skipped").length;
      const done = tasks.filter((t) => String(t?.status || "") === "done").length;
      const allPrepDone = totalActive > 0 && done >= totalActive;
      const explicit = !!o.ready_at || o.status === "ready" || o.status === "in_transit" || o.status === "delivered" || o.status === "completed";
      const completed = explicit || allPrepDone;
      return {
        status: completed ? "completed" : "upcoming",
        startedAt: null,
        completedAt: completed ? firstTs(o.ready_at, o.picked_up_at, o.delivered_at) : null,
        blockedReason: null,
        sourceLink: adminLink,
      };
    }

    case "driver_assigned_delivery": {
      const assigned = !!o.assigned_driver_id || (input.driverAssignments || []).some(
        (a) => ["delivery", "both"].includes(String(a?.assignment_type || "")),
      );
      return {
        status: assigned ? "completed" : "upcoming",
        startedAt: null,
        completedAt: assigned ? firstTs(o.updated_at) : null,
        blockedReason: null,
        sourceLink: `/admin/order-assignments?orderId=${orderId}`,
        meta: { actor: o.driver_name || null },
      };
    }

    case "in_transit": {
      const inTransit = o.status === "in_transit" || !!o.picked_up_at;
      const past = ["delivered", "completed"].includes(String(o.status || ""));
      const status: StageStatus = past ? "completed" : inTransit ? "current" : "upcoming";
      return {
        status,
        startedAt: firstTs(o.picked_up_at),
        completedAt: past ? firstTs(o.delivered_at) : null,
        blockedReason: null,
        sourceLink: `/admin/tracking?orderId=${orderId}`,
      };
    }

    case "delivered": {
      const delivered = !!o.delivered_at || ["delivered", "completed"].includes(String(o.status || ""));
      return {
        status: delivered ? "completed" : "upcoming",
        startedAt: null,
        completedAt: delivered ? firstTs(o.delivered_at) : null,
        blockedReason: null,
        sourceLink: o.pod_photo_url ? `/admin/orders?orderId=${orderId}&pod=1` : adminLink,
        meta: o.pod_recipient_name ? { actor: o.pod_recipient_name } : undefined,
      };
    }

    case "pre_event_shopping": {
      // Only applies when there's a shopping signal (run exists / finished).
      if (!input.hasShopping && !input.shoppingReadyAt) return notApplicable();
      const completedAt = firstTs(input.shoppingReadyAt);
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: o.event_date ? `/admin/shopping?date=${o.event_date}` : `/admin/shopping`,
      };
    }

    // --- On-site service phase (setup -> service -> event end -> depart).
    // Applies when the order needs on-site service (waiter / setup), or once
    // any on-site timestamp has been stamped. Delivery-only orders leave the
    // whole phase not_applicable so it never shows phantom upcoming steps.
    case "setup_started":
    case "service_started":
    case "service_ended":
    case "event_complete":
    case "departed_venue": {
      const onSite = !!(
        input.hasOnSiteService ||
        o.requires_waiter ||
        o.waiter_service_required ||
        o.setup_started_at ||
        o.service_started_at ||
        o.departed_venue_at ||
        input.serviceEndedAt ||
        input.eventCompleteAt ||
        // Order-column fallback (departed_venue trigger mirrors these
        // onto orders for driver-run jobs with no waiter attendance).
        o.service_ended_at ||
        o.event_complete_at
      );
      if (!onSite) return notApplicable();
      const at =
        key === "setup_started"   ? firstTs(o.setup_started_at) :
        key === "service_started" ? firstTs(o.service_started_at) :
        key === "service_ended"   ? firstTs(input.serviceEndedAt, o.service_ended_at) :
        key === "event_complete"  ? firstTs(input.eventCompleteAt, o.event_complete_at) :
                                    firstTs(o.departed_venue_at);
      return {
        status: at ? "completed" : "upcoming",
        startedAt: null,
        completedAt: at,
        blockedReason: null,
        sourceLink: adminLink,
      };
    }

    case "collection_scheduled": {
      if (!flags.isDeliverAndCollect) return notApplicable();
      const collection = (input.driverAssignments || []).find(
        (a) => String(a?.assignment_type || "") === "collection",
      );
      const scheduled = !!collection;
      return {
        status: scheduled ? "completed" : "upcoming",
        startedAt: null,
        completedAt: scheduled ? firstTs(collection.created_at) : null,
        blockedReason: null,
        // Wave 66.6 - repoint from /admin/driver-schedule (no
        // orderId or type handling) to /admin/order-assignments,
        // which already auto-expands the matching row via the Wave
        // 66.3 deeplink effect. Operator lands directly on the
        // assignment drawer where they can pick a collection driver.
        sourceLink: `/admin/order-assignments?orderId=${orderId}`,
      };
    }

    case "collection_done": {
      if (!flags.isDeliverAndCollect) return notApplicable();
      const collection = (input.driverAssignments || []).find(
        (a) => String(a?.assignment_type || "") === "collection",
      );
      // From the client's side the collection is done the moment the gear
      // is physically collected ('picked_up'); they no longer wait for the
      // driver's return drive to base ('completed'). Treat either as done,
      // and prefer the picked_up time as the completion stamp when present.
      const cstatus = collection ? String(collection.status || "") : "";
      const done = cstatus === "picked_up" || cstatus === "completed";
      return {
        status: done ? "completed" : "upcoming",
        startedAt: collection ? firstTs(collection.started_at) : null,
        completedAt: done
          ? firstTs(collection.picked_up_at || collection.completed_at)
          : null,
        blockedReason: null,
        // Wave 66.6 - same destination as collection_scheduled.
        sourceLink: `/admin/order-assignments?orderId=${orderId}`,
      };
    }

    case "post_event_cleaning": {
      if (!flags.hasCleaningWork) return notApplicable();
      const rows = input.equipmentCleaningStatus || [];
      // Wave 66.6 - cleaningLink centralises the repoint so both the
      // empty-rows branch and the rows-present branch land on the
      // same actionable surface (cleaning-schedule for the event day).
      const cleaningLink = o.event_date
        ? `/admin/cleaning-schedule?date=${o.event_date}`
        : `/admin/cleaning-schedule`;
      if (rows.length === 0) {
        // equipment_cleaning_status retired (Wave 45). Derive from the
        // order's cleaning_jobs (triggered_by_event_id) the same way
        // OrderTimelineSection does on /order/[id], so the admin list +
        // every other computeOrderTimeline surface shows the SAME cleaning
        // progress as the order page (was stuck on "upcoming" forever).
        const jobs = (input.cleaningJobsForOrder || []).filter(
          (j) => String(j?.status || "") !== "cancelled",
        );
        if (jobs.length > 0) {
          const allComplete = jobs.every((j) => String(j?.status || "") === "complete");
          const anyInProgress = jobs.some((j) => String(j?.status || "") === "in_progress");
          const completedAt = allComplete
            ? jobs.map((j) => j?.actual_end).filter(Boolean).sort().reverse()[0] || null
            : null;
          const startedAt = jobs.map((j) => j?.actual_start || j?.created_at).filter(Boolean).sort()[0] || null;
          return {
            status: allComplete ? "completed" : anyInProgress ? "current" : "upcoming",
            startedAt: allComplete ? startedAt : (anyInProgress ? startedAt : null),
            completedAt,
            blockedReason: null,
            sourceLink: cleaningLink,
            meta: {
              progress: {
                done: jobs.filter((j) => String(j?.status || "") === "complete").length,
                total: jobs.length,
              },
            },
          };
        }
        return {
          status: "upcoming",
          startedAt: null,
          completedAt: null,
          blockedReason: null,
          sourceLink: cleaningLink,
        };
      }
      const allReady = rows.every((r) =>
        ["ready", "stored", "available"].includes(String(r?.current_status || "")),
      );
      const inProgress = rows.some((r) =>
        ["cleaning", "drying"].includes(String(r?.current_status || "")),
      );
      const status: StageStatus = allReady ? "completed" : inProgress ? "current" : "upcoming";
      const completedAt = allReady
        ? rows.map((r) => r?.cleaning_completed_at || r?.ready_for_use_at).filter(Boolean).sort().reverse()[0] || null
        : null;
      const startedAt = inProgress
        ? rows.map((r) => r?.cleaning_started_at).filter(Boolean).sort()[0] || null
        : null;
      return {
        status,
        startedAt,
        completedAt,
        blockedReason: null,
        sourceLink: cleaningLink,
        meta: {
          progress: {
            done: rows.filter((r) => ["ready", "stored", "available"].includes(String(r?.current_status || ""))).length,
            total: rows.length,
          },
        },
      };
    }

    case "final_invoice_issued": {
      // Heuristic: any invoice with total_amount close to order.total_amount.
      const orderTotal = Number(o.total_amount || 0);
      const finalInv = (input.invoices || []).find((inv) => {
        const t = Number(inv?.total_amount || 0);
        return orderTotal === 0 ? t > 0 : Math.abs(t - orderTotal) <= Math.max(1, orderTotal * 0.05);
      }) || (input.invoices || [])[0];
      const completedAt = finalInv ? firstTs(finalInv.created_at, finalInv.invoice_date) : null;
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: finalInv
          ? `/admin/invoices?id=${finalInv.id}`
          : `/admin/invoices?orderId=${orderId}`,
      };
    }

    case "final_invoice_sent": {
      const finalInv = (input.invoices || []).find((inv) => !!inv?.sent_at);
      const completedAt = finalInv ? firstTs(finalInv.sent_at) : null;
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: finalInv
          ? `/admin/invoices?id=${finalInv.id}`
          : `/admin/invoices?orderId=${orderId}`,
      };
    }

    case "balance_paid": {
      if (!flags.hasBalance) return notApplicable();
      const paid = !!o.balance_paid;
      const completedAt = paid ? firstTs(o.balance_paid_at) : null;
      const balancePayment = (input.payments || []).find(
        (p) =>
          ["order", "balance"].includes(String(p?.payment_type || "").toLowerCase()) &&
          String(p?.status || "").toLowerCase() === "completed",
      );
      // Block when balance is past due.
      let blocked = false;
      let blockedReason: string | null = null;
      if (!paid && o.balance_due_date) {
        try {
          const due = new Date(o.balance_due_date);
          if (due.getTime() < Date.now()) {
            blocked = true;
            blockedReason = "Balance overdue";
          }
        } catch { /* ignore */ }
      }
      return {
        status: paid ? "completed" : blocked ? "blocked" : "upcoming",
        startedAt: null,
        completedAt: completedAt || (balancePayment ? firstTs(balancePayment.processed_at) : null),
        blockedReason,
        sourceLink: `/admin/invoices?orderId=${orderId}`,
      };
    }

    case "receipt_issued": {
      if (!flags.hasBalance) return notApplicable();
      // Two signals: payments.receipt_sent_at (Wave 25.4 column) OR an
      // email_automation_log row of receipt template type. Until the
      // column ships, fall back to the email log heuristic.
      const balancePayment = (input.payments || []).find(
        (p) => String(p?.payment_type || "").toLowerCase() !== "deposit",
      );
      const colTs = balancePayment?.receipt_sent_at || null;
      const emailReceipt = (input.emailLog || []).find((e) =>
        /receipt/i.test(String(e?.template_type || "")),
      );
      const completedAt = colTs || (emailReceipt ? firstTs(emailReceipt.sent_at, emailReceipt.created_at) : null);
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: `/admin/invoices?orderId=${orderId}`,
      };
    }

    case "completed": {
      const completed = o.status === "completed" || !!o.completed_at;
      return {
        status: completed ? "completed" : "upcoming",
        startedAt: null,
        completedAt: completed ? firstTs(o.completed_at) : null,
        blockedReason: null,
        sourceLink: adminLink,
      };
    }

    case "thank_you_sent": {
      const ty = (input.emailLog || []).find((e) => {
        const t = String(e?.template_type || "");
        return /thank|order_completed|review_request/i.test(t);
      });
      const completedAt = ty ? firstTs(ty.sent_at, ty.created_at) : null;
      return {
        status: completedAt ? "completed" : "upcoming",
        startedAt: null,
        completedAt,
        blockedReason: null,
        sourceLink: adminLink,
      };
    }

    default:
      return notApplicable();
  }
}

function notApplicable(): Resolved {
  return {
    status: "not_applicable",
    startedAt: null,
    completedAt: null,
    blockedReason: null,
    sourceLink: null,
  };
}

// --- Public API ------------------------------------------------------------

export function computeOrderTimeline(input: OrderTimelineInput): OrderTimeline {
  const flags = deriveFlags(input);

  // Resolve every stage independently.
  const resolved: OrderTimelineStage[] = STAGE_DEFS.map((def) => {
    const r = resolveStage(def.key, input, flags);
    return { ...def, ...r };
  });

  // Monotonic operational completion. Each stage resolves from its OWN
  // sub-data (prep tasks, shopping list, hire rows), so a DELIVERED order
  // could still show an earlier operational stage as 'current' just
  // because that sub-data was never fully ticked off (e.g. prep tasks left
  // at 4/8). On the client portal this surfaced as "Preparing your food"
  // being the next step on an order that had already been delivered. If
  // the order has operationally reached delivery, every operational stage
  // up to and including delivery is complete by definition. Payment /
  // closure stages are deliberately NOT touched - they complete on their
  // own schedule (a client can prepay or pay late, independent of the
  // operational flow).
  const ord = input.order || {};
  const deliveredReached =
    ["delivered", "completed"].includes(String(ord.status || "")) ||
    !!ord.delivered_at || !!ord.completed_at;
  if (deliveredReached) {
    const OP_UP_TO_DELIVERY = new Set<StageKey>([
      "quote_accepted", "order_created", "confirmed",
      "equipment_hire_booked", "equipment_hire_collected",
      "pre_event_cleaning", "pre_event_shopping",
      "kitchen_prep_in_progress", "ready_for_dispatch",
      "driver_assigned_delivery", "in_transit", "delivered",
    ]);
    const opCompletedAt =
      (ord.delivered_at as string) || (ord.completed_at as string) || (ord.updated_at as string) || null;
    for (const stage of resolved) {
      if (!OP_UP_TO_DELIVERY.has(stage.key)) continue;
      if (stage.status === "not_applicable" || stage.status === "skipped" || stage.status === "completed") continue;
      stage.status = "completed";
      if (!stage.completedAt) stage.completedAt = opCompletedAt;
    }
  }

  // Apply the "exactly one current" rule. Walk in order; the first
  // stage that isn't completed/skipped/not_applicable becomes current
  // (unless it's already blocked, in which case its own resolver set
  // status='blocked' and we leave that). Stages after the current one
  // stay upcoming.
  let foundCurrent = false;
  for (const stage of resolved) {
    if (stage.status === "not_applicable" || stage.status === "skipped") continue;
    if (stage.status === "completed") continue;
    if (!foundCurrent) {
      // First non-completed stage becomes the current focus. Preserve
      // 'blocked' and 'current' statuses set by the resolver, otherwise
      // promote 'upcoming' to 'current'.
      if (stage.status === "upcoming") stage.status = "current";
      foundCurrent = true;
    } else {
      // Subsequent non-completed stages stay upcoming - never two
      // currents in a row.
      if (stage.status === "current" || stage.status === "blocked") {
        stage.status = "upcoming";
      }
    }
  }

  const currentStage = resolved.find((s) => s.status === "current" || s.status === "blocked") || null;
  const blockedStages = resolved.filter((s) => s.status === "blocked");
  const applicableStages = resolved.filter(
    (s) => s.status !== "not_applicable" && s.status !== "skipped",
  );
  const completedStages = resolved.filter((s) => s.status === "completed");
  const isFullyComplete = completedStages.length === applicableStages.length;

  // Wave 43 T3 + Wave 46 T1 - urgency tier with calendar-day
  // comparison in the tenant's timezone. Hour-bucketing meant a
  // tomorrow-evening event opened at midday today flipped to "today"
  // (because <24h away) even though the operator's wall clock said
  // tomorrow. Calendar-day match honours the operator's mental model.
  let msToEvent: number | null = null;
  let urgency: OrderTimelineUrgency = "normal";
  const evDate = input.order?.event_date as string | null | undefined;
  if (evDate) {
    const evTime = (input.order?.event_time as string | null | undefined) || "12:00:00";
    const tz = input.tenantTimezone || DEFAULT_TENANT_TIMEZONE;
    // msToEvent stays absolute UTC - pulse / countdown still uses
    // raw delta. Only the bucketing flips to calendar-day.
    const evMs = new Date(`${evDate}T${evTime}`).getTime();
    if (!Number.isNaN(evMs)) {
      msToEvent = evMs - Date.now();
      if (isFullyComplete) {
        urgency = "normal";
      } else {
        const nowDate = new Date();
        const todayLocal = toZonedISO(nowDate, tz);
        const tomorrowLocal = toZonedISO(
          new Date(nowDate.getTime() + 24 * 60 * 60 * 1000),
          tz,
        );
        // event_date is stored as YYYY-MM-DD already in tenant tz.
        if (evDate < todayLocal) urgency = "overdue";
        else if (evDate === todayLocal) urgency = "today";
        else if (evDate === tomorrowLocal) urgency = "tomorrow";
        else {
          // Within 7 days = "soon", otherwise "normal".
          const daysOut = Math.floor((evMs - nowDate.getTime()) / 86_400_000);
          urgency = daysOut <= 7 ? "soon" : "normal";
        }
      }
    }
  }

  // Wave 44 T2 - cross-system blocker detection. Two sources today,
  // both gated on the current stage: it doesn't help to flag "no
  // driver" when we're still on kitchen prep. Empty array when the
  // caller didn't join cleaningJobsActive / deliveryShifts.
  const crossSystemBlockers: CrossSystemBlocker[] = [];
  const currentKey = currentStage?.key || null;

  if (currentKey === "kitchen_prep_in_progress" || currentKey === "ready_for_dispatch") {
    const orderEquipmentIds = new Set<string>(
      (input.equipmentBookings || [])
        .map((b: any) => b?.equipment_id)
        .filter((x: any): x is string => typeof x === "string"),
    );
    if (orderEquipmentIds.size > 0) {
      const stuck = (input.cleaningJobsActive || []).filter((j) =>
        orderEquipmentIds.has(j.equipment_id),
      );
      if (stuck.length > 0) {
        const names = Array.from(
          new Set(stuck.map((s) => s.equipment_name || "Equipment").filter(Boolean)),
        ).slice(0, 3);
        crossSystemBlockers.push({
          kind: "equipment_in_cleaning",
          message:
            stuck.length === 1
              ? `${names[0]} still being cleaned - can't dispatch yet.`
              : `${stuck.length} items still in cleaning (${names.join(", ")}${stuck.length > names.length ? "..." : ""}).`,
          severity: "warning",
        });
      }
    }
  }

  if (currentKey === "driver_assigned_delivery") {
    const liveShifts = (input.deliveryShifts || []).filter((s) => !!s.staff_id);
    if (liveShifts.length === 0) {
      crossSystemBlockers.push({
        kind: "no_delivery_shift",
        message: "No driver shift covers this dispatch yet.",
        severity: "error",
      });
    }
  }

  // Wave 66.6 - vehicle_not_booked blocker. When the dispatch leg
  // is current and there's no assigned_vehicle_id on the order, the
  // driver can be assigned but they have no vehicle to load. Fires
  // for the dispatch cluster only (ready_for_dispatch /
  // driver_assigned_delivery / in_transit) because flagging missing
  // vehicle on a confirmed-but-not-yet-staged order is noise --
  // dispatchService.assignDriverWithGate auto-books the best vehicle
  // when a driver is assigned, so the gap usually closes naturally.
  const dispatchStages: Array<typeof currentKey> = [
    "ready_for_dispatch",
    "driver_assigned_delivery",
    "in_transit",
  ];
  if (currentKey && dispatchStages.includes(currentKey) && !input.order?.assigned_vehicle_id) {
    // Severity tier: warning normally, error when event is within 24h.
    const within24h = msToEvent != null && msToEvent >= 0 && msToEvent <= 24 * 3_600_000;
    crossSystemBlockers.push({
      kind: "vehicle_not_booked",
      message: within24h
        ? "No vehicle booked - assign or override on dispatch before the run."
        : "No vehicle booked yet. Auto-books when a driver is assigned.",
      severity: within24h ? "error" : "warning",
    });
  }

  // Wave 66.6 - pickup_time blocker. The driver can't be told when
  // to leave the kitchen if pickup_time is null. Surfaced from the
  // ready_for_dispatch + driver_assigned_delivery stages so it
  // appears at the point in the pipeline where it matters.
  if (
    currentKey
    && ["ready_for_dispatch", "driver_assigned_delivery"].includes(currentKey)
    && !input.order?.pickup_time
  ) {
    const within48h = msToEvent != null && msToEvent >= 0 && msToEvent <= 48 * 3_600_000;
    crossSystemBlockers.push({
      kind: "pickup_time_missing",
      message: within48h
        ? "Pickup time missing - driver doesn't know when to leave the kitchen."
        : "Pickup time still unset for this run.",
      severity: within48h ? "error" : "warning",
    });
  }

  // Wave 66.6 - setup_time blocker. Setup_time is a client
  // commitment (we said we'd arrive at 16:00 to set up); when it's
  // null and the event is approaching, the venue crew has no
  // arrival target. Fires from ready_for_dispatch onwards so it
  // doesn't shout during early booking.
  if (
    currentKey
    && ["ready_for_dispatch", "driver_assigned_delivery", "in_transit"].includes(currentKey)
    && !input.order?.setup_time
  ) {
    const within24h = msToEvent != null && msToEvent >= 0 && msToEvent <= 24 * 3_600_000;
    crossSystemBlockers.push({
      kind: "setup_time_missing",
      message: within24h
        ? "Setup time missing - crew doesn't know when to start at the venue."
        : "Setup time still unset.",
      severity: within24h ? "error" : "warning",
    });
  }

  // Wave 67 Phase E - outsource provider hasn't responded yet. The
  // blocker is real (you can't run the event if the on-site chef
  // didn't accept), so severity escalates aggressively as the event
  // approaches. Fires regardless of the current stage because an
  // unresponded outsource matters at booking time and at delivery
  // time - there's no "later" for this gap to surface.
  const outsourceRows = input.outsourceAssignments || [];
  const pendingOutsource = outsourceRows.filter((a) => a?.status === "requested");
  if (pendingOutsource.length > 0) {
    const within72h = msToEvent != null && msToEvent >= 0 && msToEvent <= 72 * 3_600_000;
    const within7d = msToEvent != null && msToEvent >= 0 && msToEvent <= 7 * 24 * 3_600_000;
    const severity: "warning" | "error" = within72h ? "error" : "warning";
    const namesPreview = Array.from(
      new Set(pendingOutsource.map((a) => a.provider_name).filter((x): x is string => !!x)),
    ).slice(0, 2);
    const namePart = namesPreview.length > 0 ? ` (${namesPreview.join(", ")}${pendingOutsource.length > namesPreview.length ? "..." : ""})` : "";
    crossSystemBlockers.push({
      kind: "outsource_pending",
      message: within72h
        ? `${pendingOutsource.length} outsource provider${pendingOutsource.length === 1 ? "" : "s"}${namePart} haven't responded - chase or reassign.`
        : within7d
          ? `${pendingOutsource.length} outsource provider${pendingOutsource.length === 1 ? "" : "s"}${namePart} still to confirm.`
          : `${pendingOutsource.length} outsource provider request${pendingOutsource.length === 1 ? "" : "s"} pending.`,
      severity,
    });
  }
  // Outsource decline alert - this needs the operator's attention
  // immediately regardless of timing because they need to find an
  // alternative.
  const declinedOutsource = outsourceRows.filter((a) => a?.status === "declined");
  if (declinedOutsource.length > 0) {
    const names = Array.from(
      new Set(declinedOutsource.map((a) => a.provider_name).filter((x): x is string => !!x)),
    ).slice(0, 2);
    crossSystemBlockers.push({
      kind: "outsource_pending",
      message: `${declinedOutsource.length} outsource provider${declinedOutsource.length === 1 ? "" : "s"}${names.length > 0 ? ` (${names.join(", ")})` : ""} declined - assign someone else.`,
      severity: "error",
    });
  }

  return {
    orderId: String(input.order?.id || ""),
    computedAt: new Date().toISOString(),
    currentStageKey: currentStage ? currentStage.key : null,
    currentClusterKey: currentStage ? currentStage.group : null,
    blocked: blockedStages.length > 0,
    blockedReason: blockedStages[0]?.blockedReason || null,
    stages: resolved,
    flags,
    completedCount: completedStages.length,
    applicableCount: applicableStages.length,
    urgency,
    msToEvent,
    crossSystemBlockers,
  };
}

// --- Client projection ----------------------------------------------------
//
// Wave 26: clients (the people booking the catering) don't need the
// 22-stage operator view. They care about a much shorter story:
//   "Did you confirm? Did you take my deposit? Are you cooking? Is
//    the driver coming? Did it arrive? Did you collect the gear? Am
//    I done paying? Are we wrapped up?"
//
// toClientTimeline() projects the operator OrderTimeline down to a
// client-friendly subset, hiding the operational stages (hire flow,
// pre/post cleaning, ready-for-dispatch, driver assignment, invoice
// issued/sent mechanics, receipt, thank-you). The remaining stages
// keep their status values from the operator timeline so the client
// view stays in sync with the operator view automatically.

const CLIENT_VISIBLE_STAGES: StageKey[] = [
  "order_created",
  "deposit_paid",
  "confirmed",
  "kitchen_prep_in_progress",
  "in_transit",
  "delivered",
  "collection_done",
  "balance_paid",
  "completed",
];

const CLIENT_LABELS: Partial<Record<StageKey, { label: string; group: StageGroup }>> = {
  order_created:            { label: "Order received",     group: "booking" },
  deposit_paid:             { label: "Deposit received",   group: "booking" },
  confirmed:                { label: "Booking confirmed",  group: "booking" },
  kitchen_prep_in_progress: { label: "Preparing your food", group: "logistics" },
  in_transit:               { label: "On the way",          group: "dispatch" },
  delivered:                { label: "Delivered",           group: "dispatch" },
  // Wave 70.49d - relabelled from "Equipment collected" to "Equipment
  // returned". Two reasons. First, the old label collided semantically
  // with the admin-only "Collection scheduled" stage (operators
  // comparing the two views couldn't tell whether "Equipment collected"
  // meant scheduling-done or collection-done - the latter, but the
  // name read like the former). Second, "Equipment returned" is the
  // accurate post-event verb for the client's vantage point ("the team
  // came and picked up our gear after the event"). The admin-side
  // label stays "Equipment back" (warehouse-vantage); both describe
  // the same `collection_done` stage from different sides of the
  // transaction.
  collection_done:          { label: "Equipment returned",  group: "post_event" },
  balance_paid:             { label: "Final payment received", group: "closure" },
  completed:                { label: "All wrapped up",      group: "closure" },
};

/**
 * Project the operator timeline down to the ~9 stages a client
 * actually needs to see. Hides operational details (hire flow,
 * pre/post cleaning, dispatch internals, receipt mechanics, etc).
 *
 * Re-runs the "exactly one current" walker against the projected
 * stage list so the client current dot lands on the next visible
 * client-meaningful action even when the operator's current stage
 * is something internal like 'final_invoice_sent'. Stages stripped
 * from the client view are absorbed into the surrounding visible
 * stages - a client whose order is currently mid-prep sees
 * 'Preparing your food' regardless of whether the operator dot is
 * on prep or already on ready_for_dispatch.
 */
export function toClientTimeline(operator: OrderTimeline): OrderTimeline {
  const visibleSet = new Set<StageKey>(CLIENT_VISIBLE_STAGES);

  // Map the operator stages to a client list, stripping non-visible
  // stages and relabeling. Order is preserved from the operator
  // timeline so the cluster band still reads booking -> logistics ->
  // dispatch -> post-event -> closure.
  const clientStages: OrderTimelineStage[] = operator.stages
    .filter((s) => visibleSet.has(s.key))
    .map((s) => {
      const override = CLIENT_LABELS[s.key];
      return {
        ...s,
        label: override?.label || s.label,
        group: override?.group || s.group,
        // Strip internal blockedReason text - show a generic
        // "waiting for the team" instead of e.g. "Deposit not paid"
        // which the client themselves caused.
        blockedReason: s.blockedReason ? "Waiting on the team" : null,
        // Drop internal meta (prep progress 5/8, hire supplier name,
        // etc) - the client doesn't need to see operational detail.
        meta: undefined,
        // Strip admin source links. Client-facing pages route their
        // own click handlers (e.g. magic-link page opens a deposit
        // payment dialog rather than /admin/invoices).
        sourceLink: null,
      };
    });

  // Re-run the "exactly one current" walker over the projected list.
  // Reset every visible stage's status by recomputing from operator
  // status mappings:
  //   completed in operator -> completed
  //   current/blocked in operator -> current/blocked
  //   upcoming in operator -> upcoming
  //   not_applicable / skipped in operator -> not_applicable
  // Then enforce one-current.
  let foundCurrent = false;
  for (const stage of clientStages) {
    if (stage.status === "not_applicable" || stage.status === "skipped") continue;
    if (stage.status === "completed") continue;
    if (!foundCurrent) {
      if (stage.status === "upcoming") stage.status = "current";
      foundCurrent = true;
    } else {
      if (stage.status === "current" || stage.status === "blocked") {
        stage.status = "upcoming";
      }
    }
  }

  const currentStage = clientStages.find((s) => s.status === "current" || s.status === "blocked") || null;
  const applicable = clientStages.filter((s) => s.status !== "not_applicable" && s.status !== "skipped");
  const completed = clientStages.filter((s) => s.status === "completed");
  const blockedAny = clientStages.some((s) => s.status === "blocked");

  return {
    ...operator,
    stages: clientStages,
    currentStageKey: currentStage ? currentStage.key : null,
    currentClusterKey: currentStage ? currentStage.group : null,
    blocked: blockedAny,
    blockedReason: blockedAny ? "Waiting on the team" : null,
    completedCount: completed.length,
    applicableCount: applicable.length,
  };
}

