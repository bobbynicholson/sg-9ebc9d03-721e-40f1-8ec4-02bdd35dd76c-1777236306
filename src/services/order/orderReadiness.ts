/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Order Readiness -- "what's still missing for this event to actually
 * happen?" computed across orders + their related row-sets.
 *
 * Wave 46 T2. Sibling pure function to computeOrderTimeline.
 * Different mental model:
 *   - timeline = "where are we in the pipeline?" (22-stage walker)
 *   - readiness = "what's missing pre-flight?" (logistics traffic light)
 *
 * Drives the green/orange/red chip on the order card. The chip
 * REPLACES the existing "Next to do" banner, not stacks with it --
 * the operator should see ONE summary line, not two competing ones.
 *
 * MVP scope (Wave 46): 6 HIGH signals only. The remaining 5 HIGH
 * + 6 MEDIUM signals + expanded chevron breakdown defer to Wave 47.
 *
 * Pure -- no DB, no side effects. Caller batch-fetches the row-sets
 * (see /admin/orders) and feeds them in.
 */

import type {
  OrderTimelineInput,
  OrderTimeline,
  OrderTimelineUrgency,
  CrossSystemBlocker,
} from "./orderTimeline";

export type ReadinessChip = "green" | "orange" | "red";
export type ReadinessSeverity = "high" | "medium";

export interface ReadinessSignal {
  /** Stable key for sorting / dedup / future per-stage routing. */
  key: string;
  severity: ReadinessSeverity;
  passing: boolean;
  /** Plain-English status. Used as the chip's expanded line. */
  message: string;
  /** Optional deep-link to the page that fixes this signal. */
  actionLink?: string | null;
}

export interface OrderReadiness {
  orderId: string;
  chip: ReadinessChip;
  /** Headline copy for the chip. Matches Bobby's "lovely vibe" register. */
  headline: string;
  /** Sub-line: count of failing signals OR a celebratory message. */
  subhead: string;
  signals: ReadinessSignal[];
  failingHigh: ReadinessSignal[];
  failingMedium: ReadinessSignal[];
  computedAt: string;
}

/**
 * Extra row-sets the readiness check needs that aren't in the
 * timeline input. Caller batch-fetches per order.
 */
export interface OrderReadinessInputExtras {
  /** order_items for this order. Drives 'menu_items_present'. */
  orderItems?: Array<{ item_name?: string | null; quantity?: number | null }>;
  /** kitchen_shifts where shift_date = order.event_date AND
   *  shift_type IN ('kitchen', 'kitchen_and_cleaning'). Drives
   *  'kitchen_shift_event_day'. */
  kitchenShiftsEventDay?: Array<{ id: string; staff_id?: string | null; status?: string | null }>;
  /** vehicles row matching orders.assigned_vehicle_id. Drives
   *  'vehicle_assigned'. Reserved for Wave 47 service-due signal. */
  vehicle?: { id: string; next_service_due?: string | null } | null;
}

/** Aggregation thresholds. Matches the brief's "logistics-supply-chain" framing. */
const RED_HOURS_WINDOW = 48;
const RED_MEDIUM_WINDOW = 24;

/**
 * Wave 46 T2 -- compute readiness for one order.
 *
 * The signals fold in BOTH derived state (driver assigned + shift covers
 * + accepted) AND the existing crossSystemBlockers from the timeline so
 * the chip is the single source of truth. No double-compute.
 *
 * Aggregation rules (from the strategy audit):
 *   blocked stage      -> red regardless of signal pass-rate
 *   crossSystemBlockers (severity=error) -> red
 *   crossSystemBlockers (severity=warning) -> at least orange
 *   any HIGH failing AND <=48h to event -> red
 *   balance overdue                     -> red
 *   any HIGH failing (event > 48h out)  -> orange
 *   any MEDIUM failing AND <=24h        -> red (escalates close to event)
 *   any MEDIUM failing                  -> orange
 *   all HIGH passing AND no blockers    -> green
 */
