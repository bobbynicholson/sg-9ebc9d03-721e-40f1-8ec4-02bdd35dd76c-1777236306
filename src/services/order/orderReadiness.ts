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
   *  'vehicle_service_ok'. */
  vehicle?: { id: string; next_service_due?: string | null; nickname?: string | null; plate?: string | null } | null;
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
  // Wave 47 truth-source fix: read invoice.due_date (the operator-
  // facing date the customer sees on the invoice) instead of
  // orders.balance_due_date (drifts apart from the invoice -- e.g.
  // ORD-003828 has order=2026-05-09 but invoice=2026-06-13).
  // Mark paid if either flag indicates payment.
  const balancePaid =
    !!o.balance_paid
    || (input.invoices || []).some((inv: any) => !!inv?.paid_at);
  const invoiceDueDate = (input.invoices || [])
    .map((inv: any) => inv?.due_date as string | null | undefined)
    .filter((d: string | null | undefined): d is string => !!d)
    .sort()[0]
    || (o.balance_due_date as string | null | undefined);
  const balanceOverdue = !balancePaid
    && !!invoiceDueDate
    && new Date(invoiceDueDate).getTime() < now.getTime();
  signals.push({
    key: "balance_not_overdue",
    severity: "high",
    passing: !balanceOverdue,
    message: balanceOverdue
      ? _formatOverdueBalanceMessage(invoiceDueDate as string, now)
      : "Balance on track.",
    actionLink: `/admin/invoices?orderId=${orderId}`,
  });

  // 3. Driver assigned (Wave 47 simplification).
  // Wave 46 demanded a 3-state check. The strategy audit + live
  // ORD-003828 audit revealed two of the three were unsatisfiable
  // for admin-driven assignments: dispatchService.assignDriverWithGate
  // never wrote driver_assignments (Wave 47 Phase A fixes that),
  // and NO code path writes kitchen_shifts(shift_type='delivery',
  // order_id=...). The dispatch UI considers "driver assigned"
  // as orders.assigned_driver_id + audit row -- that's what the
  // operator sees, so that's the truth source.
  // The "accepted" state moves to a separate MEDIUM signal below
  // (driver_acknowledged) so the chip can still surface it.
  const assignedDriverId = (o.assigned_driver_id as string | null | undefined) || null;
  signals.push({
    key: "driver_assigned",
    severity: "high",
    passing: !!assignedDriverId,
    message: assignedDriverId
      ? "Driver assigned."
      : "No driver assigned yet.",
    actionLink: `/admin/order-assignments?orderId=${orderId}`,
  });

  // 3b. Driver acknowledged the assignment (MEDIUM -- Wave 47 split).
  // Reads driver_assignments.status (preferred) OR order_assignment_audit
  // for an 'accepted' event. Skips if no driver assigned (covered above).
  if (assignedDriverId) {
    const driverAssignmentsRows = input.driverAssignments || [];
    const driverHasAcceptedAssignment = driverAssignmentsRows.some(
      (a: any) =>
        String(a?.assignment_type || "delivery") === "delivery"
        && ["accepted", "en_route", "picked_up"].includes(String(a?.status || "")),
    );
    signals.push({
      key: "driver_acknowledged",
      severity: "medium",
      passing: driverHasAcceptedAssignment,
      message: driverHasAcceptedAssignment
        ? "Driver acknowledged the assignment."
        : "Driver hasn't accepted the assignment yet -- nudge them.",
      actionLink: `/admin/order-assignments?orderId=${orderId}`,
    });
  }

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

  // ---- Wave 47 -- additional HIGH signals -------------------------------

  // 7. Booking confirmation email sent to client.
  const emailLog = input.emailLog || [];
  const confirmationSent = emailLog.some(
    (r: any) =>
      r?.template_type === "booking_confirmation"
      && ["sent", "delivered"].includes(String(r?.status || "")),
  );
  signals.push({
    key: "confirmation_email_sent",
    severity: "high",
    passing: confirmationSent,
    message: confirmationSent
      ? "Booking confirmation sent to client."
      : `${clientName || "Client"} hasn't received a booking confirmation -- send one before the event.`,
    actionLink: orderLink,
  });

  // 8. Vehicle service in date for the event.
  // NULL next_service_due treated as PASS (don't blanket-flag every
  // vehicle on tenants that don't track service intervals yet).
  const vehicle = input.vehicle || null;
  if (vehicle) {
    const serviceOk =
      !vehicle.next_service_due
      || (!!evDate && new Date(vehicle.next_service_due).getTime() >= new Date(evDate).getTime());
    const vehicleLabel = vehicle.nickname || vehicle.plate || "Vehicle";
    signals.push({
      key: "vehicle_service_ok",
      severity: "high",
      passing: serviceOk,
      message: serviceOk
        ? `${vehicleLabel} service in date.`
        : `${vehicleLabel} service overdue (was due ${vehicle.next_service_due}) -- not safe to dispatch.`,
      actionLink: "/admin/vehicles",
    });
  }

  // 9. Setup + pickup times set.
  const setupTime = (o.setup_time as string | null | undefined) || null;
  const pickupTime = (o.pickup_time as string | null | undefined) || null;
  const timesPresent = !!setupTime && !!pickupTime;
  signals.push({
    key: "setup_pickup_times_set",
    severity: "high",
    passing: timesPresent,
    message: timesPresent
      ? "Setup + pickup times set."
      : !setupTime && !pickupTime
        ? "Setup + pickup times missing -- driver doesn't know when to arrive or head back."
        : !pickupTime
          ? "Pickup time missing -- driver doesn't know when to head back."
          : "Setup time missing -- crew doesn't know when to start.",
    actionLink: orderLink,
  });

  // 10. Hire pickup dates set (n/a-skip when no hire orders).
  const hireRows = input.equipmentHireOrders || [];
  if (hireRows.length > 0) {
    const allHireBooked = hireRows.every((h: any) => !!h?.expected_pickup_date);
    const missingCount = hireRows.filter((h: any) => !h?.expected_pickup_date).length;
    signals.push({
      key: "hire_pickup_dates_set",
      severity: "high",
      passing: allHireBooked,
      message: allHireBooked
        ? "Hire supplier pickups booked."
        : `Hire supplier pickup not booked for ${missingCount} item${missingCount === 1 ? "" : "s"}.`,
      actionLink: orderLink,
    });
  }

  // 11. Pre-event cleaning complete (Wave 47 derived from cleaning_jobs
  // since equipment_bookings.pre_event_cleaning_done_at column doesn't
  // exist on the live DB). For every equipment_id booked on this
  // order, expect a cleaning_jobs row with status='complete' completed
  // before event_date. Skips when no equipment is booked.
  const bookings = input.equipmentBookings || [];
  if (bookings.length > 0) {
    // input.cleaningJobsActive only carries queued/in_progress jobs.
    // The presence of an active job for one of our equipment IDs
    // means it's NOT yet ready -- which is what we flag.
    const orderEqIdsForCleaning = new Set<string>(
      bookings
        .map((b: any) => b?.equipment_id)
        .filter((x: any): x is string => typeof x === "string"),
    );
    const stillCleaningCount = (input.cleaningJobsActive || []).filter((j) =>
      orderEqIdsForCleaning.has(j.equipment_id),
    ).length;
    const cleaningOk = stillCleaningCount === 0;
    signals.push({
      key: "pre_event_cleaning",
      severity: "high",
      passing: cleaningOk,
      message: cleaningOk
        ? "Equipment cleaning complete."
        : `Pre-event cleaning not signed off for ${stillCleaningCount} item${stillCleaningCount === 1 ? "" : "s"}.`,
      actionLink: "/team-portal/cleaning/dashboard",
    });
  }

  // ---- Wave 47 -- additional MEDIUM signals -----------------------------

  // M1. Client phone present (driver tap-to-call enabled).
  signals.push({
    key: "client_phone_present",
    severity: "medium",
    passing: !!clientPhone,
    message: !!clientPhone
      ? "Client phone on file."
      : `No phone for ${clientName || "client"} -- driver can't call on the day.`,
    actionLink: orderLink,
  });

  // M2. Two-driver job covered by two assignments. n/a-skip otherwise.
  if (o.requires_two_drivers) {
    const deliveryShifts = input.deliveryShifts || [];
    const driversCovered = deliveryShifts.filter((s) => !!s.staff_id).length;
    const twoCovered = driversCovered >= 2;
    signals.push({
      key: "requires_two_drivers_covered",
      severity: "medium",
      passing: twoCovered,
      message: twoCovered
        ? "Two drivers covering the run."
        : `Two-driver job but only ${driversCovered} assigned -- second driver missing.`,
      actionLink: `/admin/order-assignments?orderId=${orderId}`,
    });
  }

  // M3. Invoice has been sent to the client.
  const invoiceSent = (input.invoices || []).some((inv: any) => !!inv?.sent_at);
  signals.push({
    key: "invoice_sent",
    severity: "medium",
    passing: invoiceSent,
    message: invoiceSent
      ? "Invoice delivered."
      : "Invoice never sent to the client.",
    actionLink: `/admin/invoices?orderId=${orderId}`,
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
  // single source of truth. Wave 47 -- signal #3 became 'driver_assigned'
  // only (was 3-state in Wave 46), so the no_delivery_shift blocker is
  // no longer redundant and folds in. equipment_in_cleaning is also
  // covered by signal #11 (pre_event_cleaning) but with a different
  // copy lens, so we still skip it to avoid two signals on the same
  // underlying state.
  for (const blocker of timeline.crossSystemBlockers || []) {
    if (blocker.kind === "equipment_in_cleaning") {
      // Covered by pre_event_cleaning signal above.
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
  // Wave 52 -- format the event date as a human label, not the raw
  // YYYY-MM-DD coming back from PostgREST. "9 May" beats "2026-05-09".
  const friendly = evDate ? _formatFriendlyDate(evDate) : null;
  switch (urgency) {
    case "today": return "today";
    case "tomorrow": return "tomorrow";
    case "overdue": return friendly ? `(${friendly} -- past)` : "(past)";
    case "soon": return "this week";
    default: return friendly ? `on ${friendly}` : "";
  }
}

/** Wave 52 -- shared "9 May" / "9 May 2026" formatter. Returns the
 *  raw input on parse failure rather than crashing. */
function _formatFriendlyDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return sameYear
      ? d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
      : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

/**
 * Wave 52 -- format the overdue balance signal as a human sentence.
 *
 * Pre-Wave-52 the message interpolated the raw ISO timestamp:
 *   "Balance overdue (due 2026-05-09T00:00:00+00:00). Chase or convert to COD."
 * Bobby's brief: too many numbers, the timestamp is unreadable. Now:
 *   "Balance is 6 days overdue (was due 9 May). Chase the client."
 *   "Balance is 1 day overdue (was due yesterday). Chase the client."
 *   "Balance was due today and is unpaid. Chase the client."
 *
 * Defensive: if the date can't be parsed, fall back to a clean
 * shape without numbers ("Balance overdue. Chase the client.")
 * rather than leaking the raw string.
 */
function _formatOverdueBalanceMessage(dueIso: string, now: Date): string {
  let dueDate: Date;
  try {
    dueDate = new Date(dueIso);
    if (Number.isNaN(dueDate.getTime())) throw new Error("invalid");
  } catch {
    return "Balance overdue. Chase the client.";
  }

  // Days difference, ignoring time-of-day. Compute on the date
  // components only so 23:59 yesterday and 00:01 today both read
  // as "yesterday" / "today".
  const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysOverdue = Math.round((todayMidnight - dueMidnight) / (24 * 60 * 60 * 1000));

  const shortDate = dueDate.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

  if (daysOverdue <= 0) {
    // Due today (or technically future, which shouldn't reach this
    // branch, but be safe).
    return "Balance was due today and is unpaid. Chase the client.";
  }
  if (daysOverdue === 1) {
    return "Balance is 1 day overdue (was due yesterday). Chase the client.";
  }
  return `Balance is ${daysOverdue} days overdue (was due ${shortDate}). Chase the client.`;
}

// Re-export the shared types so consumers don't need a second import.
export type { CrossSystemBlocker, OrderTimeline, OrderTimelineInput };
