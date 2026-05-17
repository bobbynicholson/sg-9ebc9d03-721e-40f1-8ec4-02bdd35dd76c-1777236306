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
  /** Wave 70.9 -- when set, the chip renders an inline action
   *  button instead of a deep-link. The chip dispatches the
   *  action to the page-level handler (e.g. POST a regenerate
   *  endpoint and refresh). */
  actionType?: "regenerate_prep_tasks" | null;
  /** Optional override for the action button label when actionType
   *  is set. Defaults to "Fix it". */
  actionLabel?: string | null;
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

  // Wave 70.17 / 70.22 -- past-event + terminal-status derived
  // flags. Hoisted to function scope so both the prep-signal
  // emit-time check and the post-process operational suppression
  // pass can read them without re-deriving.
  const orderStatus = (o.status || "").toString().toLowerCase();
  const isTerminalStatus = ["delivered", "completed", "cancelled", "refunded"].includes(orderStatus);
  const isEventPast = hoursToEvent != null && hoursToEvent < 0;

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
    // Wave 70.35: &action=chase tells the invoices page to scroll
    // to + highlight the invoice for this order so the operator
    // can pick Mark paid / Send reminder without hunting the list.
    actionLink: `/admin/invoices?orderId=${orderId}&action=chase`,
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

  // 3b. Driver acknowledged the assignment (MEDIUM).
  // Wave 64.4 -- read accepted_at as the durable truth source instead
  // of pattern-matching the status enum. Status is a workflow column
  // that drifts (e.g. lockstep mirror jumps from 'assigned' straight
  // to 'en_route' on the in_transit transition, skipping 'accepted').
  // accepted_at is stamped once when the assignment is accepted (either
  // by claim_order RPC self-claim, or by the Wave 64.4 admin auto-
  // accept in dispatchService.assignDriverWithGate) and never cleared.
  // Status fallback widened to include delivered + completed so a
  // post-event chip that's missing accepted_at on a legacy row still
  // reads as passing.
  if (assignedDriverId) {
    const driverAssignmentsRows = input.driverAssignments || [];
    const driverHasAcceptedAssignment = driverAssignmentsRows.some(
      (a: any) =>
        String(a?.assignment_type || "delivery") === "delivery"
        && (
          !!a?.accepted_at
          || ["accepted", "en_route", "picked_up", "delivered", "completed"].includes(String(a?.status || ""))
        ),
    );
    signals.push({
      key: "driver_acknowledged",
      severity: "medium",
      passing: driverHasAcceptedAssignment,
      message: driverHasAcceptedAssignment
        ? "Driver acknowledged the assignment."
        : "Driver hasn't checked in on the run yet -- ping them on the day.",
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
  //
  // Wave 70.17 -- suppress the "no prep tasks" warning (and the
  // Generate now button) when the order is already past the
  // point where prep is meaningful:
  //   - event is in the past (hoursToEvent < 0): the food was
  //     either made or wasn't, generating prep now is pointless
  //   - status is terminal (delivered / completed / cancelled):
  //     the job is closed, prep is no longer applicable
  // In those cases we still emit the signal but flip it to passing
  // with a context-appropriate message so the chip doesn't render
  // a misleading "high severity, action required" row.
  const prepTasks = input.kitchenPrepTasks || [];
  const prepReady = prepTasks.length > 0;
  const prepNotApplicable = isTerminalStatus || isEventPast;
  signals.push({
    key: "kitchen_prep_tasks_present",
    severity: "high",
    passing: prepReady || prepNotApplicable,
    message: prepReady
      ? `${prepTasks.length} prep tasks generated.`
      : isTerminalStatus
        ? `Order ${orderStatus} -- prep no longer applicable.`
        : isEventPast
          ? "Event has passed -- prep no longer applicable."
          : "No prep tasks on the chef's board yet.",
    // Wave 70.9 / 70.17 -- when failing AND prep is still
    // applicable, the action is a direct regenerate so the
    // owner can recover stuck orders in one click. When the
    // signal is passing (real or by-context), no action link
    // and no Generate-now button.
    actionLink: prepReady && !prepNotApplicable
      ? `/admin/kitchen-schedule${evDate ? `?date=${evDate}` : ""}`
      : null,
    actionType: prepReady || prepNotApplicable ? null : "regenerate_prep_tasks",
    // Wave 70.37 -- relabelled from cryptic "Generate now" to
    // "Generate prep tasks" so the operator knows WHAT is being
    // generated. The chip also surfaces a hover tooltip explaining
    // the auto-create behaviour.
    actionLabel: prepReady || prepNotApplicable ? null : "Generate prep tasks",
  });

  // ---- Wave 47 -- additional HIGH signals -------------------------------

  // 7. Client has been emailed about this booking.
  // Wave 64.5 -- pre-Wave-64.5 the signal only counted rows where
  // template_type='booking_confirmation', but nothing in the codebase
  // ever writes that template_type to email_automation_log. The
  // system fires order_status_update + driver_assigned + the
  // aftersales_/pre_event_ template families, none of which matched.
  // Net effect: the signal was always-failing on every order, the
  // chip read "client hasn't been told" even after multiple status
  // emails went out, and the Fix it link sent operators to a modal
  // with nothing to click. Now: pass if ANY email about this order
  // has been sent or delivered. If they've heard from us, they
  // know about the booking.
  const emailLog = input.emailLog || [];
  const confirmationSent = emailLog.some(
    (r: any) => ["sent", "delivered"].includes(String(r?.status || "")),
  );
  signals.push({
    key: "confirmation_email_sent",
    severity: "high",
    passing: confirmationSent,
    message: confirmationSent
      ? "Client has been emailed about this booking."
      : `${clientName || "Client"} hasn't received any email about this booking yet -- send a confirmation.`,
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
  // Wave 66.3 -- copy was "driver doesn't know when to head back",
  // which ambiguously read as "head back to base after the run".
  // The field semantics are actually "when the driver LEAVES the
  // kitchen with the order to head out to the venue" -- it's the
  // start-of-day pickup, not the end-of-day collection. New copy
  // says "leave the kitchen" so there's no interpretation drift.
  // Action routing: setup_time is a client-facing commitment ("we'll
  // be there at 16:00 to set up") and stays on the order modal where
  // the operator manages the booking. pickup_time is a logistics
  // decision (dispatcher sets it based on driver availability, route,
  // prep readiness) so when ONLY pickup is missing the Fix it link
  // jumps to /admin/order-assignments?orderId=X where the dispatcher
  // can edit it inline. Order modal also gained an inline editor in
  // the same wave so the both-missing case stays on the modal.
  const setupTime = (o.setup_time as string | null | undefined) || null;
  const pickupTime = (o.pickup_time as string | null | undefined) || null;
  const timesPresent = !!setupTime && !!pickupTime;
  const onlyPickupMissing = !!setupTime && !pickupTime;
  signals.push({
    key: "setup_pickup_times_set",
    severity: "high",
    passing: timesPresent,
    message: timesPresent
      ? "Setup + pickup times set."
      : !setupTime && !pickupTime
        ? "Setup + pickup times missing -- crew doesn't know when to start and driver doesn't know when to leave the kitchen."
        : !pickupTime
          ? "Pickup time missing -- driver doesn't know when to leave the kitchen."
          : "Setup time missing -- crew doesn't know when to start.",
    actionLink: onlyPickupMissing
      ? `/admin/order-assignments?orderId=${orderId}`
      : orderLink,
  });

  // Wave 67 Phase E -- outsource provider confirmed.
  // Skips when the order has no outsource assignments. Otherwise
  // passes when every assignment is in an accepted / en_route /
  // on_site / completed state. Fires high-severity because an
  // unconfirmed on-site chef is an event-killer.
  const outsourceRows = (input as any).outsourceAssignments as Array<{
    id: string; status: string; provider_name?: string | null;
  }> | undefined;
  if (Array.isArray(outsourceRows) && outsourceRows.length > 0) {
    const live = outsourceRows.filter((a) => a.status !== "cancelled");
    const allConfirmed = live.length > 0 && live.every(
      (a) => ["accepted", "en_route", "on_site", "completed"].includes(a.status),
    );
    const declined = live.filter((a) => a.status === "declined");
    const pending = live.filter((a) => a.status === "requested");
    let message: string;
    if (allConfirmed) {
      message = `${live.length} outsource provider${live.length === 1 ? "" : "s"} confirmed.`;
    } else if (declined.length > 0) {
      const namesList = Array.from(new Set(declined.map((a) => a.provider_name).filter((x): x is string => !!x))).slice(0, 2);
      message = `${declined.length} provider${declined.length === 1 ? "" : "s"} declined${namesList.length ? ` (${namesList.join(", ")})` : ""} -- assign someone else.`;
    } else if (pending.length > 0) {
      const namesList = Array.from(new Set(pending.map((a) => a.provider_name).filter((x): x is string => !!x))).slice(0, 2);
      message = `${pending.length} outsource provider${pending.length === 1 ? "" : "s"}${namesList.length ? ` (${namesList.join(", ")})` : ""} haven't responded yet -- chase or reassign.`;
    } else {
      message = `${live.length} outsource provider${live.length === 1 ? "" : "s"} in flight.`;
    }
    signals.push({
      key: "outsource_confirmed",
      severity: "high",
      passing: allConfirmed,
      message,
      actionLink: orderLink,
    });
  }

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
      // Wave 64.5 -- deep-link to the Equipment tab where the hire
      // rows live, not the default Details tab. The pickup-date
      // editor still ships in a future wave; for now the operator
      // at least lands on the correct tab and sees the hire list.
      actionLink: `${orderLink}&tab=equipment`,
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
    // Wave 70.35: &action=send tells the invoices page to scroll
    // to the row AND auto-open the Send dialog so the operator
    // can fix it in one click instead of hunting and clicking
    // Send themselves.
    actionLink: `/admin/invoices?orderId=${orderId}&action=send`,
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

  // Wave 54.2 -- sort failing signals by impact-on-event-success
  // weight, NOT insertion order. Pre-Wave-54 the chip ordered signals
  // by the order they were pushed in this file -- so menu_items_present
  // (HIGH but coded last) ranked BELOW client_phone_present (MEDIUM but
  // coded earlier) when both failed. Operator triaged the wrong gap
  // first. The weight table here is the operator's mental ranking of
  // "which gap kills the event soonest if unfixed".
  const failingHigh = signals
    .filter((s) => s.severity === "high" && !s.passing)
    .sort((a, b) => _signalWeight(b.key) - _signalWeight(a.key));
  const failingMedium = signals
    .filter((s) => s.severity === "medium" && !s.passing)
    .sort((a, b) => _signalWeight(b.key) - _signalWeight(a.key));

  // Wave 70.22 -- post-process: on past-event / terminal-status
  // orders, suppress operational signals that are no longer
  // actionable. A "no driver assigned" warning on an event that
  // happened yesterday is noise -- the event already happened;
  // there's nothing to assign. We KEEP signals that are still
  // actionable on past orders (balance_not_overdue, invoice_sent,
  // client_contactable) so chase-the-client / send-the-invoice
  // workflows stay visible.
  //
  // Wave 70.17 already handled the prep signal at emit time;
  // this central post-process catches the other operational
  // signals without forcing every push() to know the rule.
  // (isTerminalStatus + isEventPast hoisted to function scope.)
  if (isTerminalStatus || isEventPast) {
    const operationalKeys = new Set([
      "driver_assigned",
      "driver_acknowledged",
      "kitchen_shift_event_day",
      "setup_pickup_times_set",
      "outsource_confirmed",
      "hire_pickup_dates_set",
      "pre_event_cleaning",
      "requires_two_drivers_covered",
      "vehicle_service_ok",
      "menu_items_present",
    ]);
    const suppressMsg = isTerminalStatus
      ? `Order ${orderStatus} -- no longer applicable.`
      : "Event has passed -- no longer applicable.";
    for (const sig of signals) {
      if (!operationalKeys.has(sig.key)) continue;
      if (sig.passing) continue;
      sig.passing = true;
      sig.message = suppressMsg;
      sig.actionLink = null;
      sig.actionType = null;
      sig.actionLabel = null;
    }
    // Recompute failing arrays after the suppression pass.
    failingHigh.length = 0;
    failingMedium.length = 0;
    for (const s of signals) {
      if (s.passing) continue;
      if (s.severity === "high") failingHigh.push(s);
      else if (s.severity === "medium") failingMedium.push(s);
    }
    failingHigh.sort((a, b) => _signalWeight(b.key) - _signalWeight(a.key));
    failingMedium.sort((a, b) => _signalWeight(b.key) - _signalWeight(a.key));
  }

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

/**
 * Wave 54.2 -- per-signal severity weight used to sort the chip's
 * failing list. Higher weight = surfaces first. The numbers themselves
 * are arbitrary; only the relative order matters. Anything not in this
 * table gets weight 0 (still inside its tier, but at the back of the
 * list).
 *
 * The operator's mental ranking: balance overdue + missing menu / driver
 * are existential ("kills the event today"). Phone / email / vehicle
 * service are escalations. Setup time + hire dates are tactical.
 */
function _signalWeight(key: string): number {
  const WEIGHTS: Record<string, number> = {
    // Existential -- the event cannot run without these
    balance_not_overdue: 100,
    menu_items_present: 95,
    driver_assigned: 90,
    kitchen_shift_event_day: 85,
    kitchen_prep_tasks_present: 80,
    // Wave 67 Phase E -- outsource provider rank. Unconfirmed
    // on-site chef is as event-killing as missing the kitchen
    // roster, so it sits in the same tier.
    outsource_confirmed: 82,
    pre_event_cleaning: 75,
    requires_two_drivers_covered: 70,
    setup_pickup_times_set: 65,
    hire_pickup_dates_set: 60,
    // Comms / contactability -- escalations, not blockers
    confirmation_email_sent: 50,
    invoice_sent: 45,
    client_contactable: 40,
    client_phone_present: 30,
    // Operational hygiene
    vehicle_service_ok: 25,
    driver_acknowledged: 20,
  };
  return WEIGHTS[key] ?? 0;
}

// Re-export the shared types so consumers don't need a second import.
export type { CrossSystemBlocker, OrderTimeline, OrderTimelineInput };