export function computeOrderReadiness(
  input: OrderTimelineInput & OrderReadinessInputExtras,
  timeline: OrderTimeline,
  opts?: { now?: Date },
): OrderReadiness {
  const now = opts?.now || new Date();
  const o = input.order || {};
  const orderId = String(o.id || "");
  const orderLink = `/admin/orders?orderId=${orderId}`;
  const signals: ReadinessSignal[] = [];

  const evDate = o.event_date as string | null | undefined;
  const evTime = (o.event_time as string | null | undefined) || "12:00:00";
  const msToEvent = evDate
    ? new Date(`${evDate}T${evTime}`).getTime() - now.getTime()
    : null;
  const hoursToEvent = msToEvent != null ? msToEvent / 3_600_000 : null;
  const within48h = hoursToEvent != null && hoursToEvent <= RED_HOURS_WINDOW && hoursToEvent >= 0;
  const within24h = hoursToEvent != null && hoursToEvent <= RED_MEDIUM_WINDOW && hoursToEvent >= 0;

  // ---- HIGH signals (MVP set) -------------------------------------------

  // 1. Client section is contactable + venue is set.
  // Bobby asked: "is client section sorted and perfect?" This signal
  // covers: name + (email OR phone) + venue address.
  const clientName = (o.client_name || "").trim();
  const clientEmail = (o.client_email || "").trim();
  const clientPhone = (o.client_phone || "").trim();
  const venueAddr = (o.venue_address || "").trim();
  const clientContactable =
    !!clientName && (!!clientEmail || !!clientPhone) && !!venueAddr;
  signals.push({
    key: "client_contactable",
    severity: "high",
    passing: clientContactable,
    message: clientContactable
      ? `Client section ready: ${clientName}.`
      : !clientName
        ? "Client name missing."
        : !venueAddr
          ? "Venue address missing -- driver won't know where to go."
          : "Client has no email or phone -- can't send confirmation.",
    actionLink: orderLink,
  });

  // 2. Balance not overdue.
  const balanceDueDate = o.balance_due_date as string | null | undefined;
  const balancePaid = !!o.balance_paid;
  const balanceOverdue = !balancePaid
    && !!balanceDueDate
    && new Date(balanceDueDate).getTime() < now.getTime();
  signals.push({
    key: "balance_not_overdue",
    severity: "high",
    passing: !balanceOverdue,
    message: balanceOverdue
      ? `Balance overdue (due ${balanceDueDate}). Chase or convert to COD.`
      : "Balance on track.",
    actionLink: `/admin/invoices?orderId=${orderId}`,
  });

  // 3. Driver-truly-assigned (3-state per strategy audit):
  //    a) orders.assigned_driver_id populated
  //    b) driver_assignments row with status in ('assigned','accepted','en_route','picked_up')
  //    c) kitchen_shifts(shift_type='delivery', order_id=this) covers dispatch
  // Pass only when ALL THREE hold. Otherwise message names the gap.
  const assignedDriverId = (o.assigned_driver_id as string | null | undefined) || null;
  const driverAssignmentsRows = input.driverAssignments || [];
  const driverHasAcceptedAssignment = driverAssignmentsRows.some(
    (a: any) =>
      String(a?.assignment_type || "delivery") === "delivery"
      && ["assigned", "accepted", "en_route", "picked_up"].includes(String(a?.status || "")),
  );
  const deliveryShifts = input.deliveryShifts || [];
  const driverShiftCovers = deliveryShifts.some((s) => !!s.staff_id);
  const driverAllInPlace = !!assignedDriverId && driverHasAcceptedAssignment && driverShiftCovers;
  const driverGap = !assignedDriverId
    ? "No driver assigned yet."
    : !driverHasAcceptedAssignment
      ? "Driver assigned but hasn't accepted -- no driver_assignments row."
      : !driverShiftCovers
        ? "Driver assigned but no delivery shift covers the dispatch window."
        : null;
  signals.push({
    key: "driver_truly_assigned",
    severity: "high",
    passing: driverAllInPlace,
    message: driverGap || "Driver assigned, accepted, and shift covers dispatch.",
    actionLink: `/admin/order-assignments?orderId=${orderId}`,
  });

  // 4. Kitchen shift booked for the event date.
  const chefRostered =
    !!input.kitchenShiftsEventDay && input.kitchenShiftsEventDay.length > 0;
  signals.push({
    key: "kitchen_shift_event_day",
    severity: "high",
    passing: chefRostered,
    message: chefRostered
      ? "Kitchen rostered for event day."
      : "No kitchen staff rostered for the event date -- nobody's cooking.",
    actionLink: `/admin/kitchen-schedule${evDate ? `?date=${evDate}` : ""}`,
  });

  // 5. Kitchen prep tasks generated.
  const prepTasks = input.kitchenPrepTasks || [];
  const prepReady = prepTasks.length > 0;
  signals.push({
    key: "kitchen_prep_tasks_present",
    severity: "high",
    passing: prepReady,
    message: prepReady
      ? `${prepTasks.length} prep tasks generated.`
      : "No prep tasks on the chef's board yet.",
    actionLink: `/admin/orders?orderId=${orderId}&tab=kitchen`,
  });

  // 6. Menu items + venue present.
  const items = input.orderItems || [];
  const menuPresent = items.length > 0 && items.every((it) => (it.item_name || "").trim().length > 0);
  signals.push({
    key: "menu_items_present",
    severity: "high",
    passing: menuPresent,
    message: menuPresent
      ? `${items.length} menu items locked.`
      : items.length === 0
        ? "No menu items on this order."
        : "Some menu items are missing names.",
    actionLink: `/admin/orders?orderId=${orderId}&tab=menu`,
  });

  // ---- crossSystemBlockers fold-in --------------------------------------
  // Strategy audit: route blockers INTO readiness signals so the chip is
  // single source of truth. Don't double-count: skip if a corresponding
  // signal above already failed for the same reason.
  for (const blocker of timeline.crossSystemBlockers || []) {
    if (blocker.kind === "no_delivery_shift") {
      // Already covered by driver_truly_assigned above. Skip.
      continue;
    }
    signals.push({
      key: `blocker:${blocker.kind}`,
      severity: blocker.severity === "error" ? "high" : "medium",
      passing: false,
      message: blocker.message,
      actionLink: orderLink,
    });
  }

  // ---- Aggregate to chip ------------------------------------------------

  const failingHigh = signals.filter((s) => s.severity === "high" && !s.passing);
  const failingMedium = signals.filter((s) => s.severity === "medium" && !s.passing);
  const stageBlocked = !!timeline.blocked;
  const hasErrorBlocker = (timeline.crossSystemBlockers || []).some((b) => b.severity === "error");

  let chip: ReadinessChip = "green";
  if (
    stageBlocked
    || hasErrorBlocker
    || balanceOverdue
    || (failingHigh.length > 0 && within48h)
    || (failingMedium.length > 0 && within24h)
  ) {
    chip = "red";
  } else if (failingHigh.length > 0 || failingMedium.length > 0) {
    chip = "orange";
  }

  // ---- Headline + subhead copy (Bobby's lovely-vibe register) -----------
  const orderLabel = (o.order_number || "").trim() || "this event";
  const eventWhen = renderEventWhen(timeline.urgency, evDate);
  let headline: string;
  let subhead: string;

  if (chip === "green") {
    headline = `All set for ${orderLabel}${eventWhen ? " " + eventWhen : ""}. ✨`;
    subhead = "Driver, kitchen, equipment all confirmed. Nothing to do.";
  } else if (chip === "orange") {
    const count = failingHigh.length + failingMedium.length;
    headline = `Almost there -- ${count} thing${count === 1 ? "" : "s"} to wrap up`;
    subhead = (failingHigh[0] || failingMedium[0])?.message || "Check the breakdown.";
  } else {
    headline = `Needs your attention before ${orderLabel}${eventWhen ? " " + eventWhen : ""}`;
    const top = failingHigh[0] || failingMedium[0];
    subhead = top?.message || "Multiple gaps -- open the order.";
  }

  return {
    orderId,
    chip,
    headline,
    subhead,
    signals,
    failingHigh,
    failingMedium,
    computedAt: now.toISOString(),
  };
}

function renderEventWhen(urgency: OrderTimelineUrgency, evDate: string | null | undefined): string {
  switch (urgency) {
    case "today": return "today";
    case "tomorrow": return "tomorrow";
    case "overdue": return evDate ? `(${evDate} -- past)` : "(past)";
    case "soon": return "this week";
    default: return evDate ? `on ${evDate}` : "";
  }
}

// Re-export the shared types so consumers don't need a second import.
export type { CrossSystemBlocker, OrderTimeline, OrderTimelineInput };
