/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "./notificationService";
import { UserRole } from "@/types/app";
import { toLocalISO } from "@/lib/localDate";

// Admin-side roles that should receive dispatch / driver-status pings.
// Audit (May 2026) found notifyAdminOfConfirmation + sendEnRouteAlert
// were routing to orders.user_id - which on this codebase is the
// CLIENT, not the admin. Pings landed in client inboxes with
// admin-style copy and /admin/* deep links.
// Driver status updates go to the CATERING company's own dispatch/admin
// roles - NOT super_admin. super_admin is the SaaS platform owner, who has
// no reason to receive a tenant's per-trip driver movements (it's noise and
// cross-tenant). The company_admin (the business owner) + admin +
// region_admin are the people who actually run the day's logistics.
const ADMIN_DISPATCH_ROLES: UserRole[] = [
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
  UserRole.REGION_ADMIN,
];

export interface DriverConfirmation {
  id: string;
  order_id: string;
  driver_id: string;
  confirmation_type:
    | 'en_route_to_kitchen'
    | 'at_kitchen'
    | 'departed_kitchen'
    | 'at_venue'
    | 'setup_started'
    | 'service_started'
    | 'departed_venue'
    | 'completed';
  confirmed_at: string;
  location_lat?: number;
  location_lng?: number;
  notes?: string;
  created_at: string;
}

export interface DriverConfirmationWithDetails extends DriverConfirmation {
  driver_name?: string;
  order_number?: string;
}

export const driverConfirmationService = {
  /**
   * Driver confirms they are en-route to kitchen
   */
  async confirmEnRouteToKitchen(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    const { data, error } = await (supabase as any)
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'en_route_to_kitchen',
        location_lat: location?.lat,
        location_lng: location?.lng,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Send notification to admin
    await this.notifyAdminOfConfirmation(orderId, driverId, 'en_route_to_kitchen');

    // Send WhatsApp to client
    await this.sendWhatsAppNotification(orderId, 'driver_en_route');

    return data as DriverConfirmation;
  },

  /**
   * Driver confirms arrival at kitchen
   */
  async confirmAtKitchen(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    const { data, error } = await (supabase as any)
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'at_kitchen',
        location_lat: location?.lat,
        location_lng: location?.lng,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    await this.notifyAdminOfConfirmation(orderId, driverId, 'at_kitchen');

    // Kitchen auto clock-out: once the driver is at the kitchen to collect,
    // the kitchen's cooking for THIS order is done, so close any open
    // kitchen duty shift tied to this order. The shift is order-scoped, so
    // this won't touch a chef's shift for a different order. Best-effort.
    try {
      const { kitchenDutyService } = await import("@/services/kitchenDutyService");
      const { data: shifts } = await supabase
        .from("kitchen_duty_shifts")
        .select("id, staff_id, user_id, company_id")
        .eq("order_id", orderId)
        .eq("is_active", true);
      if (shifts && shifts.length) {
        // One lookup for a clearer message + a company_id fallback.
        const { data: ord } = await supabase
          .from("orders")
          .select("company_id, order_number")
          .eq("id", orderId)
          .maybeSingle();
        const { notificationService } = await import("@/services/notificationService");
        for (const s of shifts as any[]) {
          await kitchenDutyService.endDutyShift(s.id, "Auto clock-out: driver arrived to collect");
          // Tell the kitchen staffer their shift was closed FOR them, so a
          // chef who forgot to clock out isn't left "on shift" indefinitely
          // (hours stop accruing at the right moment) and knows it happened.
          const recipientId = s.staff_id || s.user_id;
          if (recipientId) {
            try {
              await notificationService.createNotification({
                company_id: s.company_id || (ord as any)?.company_id || null,
                recipient_id: recipientId,
                user_id: recipientId,
                notification_type: "kitchen_clock_out",
                title: "You've been clocked out",
                message: `Your kitchen shift for ${(ord as any)?.order_number || "this order"} was closed automatically when the driver arrived to collect.`,
                priority: "normal",
                link: "/team-portal/kitchen/duty",
                related_entity_type: "order",
                related_entity_id: orderId,
              });
            } catch (notifyErr) {
              console.warn("[confirmAtKitchen] kitchen staff notify failed (non-blocking):", notifyErr);
            }
          }
        }
      }
    } catch (dutyErr) {
      console.warn("[confirmAtKitchen] kitchen auto clock-out failed (non-blocking):", dutyErr);
    }

    return data as DriverConfirmation;
  },

  /**
   * Driver confirms departure from kitchen
   */
  async confirmDepartedKitchen(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    // Wave 49 B3 - handover gate. Block the depart-kitchen tap until
    // a kitchen staff member has signed the equipment_handovers row
    // for this order. Pre-Wave-49 the driver could roll out without
    // anyone proving the food + equipment got loaded - pure trust.
    // Now the kitchen lead's HandoverToDriverPanel sign-off is a
    // hard prerequisite. Bypass available via env flag for dev.
    if (process.env.NEXT_PUBLIC_BYPASS_HANDOVER_GATE !== "true") {
      const { count: handoverCount, error: handoverErr } = await (supabase as any)
        .from("equipment_handovers")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .eq("from_stage", "kitchen")
        .eq("to_stage", "driver");
      if (handoverErr) {
        console.warn("[confirmDepartedKitchen] handover probe failed - letting through:", handoverErr);
      } else if (!handoverCount || handoverCount === 0) {
        throw new Error(
          "Kitchen has not signed this order over yet. Ask the kitchen lead to tap 'Sign over to driver' first.",
        );
      }
    }

    const { data, error } = await (supabase as any)
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'departed_kitchen',
        location_lat: location?.lat,
        location_lng: location?.lng,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    await this.notifyAdminOfConfirmation(orderId, driverId, 'departed_kitchen');

    // Send WhatsApp to client with tracking link
    await this.sendWhatsAppNotification(orderId, 'driver_departed');

    // Advance order status so the central sendStatusNotifications
    // fan-out fires (client email, in-app pushes, audit trail).
    // Audit Notif G4 - previously this only inserted a
    // driver_confirmations row + best-effort WhatsApp stub; the
    // order status stayed at 'ready' forever and no client-facing
    // email signalled the driver was en route. Non-blocking.
    try {
      const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
      await updateOrderStatus(orderId, "in_transit" as any, driverId);
    } catch (statusErr) {
      console.warn("[confirmDepartedKitchen] order status flip failed (non-blocking):", statusErr);
    }

    // Keep the driver_assignments row in sync. The driver run sheet
    // (this service) and the driver tracking page update different tables -
    // the tracking page reads driver_assignments.status and only shows the
    // delivery for assigned/accepted/en_route/picked_up/at_venue. Without
    // this the assignment stayed at its old status (or 'delivered' on a
    // re-run) so departing made the order vanish from the driver's map.
    // Best-effort, non-blocking.
    try {
      await supabase
        .from("driver_assignments")
        .update({ status: "en_route", picked_up_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("driver_id", driverId)
        .eq("assignment_type", "delivery");
    } catch (asgErr) {
      console.warn("[confirmDepartedKitchen] assignment sync failed (non-blocking):", asgErr);
    }

    // Guarantee the client gets "Driver on the way" + the live tracking link
    // on departure. The status-transition fan-out normally fires this, but if
    // the order was already in_transit (re-confirm / out-of-order taps) that
    // flip is a no-op and the client got nothing. Fire it directly, deduped
    // against the transition path so it never doubles up. Non-blocking.
    try {
      const { data: ord } = await supabase
        .from("orders")
        .select("company_id, order_number, client_id")
        .eq("id", orderId)
        .maybeSingle();
      const clientId = (ord as any)?.client_id;
      if (clientId && (ord as any)?.company_id) {
        const { data: cl } = await supabase
          .from("clients")
          .select("user_id")
          .eq("id", clientId)
          .maybeSingle();
        const clientUid = (cl as any)?.user_id;
        if (clientUid) {
          const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("recipient_id", clientUid)
            .eq("related_entity_id", orderId)
            .eq("notification_type", "out_for_delivery")
            .gte("created_at", tenMinAgo)
            .limit(1);
          if (!existing || existing.length === 0) {
            await supabase.from("notifications").insert({
              company_id: (ord as any).company_id,
              user_id: clientUid,
              recipient_id: clientUid,
              notification_type: "out_for_delivery",
              title: "Driver on the way",
              message: `Your order ${(ord as any).order_number || ""} is on its way. Tap to watch your driver live.`,
              priority: "high",
              link: `/client-portal/tracking?orderId=${orderId}`,
              related_entity_type: "order",
              related_entity_id: orderId,
            } as any);
          }
        }
      }
    } catch (clientErr) {
      console.warn("[confirmDepartedKitchen] client on-the-way notify failed (non-blocking):", clientErr);
    }

    return data as DriverConfirmation;
  },

  /**
   * Driver confirms arrival at venue.
   *
   * Flow audit Leg E P0-5: previously the POD args were never
   * accepted by this path (DriverConfirmationPanel calls it without
   * POD), so every delivery confirmed via the canonical driver tap
   * landed with NULL pod_*, tripping the POD-missing admin alert
   * and leaving no proof on disputed drops. Now accepts optional
   * POD artefacts and stamps them BEFORE the status flip so the
   * delivered branch's POD-missing check passes.
   */
  async confirmAtVenue(
    orderId: string,
    driverId: string,
    location?: { lat: number; lng: number },
    pod?: { photoUrl?: string; signatureUrl?: string; recipientName?: string; notes?: string },
  ) {
    const { data, error } = await (supabase as any)
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'at_venue',
        location_lat: location?.lat,
        location_lng: location?.lng,
        notes: pod?.notes,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Persist POD on the orders row up front (before the delivered
    // transition runs its POD-missing check).
    if (pod && (pod.photoUrl || pod.signatureUrl || pod.recipientName)) {
      const podUpdate: any = { pod_captured_at: new Date().toISOString() };
      if (pod.photoUrl) podUpdate.pod_photo_url = pod.photoUrl;
      if (pod.signatureUrl) podUpdate.pod_signature_url = pod.signatureUrl;
      if (pod.recipientName) podUpdate.pod_recipient_name = pod.recipientName;
      try {
        await (supabase as any).from("orders").update(podUpdate).eq("id", orderId);
      } catch (podErr) {
        console.warn("[confirmAtVenue] POD stamp failed (non-blocking):", podErr);
      }
    }

    await this.notifyAdminOfConfirmation(orderId, driverId, 'at_venue');

    // Send WhatsApp to client
    await this.sendWhatsAppNotification(orderId, 'driver_arrived');

    // Advance order status to delivered. updateOrderStatus now fires
    // the full cascade: inventory deduction (Leg D), POD-missing alert
    // (skipped if POD was just persisted above), cleaning rows,
    // collection scheduler, pending_reviews queue, after-sales.
    try {
      const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
      await updateOrderStatus(orderId, "delivered" as any, driverId);
    } catch (statusErr) {
      console.warn("[confirmAtVenue] order status flip failed (non-blocking):", statusErr);
    }

    // Close the driver's auto-shift. Flow audit Leg E P0-4: the
    // autoClockOut hook used to live only in deliveryManagement, so
    // a driver who completed their day via DriverConfirmationPanel
    // never closed the shift - driver_shifts.actual_end stayed null
    // and the next auto-clock-in landed on top of an open shift.
    try {
      const { data: orderRow } = await (supabase as any)
        .from("orders")
        .select("company_id")
        .eq("id", orderId)
        .maybeSingle();
      const companyId = (orderRow as any)?.company_id;
      if (companyId) {
        const { driverPayService } = await import("@/services/driverPayService");
        await (driverPayService as any).autoClockOut({ companyId, driverId, orderId });
      }
    } catch (shiftErr) {
      console.warn("[confirmAtVenue] autoClockOut failed (non-blocking):", shiftErr);
    }

    return data as DriverConfirmation;
  },

  /**
   * Wave 49 B2 - driver taps "Setup started" once rigging at the
   * venue has begun. Stamps orders.setup_started_at + driver_confirmations
   * audit row. Non-blocking on every sub-step so a failed mirror
   * never blocks the tap.
   */
  async markSetupStarted(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    return _stampPostArrivalEvent({
      orderId,
      driverId,
      location,
      confirmationType: "setup_started",
      orderColumn: "setup_started_at",
    });
  },

  /**
   * Wave 49 B2 - driver taps "Service started" once food service
   * begins. Stamps orders.service_started_at.
   */
  async markServiceStarted(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    return _stampPostArrivalEvent({
      orderId,
      driverId,
      location,
      confirmationType: "service_started",
      orderColumn: "service_started_at",
    });
  },

  /**
   * Wave 49 B2 - driver taps "Departed venue" once the truck rolls
   * home. Stamps orders.departed_venue_at. Note this is BEFORE the
   * collection trip (which is its own driver_assignment with its own
   * en_route + completed lifecycle).
   */
  async markDepartedVenue(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    return _stampPostArrivalEvent({
      orderId,
      driverId,
      location,
      confirmationType: "departed_venue",
      orderColumn: "departed_venue_at",
    });
  },

  /**
   * Driver completes the collection trip (event over, equipment back
   * at base).
   *
   * Flow audit Leg E P0-15: orderWorkflow scheduled a collection
   * driver_assignment on `delivered`, but no code path ever marked
   * the collection done. Result: equipment_bookings stayed at
   * status='booked' forever, the availability calculator treated the
   * gear as still on a run, and the cleaning team had to manually
   * close out every shortage. Side-effects on completion:
   *   - flips the collection driver_assignment to 'completed'
   *   - calls equipmentService.returnEquipment for every booking on
   *     the order so availability frees up
   *   - autoClockOut so the driver's shift closes (matches
   *     confirmAtVenue's pattern)
   *
   * Best-effort on every sub-step - the operator can re-trigger
   * individual cleanups from /admin/equipment if any fail.
   */
  async completeCollection(
    orderId: string,
    driverId: string,
    options?: {
      shortageNotes?: string;
      damages?: Array<{
        equipmentId: string;
        quantityDamaged: number;
        damageType: "broken" | "lost" | "stolen" | "damaged";
        unitCost: number;
        description?: string;
        photoUrl?: string;
      }>;
    },
  ) {
    const { data: confirmation, error } = await (supabase as any)
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'completed',
        notes: options?.shortageNotes || 'Collection trip completed',
        confirmed_at: new Date().toISOString(),
      }])
      .select()
      .single();
    if (error) throw error;

    // Flip the collection driver_assignment to completed so dispatch
    // stops surfacing it as outstanding.
    try {
      await (supabase as any)
        .from("driver_assignments")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("order_id", orderId)
        .eq("assignment_type", "collection")
        .neq("status", "completed");
    } catch (e) {
      console.warn("[completeCollection] driver_assignments close failed (non-blocking):", e);
    }

    // Flow audit Leg E P0-17: drivers used to drop damaged gear in
    // the cleaning bay with no paper trail, so cleaning got blamed
    // for breakages that happened at venue. Capture damage reports
    // inline through equipmentTrackingService so the responsible
    // party is the driver, not the cleaner, and the damage cost
    // hits the right cost-centre.
    if (options?.damages && options.damages.length > 0) {
      try {
        const { equipmentTrackingService } = await import("@/services/equipmentTrackingService");
        for (const d of options.damages) {
          try {
            await (equipmentTrackingService as any).reportDamage({
              orderId,
              equipmentId: d.equipmentId,
              quantityDamaged: d.quantityDamaged,
              damageType: d.damageType,
              damageStage: "return",
              unitCost: d.unitCost,
              responsibleUserId: driverId,
              description: d.description,
              photoUrl: d.photoUrl,
            });
          } catch (e) {
            console.warn("[completeCollection] damage report failed for", d.equipmentId, e);
          }
        }
      } catch (e) {
        console.warn("[completeCollection] damage cascade crashed (non-blocking):", e);
      }
    }

    // Walk equipment_bookings for this order and call returnEquipment
    // on each. Status='returned' is the canonical signal for the
    // availability calculator + the cleaning queue.
    try {
      const { data: bookings } = await (supabase as any)
        .from("equipment_bookings")
        .select("id, status")
        .eq("order_id", orderId);
      const { equipmentService } = await import("@/services/equipmentService");
      for (const b of (bookings || []) as any[]) {
        if (b.status === "returned") continue;
        try {
          await (equipmentService as any).returnEquipment(b.id);
        } catch (returnErr) {
          console.warn("[completeCollection] returnEquipment failed for booking", b.id, returnErr);
        }
      }
    } catch (e) {
      console.warn("[completeCollection] equipment return cascade crashed (non-blocking):", e);
    }

    // Communication: the gear is back at the hub - tell the cleaning team
    // there's a return to process. returnEquipment only flips status to
    // 'returned' (no cleaning_job is created on this path), so nothing
    // else pings them and handovers relied on a verbal nudge. One ping
    // per collection trip. Best-effort.
    try {
      const { data: orderRow2 } = await (supabase as any)
        .from("orders")
        .select("company_id, order_number")
        .eq("id", orderId)
        .maybeSingle();
      const handoverCompanyId = (orderRow2 as any)?.company_id;
      if (handoverCompanyId) {
        await notificationService.broadcastNotification({
          companyId: handoverCompanyId,
          type: "equipment_returned",
          title: "Equipment returned for cleaning",
          message: `Gear from order ${(orderRow2 as any)?.order_number || orderId.slice(0, 8)} is back at the hub and ready for cleaning intake.`,
          targetRoles: ["cleaning_staff" as any],
          priority: "normal",
          link: "/team-portal/cleaning",
          relatedEntityType: "order",
          relatedEntityId: orderId,
          dedup: true,
        });
      }
    } catch (notifyErr) {
      console.warn("[completeCollection] cleaning handover notification failed (non-blocking):", notifyErr);
    }

    // autoClockOut to close the collection shift. Same pattern as
    // confirmAtVenue so single-driver days end cleanly.
    try {
      const { data: orderRow } = await (supabase as any)
        .from("orders")
        .select("company_id")
        .eq("id", orderId)
        .maybeSingle();
      const companyId = (orderRow as any)?.company_id;
      if (companyId) {
        const { driverPayService } = await import("@/services/driverPayService");
        // Wave 49 B6 - pass assignmentType so the snapshot lands in
        // the collection row, not the delivery row. Pre-Wave-49 this
        // call overwrote the delivery leg's locked pay every time.
        await (driverPayService as any).autoClockOut({
          companyId,
          driverId,
          orderId,
          assignmentType: "collection",
        });
      }
    } catch (shiftErr) {
      console.warn("[completeCollection] autoClockOut failed (non-blocking):", shiftErr);
    }

    return confirmation as DriverConfirmation;
  },

  /**
   * Driver clocks in for the collection run.
   *
   * Flow audit Leg E P1-16: the collection trip is a paid run too, but
   * autoClockIn only ever fired on the delivery leg. Drivers either
   * worked the collection off-clock (silent pay loss) or punched in
   * manually. Mirror the delivery-leg clock-in here so the collection
   * trip is automatically billable from the moment the driver hits
   * "On my way to collect".
   */
  async startCollection(orderId: string, driverId: string) {
    try {
      const { data: orderRow, error: orderRowErr3 } = await (supabase as any)
        .from("orders")
        .select("company_id")
        .eq("id", orderId)
        .maybeSingle();
      if (orderRowErr3) {
        console.error("[driverConfirmationService] orders fetch failed:", orderRowErr3);
      }
      const companyId = (orderRow as any)?.company_id;
      if (!companyId) return null;
      const { driverPayService } = await import("@/services/driverPayService");
      // The autoClockIn helper handles "already on a shift" cases; we
      // don't need to read driver_shifts ourselves.
      // autoClockIn deduplicates against an existing open shift on
      // (driver, order), so calling it from the collection trip after
      // the delivery shift already closed safely opens a new one.
      const shift = await (driverPayService as any).autoClockIn({
        companyId,
        driverId,
        orderId,
      });
      // Flip the driver_assignment to en_route so dispatch sees the
      // collection trip is live. en_route_at is the equivalent of a
      // "started" timestamp on this table.
      //
      // Prior code wrote `"in_progress"` and filtered on
      // `.eq("status", "pending")`, but neither value is in the
      // assignment_status enum (assigned / accepted / en_route /
      // picked_up / at_venue / delivered / completed / cancelled).
      // The .eq filter never matched a row, so the entire flip was a
      // no-op in production - drivers tapped "start collection" and
      // nothing happened at the DB layer. The accepted state is what
      // a driver sits in after self-claim or admin push (Wave 64.4
      // auto-accept), so we filter on that.
      await (supabase as any)
        .from("driver_assignments")
        .update({ status: "en_route", en_route_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("assignment_type", "collection")
        .eq("status", "accepted");
      return shift;
    } catch (e) {
      console.warn("[startCollection] failed:", e);
      return null;
    }
  },

  /**
   * Check if driver has confirmed en-route and send alert if not
   */
  async checkEnRouteConfirmation(orderId: string, driverId: string, minutesBeforeFunction: number = 20) {
    // Get order details
    const { data: order, error: orderError } = await (supabase as any)
      .from('orders')
      .select('event_date, event_time')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return;

    // Check if confirmation exists
    const { data: confirmation, error: confirmationErr } = await (supabase as any)
      .from('driver_confirmations')
      .select('*')
      .eq('order_id', orderId)
      .eq('driver_id', driverId)
      .eq('confirmation_type', 'en_route_to_kitchen')
      .single();
    if (confirmationErr) {
      console.error("[driverConfirmationService] driver_confirmations fetch failed:", confirmationErr);
    }

    if (confirmation) return; // Already confirmed

    // Calculate time until function
    const eventDateTime = new Date(`${order.event_date}T${order.event_time}`);
    const now = new Date();
    const minutesUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60);

    // Send alert if within threshold and not confirmed
    if (minutesUntilEvent <= minutesBeforeFunction) {
      await this.sendEnRouteAlert(orderId, driverId);
    }
  },

  /**
   * Send alert to admin that driver hasn't confirmed en-route. Fires
   * from checkEnRouteConfirmation when the event is inside the
   * minutesBeforeFunction window and no en_route_to_kitchen
   * confirmation has been logged.
   *
   * Audit (May 2026): previously the title said "Driver Confirmed"
   * (the opposite of what this function detects) and the recipient
   * was order.user_id (the client). Both fixed - title now reflects
   * the missing confirmation, recipients are dispatch / admin only.
   */
  async sendEnRouteAlert(orderId: string, driverId: string) {
    const { data: driver, error: driverErr } = await (supabase as any)
      .from('profiles')
      .select('full_name, phone_number')
      .eq('id', driverId)
      .single();
    if (driverErr) {
      console.error("[driverConfirmationService] profiles fetch failed:", driverErr);
    }

    const { data: order, error: orderErr } = await (supabase as any)
      .from('orders')
      .select('order_number, event_date, event_time, company_id')
      .eq('id', orderId)
      .single();
    if (orderErr) {
      console.error("[driverConfirmationService] orders fetch failed:", orderErr);
    }

    if (!driver || !order || !order.company_id) return;

    // Wave 48 A5 - per-order dedup. The check-en-route cron runs
    // every 5 minutes; without dedup it re-broadcast the urgent
    // "driver hasn't confirmed" alert 12 times per hour into every
    // dispatcher's inbox. 60-minute window is the recovery margin.
    await notificationService.broadcastNotification({
      companyId: order.company_id,
      type: "driver_not_confirmed",
      title: `Driver has NOT confirmed: ${order.order_number}`,
      message: `${driver.full_name} has not confirmed en-route. Event is within the alert window. Call ${driver.phone_number || "the driver"} now.`,
      targetRoles: ADMIN_DISPATCH_ROLES,
      priority: "urgent",
      link: `/order/${orderId}?role=admin`,
      relatedEntityType: "order",
      relatedEntityId: orderId,
      dedup: true,
      dedupWindowMinutes: 60,
    });
  },

  /**
   * Get all confirmations for an order
   */
  async getOrderConfirmations(orderId: string) {
    const { data, error } = await (supabase as any)
      .from('driver_confirmations')
      .select(`
        *,
        driver:profiles!driver_confirmations_driver_id_fkey (
          full_name
        )
      `)
      .eq('order_id', orderId)
      .order('confirmed_at', { ascending: true });

    if (error) throw error;

    return data?.map(c => ({...c, driver_name: Array.isArray(c.driver) ? c.driver[0]?.full_name : c.driver?.full_name })) || [];
  },

  /**
   * Get driver's confirmations for today
   */
  async getTodayConfirmations(driverId: string) {
    const today = toLocalISO(new Date());

    const { data, error } = await (supabase as any)
      .from('driver_confirmations')
      .select(`
        *,
        order:orders!driver_confirmations_order_id_fkey (
          order_number,
          event_date,
          event_time
        )
      `)
      .eq('driver_id', driverId)
      .gte('confirmed_at', today)
      .order('confirmed_at', { ascending: false });

    if (error) throw error;
    
    return data?.map(c => ({...c, order_number: c.order?.order_number })) || [];
  },

  /**
   * Notify admin of driver confirmation
   */
  async notifyAdminOfConfirmation(orderId: string, driverId: string, confirmationType: string) {
    const { data: driver, error: driverErr2 } = await (supabase as any)
      .from('profiles')
      .select('full_name')
      .eq('id', driverId)
      .single();
    if (driverErr2) {
      console.error("[driverConfirmationService] profiles fetch failed:", driverErr2);
    }

    // Pull company_id + user_id from the order so we hit a real
    // recipient. Previously this used 'admin' / 'system-id' which are
    // not UUIDs - the insert failed silently and dispatch never got
    // the ping.
    const { data: order, error: orderErr2 } = await (supabase as any)
      .from('orders')
      .select('order_number, company_id, user_id')
      .eq('id', orderId)
      .single();
    if (orderErr2) {
      console.error("[driverConfirmationService] orders fetch failed:", orderErr2);
    }

    if (!driver || !order || !order.company_id) return;

    const messages = {
      'en_route_to_kitchen': `🚗 ${driver.full_name} is en-route to kitchen for Order #${order.order_number}`,
      'at_kitchen': `📍 ${driver.full_name} has arrived at kitchen for Order #${order.order_number}`,
      'departed_kitchen': `📦 ${driver.full_name} has departed kitchen with Order #${order.order_number}`,
      'at_venue': `✅ ${driver.full_name} has arrived at venue for Order #${order.order_number}`,
      'completed': `🎉 ${driver.full_name} has completed delivery of Order #${order.order_number}`
    };

    // Broadcast to admin / dispatch in the same tenant. Audit (May 2026):
    // previously routed to order.user_id (the client). Driver status
    // pings belong to dispatch, not the customer.
    await notificationService.broadcastNotification({
      companyId: order.company_id,
      type: "driver_status_update",
      title: "Driver Status Update",
      message: messages[confirmationType as keyof typeof messages] || "Driver status changed.",
      targetRoles: ADMIN_DISPATCH_ROLES,
      priority: "medium",
      link: `/order/${orderId}?role=admin`,
      relatedEntityType: "order",
      relatedEntityId: orderId,
    });

    // Also tell the KITCHEN on the pickup legs - they're the ones who must
    // have the load ready and tap "Sign over to driver" (the handover gate
    // that blocks the driver from departing). Admin-only pings left the
    // kitchen blind to an arriving driver. Post-handover legs
    // (departed/at_venue/completed) don't concern the kitchen, so skip them.
    if (confirmationType === "en_route_to_kitchen" || confirmationType === "at_kitchen") {
      const atKitchen = confirmationType === "at_kitchen";
      await notificationService.broadcastNotification({
        companyId: order.company_id,
        type: "driver_status_update",
        title: atKitchen ? "Driver at the kitchen - sign over" : "Driver heading to the kitchen",
        message: atKitchen
          ? `${driver.full_name} is AT the kitchen for Order #${order.order_number}. Hand the food + equipment over and tap "Sign over to driver".`
          : `${driver.full_name} is on the way to collect Order #${order.order_number}. Get it ready and sign it over when they arrive.`,
        targetRoles: ["kitchen_staff" as any],
        priority: atKitchen ? "high" : "medium",
        link: "/team-portal/kitchen/dashboard",
        relatedEntityType: "order",
        relatedEntityId: orderId,
      });
    }
  },

  /**
   * Send WhatsApp notification based on template
   */
  async sendWhatsAppNotification(orderId: string, templateKey: string) {
    try {
      // Get template
      const { data: template } = await (supabase as any)
        .from('whatsapp_templates')
        .select('*')
        .eq('template_key', templateKey)
        .eq('is_enabled', true)
        .single();

      if (!template) return; // Template disabled or not found

      // Get order details for template variables
      const { data: order } = await (supabase as any)
        .from('orders')
        .select(`
          *,
          driver:profiles!orders_assigned_driver_id_fkey (
            full_name
          )
        `)
        .eq('id', orderId)
        .single();

      if (!order) return;

      // Replace template variables. Audit (May 2026): the tracking
      // link was built from window.location.origin which is undefined
      // on the server (cron, edge function, scheduled job). Honour
      // NEXT_PUBLIC_APP_URL first so SSR sends don't ship "undefined"
      // into the WhatsApp body, and the link now points at the actual
      // client-portal tracking route (the /tracking/client URL did
      // not exist in this codebase).
      const baseUrl = typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com");
      let message = template.template_content;
      const variables: Record<string, string> = {
        driver_name: order.driver?.full_name || 'Your driver',
        order_number: order.order_number || '',
        collection_time: order.event_time || '',
        tracking_link: `${baseUrl}/client-portal/tracking?orderId=${orderId}`,
        venue_name: order.venue_address || ''
      };

      Object.entries(variables).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      // Wave 19 audit: this used to console.log the rendered template
      // and TODO the actual send - so en-route / arrived / departed
      // WhatsApp pings to the client never went out, even though the
      // operator saw "WhatsApp queued" in the admin notification feed.
      // Route through whatsappIntegrationService so the live WA API
      // path actually fires; wrap in try/catch so a transient WA
      // failure doesn't crash the driver-confirm cascade.
      try {
        const recipientPhone = (order as any).client_phone;
        if (recipientPhone) {
          const { whatsappIntegrationService } = await import("./whatsappIntegrationService");
          await (whatsappIntegrationService as any).sendWhatsAppMessage(
            {
              to: recipientPhone,
              type: "text",
              text: { body: message },
            },
            { companyId: (order as any).company_id },
          );
        }
      } catch (waErr) {
        console.error('[driverConfirmation] WhatsApp send failed (non-blocking):', waErr);
      }

    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
    }
  }
};

/**
 * Wave 49 B2 - shared helper for the post-arrival venue stamps
 * (setup_started, service_started, departed_venue). Each one writes
 * a driver_confirmations audit row, stamps the matching column on
 * orders, and posts an admin notification so dispatch can see the
 * job moving on the timeline.
 */
async function _stampPostArrivalEvent(opts: {
  orderId: string;
  driverId: string;
  location?: { lat: number; lng: number };
  confirmationType: 'setup_started' | 'service_started' | 'departed_venue';
  orderColumn: 'setup_started_at' | 'service_started_at' | 'departed_venue_at';
}) {
  const { orderId, driverId, location, confirmationType, orderColumn } = opts;
  const nowIso = new Date().toISOString();

  // 1. Audit row (canonical event log)
  const { data, error } = await (supabase as any)
    .from('driver_confirmations')
    .insert([{
      order_id: orderId,
      driver_id: driverId,
      confirmation_type: confirmationType,
      location_lat: location?.lat,
      location_lng: location?.lng,
      confirmed_at: nowIso,
    }])
    .select()
    .single();
  if (error) throw error;

  // 2. Canonical stamp on orders - only when null (idempotent)
  try {
    const { data: prior } = await (supabase as any)
      .from('orders')
      .select(`id, ${orderColumn}, company_id, order_number`)
      .eq('id', orderId)
      .maybeSingle();
    if (prior && !(prior as any)[orderColumn]) {
      const upd: any = {};
      upd[orderColumn] = nowIso;
      await (supabase as any).from('orders').update(upd).eq('id', orderId);
    }

    // 3. Admin notification so dispatch sees the timeline advance
    if ((prior as any)?.company_id) {
      const labelMap: Record<string, string> = {
        setup_started: "Setup started at venue",
        service_started: "Service started at venue",
        departed_venue: "Truck departed venue",
      };
      const orderNumber = (prior as any).order_number || orderId;
      void notificationService.broadcastNotification({
        companyId: (prior as any).company_id,
        type: "driver_status_update",
        title: `${labelMap[confirmationType]}: ${orderNumber}`,
        message: `Driver tapped "${labelMap[confirmationType]}".`,
        targetRoles: ADMIN_DISPATCH_ROLES,
        priority: "normal",
        link: `/order/${orderId}?role=admin`,
        relatedEntityType: "order",
        relatedEntityId: orderId,
        dedup: true,
        dedupWindowMinutes: 60,
      }).catch((e) => {
        console.warn(`[${confirmationType}] admin broadcast failed:`, e);
      });
    }
  } catch (stampErr) {
    console.warn(`[${confirmationType}] orders stamp failed (non-blocking):`, stampErr);
  }

  return data as DriverConfirmation;
}
