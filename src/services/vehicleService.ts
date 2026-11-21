/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * vehicleService - the catering company's fleet brain.
 *
 * Carries CRUD on vehicles, the time-window booking layer that the
 * dispatch queue uses to pick a vehicle for an order, and the
 * heuristics for "is this load big enough to need two drivers / two
 * vehicles".
 *
 * Two ownership models are supported on every vehicle:
 *   - 'company': owned by the catering company. Anyone the dispatcher
 *     assigns can drive it (subject to driver eligibility on cold-chain,
 *     etc.).
 *   - 'driver':  the driver brings their own bakkie. The vehicle is
 *     only available when the same driver is assigned to the order.
 *     We surface this so dispatch can decide whether to lean on the
 *     driver's car or pull a company vehicle off the rack.
 *
 * Vehicle bookings mirror equipment_bookings: one row per vehicle x
 * order, with a depart-kitchen / back-at-kitchen window. The window
 * is what the availability query tests against so a vehicle mid-run
 * isn't double-booked.
 *
 * Tenant scoped via RLS on every table this file touches.
 */
import { supabase } from "@/integrations/supabase/client";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";

export interface Vehicle {
  id: string;
  company_id: string;
  plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicle_type: string | null;
  nickname: string | null;
  /** "company" or "driver" */
  owner_kind: "company" | "driver";
  /** Set when owner_kind = "driver". The user_id whose personal vehicle this is. */
  driver_owner_id: string | null;
  /** Suggested default driver for company vehicles. Optional. */
  primary_driver_id: string | null;
  capacity_kg: number | null;
  cargo_volume_litres: number | null;
  max_pax_served: number | null;
  refrigerated: boolean;
  has_warmer: boolean;
  requires_two_people: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // VEH-C (vehicles follow-ups): widened to include the maintenance
  // columns that already exist on the table but were only accessed
  // via `as any` casts in vehicles.tsx. Region scope for the multi-
  // region tenant filter is also a real column on this table.
  next_service_due: string | null;
  service_interval_days: number | null;
  last_serviced_at: string | null;
  current_odometer_km: number | null;
  region_id: string | null;
}

export interface VehicleBooking {
  id: string;
  company_id: string;
  vehicle_id: string;
  order_id: string | null;
  driver_id: string | null;
  booked_from: string;
  booked_until: string;
  status: "planned" | "on_route" | "completed" | "cancelled";
  notes: string | null;
}

export interface VehicleDriverClockReview {
  id: string;
  actual_start: string | null;
  actual_end: string | null;
  hours_worked: number | null;
  status: string;
  notes: string | null;
  source: string | null;
  service_sitting_id: string | null;
  gps_distance_km: number | null;
  gps_expected_distance_km: number | null;
  gps_distance_status: string | null;
  gps_distance_review_reason: string | null;
}

export interface VehicleRunReviewRow extends VehicleBooking {
  order: {
    id: string;
    order_number: string | null;
    event_date: string | null;
    event_time: string | null;
    status: string | null;
    client_name: string | null;
    deleted_at: string | null;
  } | null;
  driver_name: string | null;
  driver_shifts: VehicleDriverClockReview[];
  gps_columns_available: boolean;
}

/**
 * Window heuristics. Defaults come from common catering ops; the
 * dispatcher can override on a per-order basis later.
 */
export const TIMING_DEFAULTS = {
  /** Minutes spent loading at the kitchen before departing. */
  PREP_LOAD_MIN: 30,
  /** Minutes spent unloading at the venue (drop & leave). */
  UNLOAD_MIN: 30,
  /** Minutes back at the kitchen washing down + restocking. */
  RESTOCK_MIN: 30,
  /** Default drive time in minutes if no per-order estimate exists. */
  DRIVE_MIN_DEFAULT: 45,
  /** Default service duration in hours when waiter service is on. */
  SERVICE_HOURS_DEFAULT: 4,
};

/**
 * Compute the time window the vehicle is occupied for an order.
 *
 * Drop-and-leave (no waiter):
 *   depart kitchen --(drive)--> drop --(unload)--> back to kitchen --(restock)--> free
 *
 * Waiter service (vehicle stays):
 *   depart kitchen --(drive)--> arrive --(serve)--> depart --(drive)--> back to kitchen --(restock)--> free
 */
export function computeOrderVehicleWindow(args: {
  eventDate: string;
  eventTime?: string | null;
  driveMinutes?: number | null;
  requiresWaiter?: boolean;
  serviceDurationHours?: number | null;
}): { booked_from: Date; booked_until: Date } {
  const drive = Number(args.driveMinutes ?? TIMING_DEFAULTS.DRIVE_MIN_DEFAULT);
  const time = (args.eventTime || "12:00").slice(0, 5); // HH:mm
  const [hh, mm] = time.split(":").map((n) => parseInt(n, 10) || 0);
  const arriveAt = new Date(args.eventDate + "T00:00:00");
  arriveAt.setHours(hh, mm, 0, 0);

  // Depart kitchen: arrive minus drive minus loading buffer
  const depart = new Date(arriveAt.getTime() - (drive + TIMING_DEFAULTS.PREP_LOAD_MIN) * 60 * 1000);

  // Vehicle free again =
  //  drop & leave: arrive + unload + drive back + restock
  //  waiter:       arrive + serviceHours + drive back + restock
  const tailMinutes = args.requiresWaiter
    ? Number(args.serviceDurationHours ?? TIMING_DEFAULTS.SERVICE_HOURS_DEFAULT) * 60 + drive + TIMING_DEFAULTS.RESTOCK_MIN
    : TIMING_DEFAULTS.UNLOAD_MIN + drive + TIMING_DEFAULTS.RESTOCK_MIN;
  const free = new Date(arriveAt.getTime() + tailMinutes * 60 * 1000);

  return { booked_from: depart, booked_until: free };
}

/**
 * "Does this load need two drivers?"
 *
 * Triggered when ANY of:
 *   - The vehicle on the run is flagged requires_two_people.
 *   - Guest count is huge enough that one person can't serve solo
 *     (default threshold 150 - override per company later).
 *   - The order has waiter_service AND > 80 guests (food + service split).
 */
export function shouldRequireTwoDrivers(args: {
  guestCount: number | null;
  vehicleRequiresTwoPeople: boolean;
  requiresWaiter: boolean;
  largePartyThreshold?: number;
  waiterCoDriverThreshold?: number;
}): { required: boolean; reason: string | null } {
  const big = args.largePartyThreshold ?? 150;
  const waiterPair = args.waiterCoDriverThreshold ?? 80;
  if (args.vehicleRequiresTwoPeople) {
    return { required: true, reason: "Vehicle is flagged as needing two people on board." };
  }
  if ((args.guestCount ?? 0) >= big) {
    return { required: true, reason: `${args.guestCount} guests, too much for one person to serve solo.` };
  }
  if (args.requiresWaiter && (args.guestCount ?? 0) >= waiterPair) {
    return { required: true, reason: "Waiter service plus a sizeable guest count needs a driver and a server." };
  }
  return { required: false, reason: null };
}

export interface AvailabilityRequirements {
  companyId: string;
  /** ISO timestamp the vehicle must be free from. */
  bookedFrom: string;
  /** ISO timestamp the vehicle must be free until. */
  bookedUntil: string;
  /** Order needs cold-chain transport. Filters to refrigerated only. */
  requiresRefrigeration?: boolean;
  /** Order needs hot-hold. Filters to vehicles with a warmer. */
  requiresWarmer?: boolean;
  /** Estimated load in kg, filters out vehicles with smaller capacity. */
  loadKg?: number | null;
  /** Estimated cubic litres, filters out vehicles with smaller capacity. */
  loadLitres?: number | null;
  /** Guest count, filters out vehicles whose max_pax_served can't serve. */
  guestCount?: number | null;
  /** When set, only this driver's vehicles + company vehicles are returned. */
  driverId?: string | null;
  /** Exclude a specific booking when re-checking availability for an
   *  order being reassigned (don't count its own current claim). */
  ignoreBookingForOrderId?: string | null;
}

export interface AvailabilityResult {
  vehicle: Vehicle;
  /** Higher = better fit. Used to rank candidates. */
  score: number;
  /** Plain-English reasons used in the dispatch UI tooltip. */
  reasons: string[];
  /** Plain-English warnings - vehicle works but isn't ideal. */
  warnings: string[];
  /** True when the vehicle is owned by a specific driver. */
  driverOwned: boolean;
}

export const vehicleService = {
  async getRunReviewRows(companyId: string): Promise<VehicleRunReviewRow[]> {
    if (!companyId) return [];
    const { data: bookingRows, error: bookingError } = await (supabase as any)
      .from("vehicle_bookings")
      .select("id, company_id, vehicle_id, order_id, driver_id, booked_from, booked_until, status, notes, created_at, updated_at")
      .eq("company_id", companyId)
      .order("booked_from", { ascending: false })
      .limit(1000);
    if (bookingError) throw bookingError;

    const bookings = (bookingRows || []) as VehicleBooking[];
    const orderIds = Array.from(new Set(bookings.map((row) => row.order_id).filter(Boolean))) as string[];
    const driverIds = Array.from(new Set(bookings.map((row) => row.driver_id).filter(Boolean))) as string[];
    const [ordersResult, profilesResult, assignmentsResult] = await Promise.all([
      orderIds.length
        ? (supabase as any).from("orders")
            .select("id, order_number, event_date, event_time, status, client_name, deleted_at, internal_notes, event_name")
            .eq("company_id", companyId)
            .in("id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      driverIds.length
        ? (supabase as any).from("profiles")
            .select("id, full_name, email")
            .eq("company_id", companyId)
            .in("id", driverIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length && driverIds.length
        ? (supabase as any).from("driver_assignments")
            .select("id, order_id, driver_id, service_sitting_id, assignment_type")
            .eq("company_id", companyId)
            .in("order_id", orderIds)
            .in("driver_id", driverIds)
            .eq("assignment_type", "delivery")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ordersResult.error) throw ordersResult.error;
    if (profilesResult.error) throw profilesResult.error;

    let gpsColumnsAvailable = true;
    let gpsDetails: any[] = [];
    const assignmentIds = ((assignmentsResult.data || []) as any[]).map((row) => row.id);
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (assignmentIds.length) {
      const gpsResult = await (supabase as any).from("driver_assignments")
        .select("id, gps_distance_km, gps_expected_distance_km, gps_distance_status, gps_distance_review_required, gps_distance_review_reason")
        .eq("company_id", companyId)
        .in("id", assignmentIds);
      if (gpsResult.error) {
        // Older tenant databases may not have applied the GPS attribution
        // migration yet. Keep clock and booking review usable while making
        // the missing distance fields explicit in the UI.
        gpsColumnsAvailable = false;
        console.warn("[vehicleService] GPS distance fields are unavailable; showing clock-only run review:", gpsResult.error);
      } else {
        gpsDetails = gpsResult.data || [];
      }
    }

    const orders = new Map<string, any>((ordersResult.data || []).map((row: any) => [row.id, row]));
    const profiles = new Map<string, any>((profilesResult.data || []).map((row: any) => [row.id, row]));
    const assignmentsById = new Map<string, any>();
    const assignmentsByTrip = new Map<string, any>();
    const gpsById = new Map<string, any>(gpsDetails.map((row: any) => [row.id, row]));
    for (const row of (assignmentsResult.data || []) as any[]) {
      const enriched = { ...row, ...(gpsById.get(row.id) || {}) };
      assignmentsById.set(row.id, enriched);
      assignmentsByTrip.set(`${row.order_id}:${row.driver_id}:${row.service_sitting_id || "general"}`, enriched);
    }

    const shiftsResult = orderIds.length && driverIds.length
      ? await (supabase as any).from("kitchen_shifts")
          .select("id, order_id, staff_id, driver_assignment_id, service_sitting_id, assignment_type, actual_start, actual_end, hours_worked, status, notes, source, deleted_at")
          .eq("company_id", companyId)
          .in("order_id", orderIds)
          .in("staff_id", driverIds)
          .eq("shift_type", "delivery")
          .is("deleted_at", null)
      : { data: [], error: null };
    if (shiftsResult.error) throw shiftsResult.error;
    const shiftsByTrip = new Map<string, any[]>();
    for (const shift of (shiftsResult.data || []) as any[]) {
      if (shift.assignment_type && shift.assignment_type !== "delivery") continue;
      if (!shift.actual_start && !shift.actual_end && ["scheduled", "cancelled"].includes(shift.status)) continue;
      const key = `${shift.order_id}:${shift.staff_id}`;
      shiftsByTrip.set(key, [...(shiftsByTrip.get(key) || []), shift]);
    }

    return bookings.filter((booking) => {
      const order = booking.order_id ? orders.get(booking.order_id) : null;
      return !order || !isAutomatedTestOrder(order);
    }).map((booking) => {
      const order = booking.order_id ? orders.get(booking.order_id) : null;
      const driver = booking.driver_id ? profiles.get(booking.driver_id) : null;
      const driverShifts = booking.order_id && booking.driver_id
        ? shiftsByTrip.get(`${booking.order_id}:${booking.driver_id}`) || []
        : [];
      return {
        ...booking,
        order: order && !order.deleted_at && !isAutomatedTestOrder(order) ? order : null,
        driver_name: driver?.full_name || driver?.email || null,
        gps_columns_available: gpsColumnsAvailable,
        driver_shifts: driverShifts.map((shift: any): VehicleDriverClockReview => {
          const assignment = (shift.driver_assignment_id && assignmentsById.get(shift.driver_assignment_id))
            || assignmentsByTrip.get(`${shift.order_id}:${shift.staff_id}:${shift.service_sitting_id || "general"}`);
          return {
            id: shift.id,
            actual_start: shift.actual_start,
            actual_end: shift.actual_end,
            hours_worked: shift.hours_worked == null ? null : Number(shift.hours_worked),
            status: shift.status,
            notes: shift.notes,
            source: shift.source,
            service_sitting_id: shift.service_sitting_id,
            gps_distance_km: assignment?.gps_distance_km == null ? null : Number(assignment.gps_distance_km),
            gps_expected_distance_km: assignment?.gps_expected_distance_km == null ? null : Number(assignment.gps_expected_distance_km),
            gps_distance_status: assignment?.gps_distance_status || "not_available",
            gps_distance_review_reason: assignment?.gps_distance_review_required
              ? assignment.gps_distance_review_reason || "Recorded GPS distance is materially longer than the route estimate."
              : null,
          };
        }),
      };
    });
  },

  async updateVehicleBooking(
    id: string,
    companyId: string,
    patch: Pick<VehicleBooking, "booked_from" | "booked_until" | "notes">,
    actorUserId?: string | null,
  ): Promise<void> {
    const { data: before, error: readError } = await (supabase as any)
      .from("vehicle_bookings")
      .select("id, company_id, vehicle_id, order_id, driver_id, booked_from, booked_until, status, notes")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readError) throw readError;
    if (!before) throw new Error("Vehicle run entry was not found. Refresh and try again.");
    if (["planned", "on_route"].includes(before.status)) {
      const { data: clashes, error: clashError } = await (supabase as any)
        .from("vehicle_bookings")
        .select("id")
        .eq("company_id", companyId)
        .eq("vehicle_id", before.vehicle_id)
        .in("status", ["planned", "on_route"])
        .neq("id", id)
        .lte("booked_from", patch.booked_until)
        .gte("booked_until", patch.booked_from)
        .limit(1);
      if (clashError) throw clashError;
      if (clashes?.length) throw new Error("This time window overlaps another active booking for the same vehicle.");
    }
    const { error } = await (supabase as any)
      .from("vehicle_bookings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw error;
    try {
      await (supabase as any).from("audit_logs").insert({
        company_id: companyId,
        user_id: actorUserId ?? null,
        action: "vehicle_booking_edited",
        entity_type: "vehicle_booking",
        entity_id: id,
        details: { before, patch },
      });
    } catch (auditError) {
      console.warn("[vehicleService] vehicle booking edit audit failed:", auditError);
    }
  },

  async deleteVehicleBooking(id: string, companyId: string, actorUserId?: string | null): Promise<void> {
    const { data: before, error: readError } = await (supabase as any)
      .from("vehicle_bookings")
      .select("id, company_id, vehicle_id, order_id, driver_id, booked_from, booked_until, status, notes")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (readError) throw readError;
    if (!before) throw new Error("Vehicle run entry was not found. Refresh and try again.");
    let clearedPrimaryAssignment = false;
    let clearedSecondaryAssignment = false;
    if (before.order_id) {
      const { data: otherBookings, error: otherBookingsError } = await (supabase as any).from("vehicle_bookings")
        .select("id")
        .eq("company_id", companyId)
        .eq("order_id", before.order_id)
        .eq("vehicle_id", before.vehicle_id)
        .neq("id", id)
        .limit(1);
      if (otherBookingsError) throw otherBookingsError;
      if (!otherBookings?.length) {
        const primary = await (supabase as any).from("orders")
          .update({ assigned_vehicle_id: null })
          .eq("id", before.order_id)
          .eq("company_id", companyId)
          .eq("assigned_vehicle_id", before.vehicle_id)
          .select("id");
        if (primary.error) throw primary.error;
        clearedPrimaryAssignment = !!primary.data?.length;
        const secondary = await (supabase as any).from("orders")
          .update({ secondary_vehicle_id: null })
          .eq("id", before.order_id)
          .eq("company_id", companyId)
          .eq("secondary_vehicle_id", before.vehicle_id)
          .select("id");
        if (secondary.error) {
          if (clearedPrimaryAssignment) {
            await (supabase as any).from("orders").update({ assigned_vehicle_id: before.vehicle_id }).eq("id", before.order_id).eq("company_id", companyId).is("assigned_vehicle_id", null);
          }
          throw secondary.error;
        }
        clearedSecondaryAssignment = !!secondary.data?.length;
      }
    }
    const { error } = await (supabase as any)
      .from("vehicle_bookings")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) {
      if (before.order_id) {
        if (clearedPrimaryAssignment) await (supabase as any).from("orders").update({ assigned_vehicle_id: before.vehicle_id }).eq("id", before.order_id).eq("company_id", companyId).is("assigned_vehicle_id", null);
        if (clearedSecondaryAssignment) await (supabase as any).from("orders").update({ secondary_vehicle_id: before.vehicle_id }).eq("id", before.order_id).eq("company_id", companyId).is("secondary_vehicle_id", null);
      }
      throw error;
    }
    try {
      await (supabase as any).from("audit_logs").insert({
        company_id: companyId,
        user_id: actorUserId ?? null,
        action: "vehicle_booking_deleted",
        entity_type: "vehicle_booking",
        entity_id: id,
        details: { before, reason: "Admin removed vehicle run entry" },
      });
    } catch (auditError) {
      console.warn("[vehicleService] vehicle booking delete audit failed:", auditError);
    }
  },

  async getVehiclesForCompany(companyId: string): Promise<Vehicle[]> {
    // Cast at the boundary: select("*") returns every column, but the
    // generated supabase types lag the maintenance + region_id additions.
    // VEH-C widens the Vehicle interface; this assertion bridges the gap
    // until database.types.ts is regenerated.
    const { data, error } = await (supabase as any)
      .from("vehicles")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("plate");
    if (error) {
      console.error("Error fetching vehicles:", error);
      throw error;
    }
    return (data || []) as Vehicle[];
  },

  /**
   * Vehicle attached to a driver (FK on profiles.vehicle_id, plus the
   * stronger primary_driver_id link on vehicles itself for the new
   * driver-owned shape). We return the vehicle that's the best match.
   */
  async getVehicleForDriver(driverId: string): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("vehicle_id, vehicles:vehicle_id(*)")
      .eq("id", driverId)
      .maybeSingle();
    if (error || !data?.vehicles) return null;
    return data.vehicles as Vehicle;
  },

  /**
   * Vehicles owned by a specific driver (driver-owned ownership model).
   * Useful when assigning the driver to an order: dispatch should default
   * to the driver's own vehicle.
   */
  async getVehiclesOwnedByDriver(companyId: string, driverId: string): Promise<Vehicle[]> {
    const { data, error } = await (supabase as any)
      .from("vehicles")
      .select("*")
      .eq("company_id", companyId)
      .eq("owner_kind", "driver")
      .eq("driver_owner_id", driverId)
      .is("deleted_at", null);
    if (error) {
      console.error("Error fetching driver vehicles:", error);
      return [];
    }
    return (data || []) as Vehicle[];
  },

  async createVehicle(payload: {
    companyId: string;
    plate: string;
    make?: string;
    model?: string;
    year?: number | null;
    vehicleType?: string | null;
    nickname?: string | null;
    ownerKind?: "company" | "driver";
    driverOwnerId?: string | null;
    primaryDriverId?: string | null;
    capacityKg?: number | null;
    cargoVolumeLitres?: number | null;
    maxPaxServed?: number | null;
    refrigerated?: boolean;
    hasWarmer?: boolean;
    requiresTwoPeople?: boolean;
    notes?: string;
  }): Promise<Vehicle | null> {
    const { data, error } = await (supabase as any)
      .from("vehicles")
      .insert([{
        company_id: payload.companyId,
        plate: payload.plate.trim(),
        make: payload.make?.trim() || null,
        model: payload.model?.trim() || null,
        year: payload.year ?? null,
        vehicle_type: payload.vehicleType ?? null,
        nickname: payload.nickname?.trim() || null,
        owner_kind: payload.ownerKind ?? "company",
        driver_owner_id: payload.ownerKind === "driver" ? (payload.driverOwnerId ?? null) : null,
        primary_driver_id: payload.primaryDriverId ?? null,
        capacity_kg: payload.capacityKg ?? null,
        cargo_volume_litres: payload.cargoVolumeLitres ?? null,
        max_pax_served: payload.maxPaxServed ?? null,
        refrigerated: payload.refrigerated ?? false,
        has_warmer: payload.hasWarmer ?? false,
        requires_two_people: payload.requiresTwoPeople ?? false,
        notes: payload.notes?.trim() || null,
      }])
      .select()
      .single();
    if (error) throw error;
    return data as Vehicle;
  },

  async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle | null> {
    const { data, error } = await (supabase as any)
      .from("vehicles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Vehicle;
  },

  /**
   * Inspect the impact of soft-deleting a vehicle BEFORE the delete
   * lands. Returns the count of active future bookings + orders that
   * still reference this vehicle. The page uses this to surface a
   * confirmation dialog with the real impact so an operator doesn't
   * accidentally orphan a future run.
   *
   * VEH-C (vehicles follow-ups): pre-VEH-C deleteVehicle just flipped
   * deleted_at without touching anything else. Active vehicle_bookings
   * stayed planned (showing up as "booked" on dispatch availability
   * queries), and orders.assigned_vehicle_id kept pointing at a row
   * the operator thought was gone.
   */
  async getVehicleDeletionImpact(
    id: string,
  ): Promise<{ activeBookings: number; activeOrders: number }> {
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);
    const [bookings, orders] = await Promise.all([
      supabase
        .from("vehicle_bookings")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", id)
        .in("status", ["planned", "on_route"])
        .gte("booked_until", nowIso),
      (supabase as any)
        .from("orders")
        .select("id", { count: "exact", head: true })
        .or(`assigned_vehicle_id.eq.${id},secondary_vehicle_id.eq.${id}`)
        .is("deleted_at", null)
        .not("status", "in", "(cancelled,completed)")
        .gte("event_date", todayDate),
    ]);
    return {
      activeBookings: bookings.count || 0,
      activeOrders: orders.count || 0,
    };
  },

  async deleteVehicle(
    id: string,
    opts?: { cascadeDetach?: boolean },
  ): Promise<boolean> {
    // VEH-C (vehicles follow-ups): cascade detach before flipping
    // deleted_at. Without this, vehicle_bookings stays planned and
    // future-event orders keep their assigned_vehicle_id pointing at
    // a row the operator just removed. The caller passes
    // `cascadeDetach: true` only after confirming the deletion impact
    // dialog so we never silently mutate downstream tables.
    if (opts?.cascadeDetach) {
      const nowIso = new Date().toISOString();
      const todayDate = nowIso.slice(0, 10);

      // Cancel any still-planned booking on this vehicle. Anything
      // already on_route or completed is history - leave it alone.
      await supabase
        .from("vehicle_bookings")
        .update({ status: "cancelled", updated_at: nowIso })
        .eq("vehicle_id", id)
        .eq("status", "planned");

      // Null out future-event order FKs. Past orders keep the FK so
      // the run history shows which vehicle was used.
      await (supabase as any)
        .from("orders")
        .update({ assigned_vehicle_id: null })
        .eq("assigned_vehicle_id", id)
        .is("deleted_at", null)
        .not("status", "in", "(cancelled,completed)")
        .gte("event_date", todayDate);
      await (supabase as any)
        .from("orders")
        .update({ secondary_vehicle_id: null })
        .eq("secondary_vehicle_id", id)
        .is("deleted_at", null)
        .not("status", "in", "(cancelled,completed)")
        .gte("event_date", todayDate);
    }

    const { error } = await supabase
      .from("vehicles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return true;
  },

  // ── Bookings ─────────────────────────────────────────────────────

  /**
   * Create or update the vehicle booking for an order. We always keep
   * a single booking per (order_id, vehicle_id) pair; reassigning a
   * vehicle cancels the old one and inserts a new one.
   */
  async upsertBookingForOrder(args: {
    companyId: string;
    orderId: string;
    vehicleId: string;
    driverId?: string | null;
    bookedFrom: Date;
    bookedUntil: Date;
    notes?: string | null;
  }): Promise<VehicleBooking | null> {
    // Soft-cancel any existing planned booking for this order so a
    // reassign doesn't leave the old vehicle locked. We don't touch
    // 'completed' or 'on_route' bookings - they're history.
    await supabase
      .from("vehicle_bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("company_id", args.companyId)
      .eq("order_id", args.orderId)
      .eq("status", "planned");

    const { data, error } = await supabase
      .from("vehicle_bookings")
      .insert([{
        company_id: args.companyId,
        vehicle_id: args.vehicleId,
        order_id: args.orderId,
        driver_id: args.driverId ?? null,
        booked_from: args.bookedFrom.toISOString(),
        booked_until: args.bookedUntil.toISOString(),
        status: "planned",
        notes: args.notes ?? null,
      }])
      .select()
      .single();
    if (error) throw error;
    return data as VehicleBooking;
  },

  async cancelBookingsForOrder(orderId: string): Promise<void> {
    await supabase
      .from("vehicle_bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .in("status", ["planned", "on_route"]);
  },

  // ── Utilisation ──────────────────────────────────────────────────

  /**
   * Per-vehicle utilisation rollup over a date window.
   *
   * Bookings with status='cancelled' are excluded so a swap-over
   * doesn't double-count. Hours used comes from the booking window;
   * distance + revenue are pulled from the joined order row when
   * available.
   *
   * Returns one row per vehicle in the company, including ones with
   * zero bookings - the dispatcher needs to spot the truck nobody's
   * touching, not just the busy ones.
   */
  async getUtilisation(companyId: string, fromISO: string, toISO: string): Promise<Array<{
    vehicle: Vehicle;
    runs: number;
    plannedHours: number;
    distanceKm: number;
    completedRuns: number;
    cancelledRuns: number;
  }>> {
    const fleet = await this.getVehiclesForCompany(companyId);
    if (fleet.length === 0) return [];

    const { data: bookings, error: bookingsErr } = await supabase
      .from("vehicle_bookings")
      .select(`
        id, vehicle_id, booked_from, booked_until, status,
        order:order_id(id, delivery_distance_km, status, cancelled_at, deleted_at, internal_notes, order_number, event_name, client_name)
      `)
      .eq("company_id", companyId)
      // Include every booking that overlaps the selected window, even if
      // it started before the window or finishes after it.
      .lte("booked_from", toISO)
      .gte("booked_until", fromISO);
    if (bookingsErr) {
      console.error("[vehicleService] vehicle_bookings stats lookup failed:", bookingsErr);
      throw bookingsErr;
    }

    const byVehicle: Record<string, {
      runs: number; plannedHours: number; distanceKm: number;
      completedRuns: number; cancelledRuns: number;
    }> = {};
    for (const v of fleet) {
      byVehicle[v.id] = {
        runs: 0, plannedHours: 0, distanceKm: 0,
        completedRuns: 0, cancelledRuns: 0,
      };
    }

    for (const b of (bookings || [])) {
      const slot = byVehicle[(b as any).vehicle_id];
      if (!slot) continue;
      const status = (b as any).status as string;
      const ord = (b as any).order;
      if (ord?.deleted_at || (ord && isAutomatedTestOrder(ord))) continue;
      if (
        status === "cancelled"
        || ord?.status === "cancelled"
        || ord?.cancelled_at
      ) {
        slot.cancelledRuns += 1;
        continue; // don't count cancelled bookings as active runs
      }
      slot.runs += 1;
      if (status === "completed") slot.completedRuns += 1;

      const fromT = Math.max(new Date((b as any).booked_from).getTime(), new Date(fromISO).getTime());
      const toT   = Math.min(new Date((b as any).booked_until).getTime(), new Date(toISO).getTime());
      const hrs = Math.max(0, (toT - fromT) / (1000 * 60 * 60));
      slot.plannedHours += hrs;

      if (ord) {
        // delivery_distance_km is stored one-way (kitchen -> venue).
        // Vehicle utilisation estimates both outbound and return legs.
        // This is a planning estimate, not GPS or odometer mileage.
        slot.distanceKm += Number(ord.delivery_distance_km || 0) * 2;
      }
    }

    return fleet
      .map((v) => ({ vehicle: v, ...byVehicle[v.id] }))
      .sort((a, b) => b.plannedHours - a.plannedHours);
  },

  /**
   * Find vehicles available for an order. Returns ranked candidates
   * with reasons + warnings for the dispatch UI tooltip.
   *
   * Ranking heuristic:
   *   +5 vehicle is the assigned driver's own car (zero coordination cost)
   *   +3 vehicle has warmer/refrigeration matching the requirement
   *   +2 capacity comfortably above the load
   *   -2 capacity matches but is tight (warning shown)
   *   -5 vehicle requires_two_people (logistics overhead)
   */
  async findAvailableVehicles(req: AvailabilityRequirements): Promise<AvailabilityResult[]> {
    const fleet = await this.getVehiclesForCompany(req.companyId);
    if (fleet.length === 0) return [];

    // Pull every overlapping booking for this window in one query.
    const { data: clashes, error: clashesErr } = await supabase
      .from("vehicle_bookings")
      .select("id, vehicle_id, order_id, booked_from, booked_until, status")
      .eq("company_id", req.companyId)
      .in("status", ["planned", "on_route"])
      .lte("booked_from", req.bookedUntil)
      .gte("booked_until", req.bookedFrom);
    if (clashesErr) console.error("[vehicleService/findAvailableVehicles] vehicle_bookings clash lookup failed:", clashesErr);

    const blocked = new Set<string>();
    for (const c of (clashes || [])) {
      // If we're re-checking the order's own booking, ignore its claim.
      if (req.ignoreBookingForOrderId && c.order_id === req.ignoreBookingForOrderId) continue;
      blocked.add(c.vehicle_id);
    }

    const out: AvailabilityResult[] = [];
    for (const v of fleet) {
      if (!v.is_active) continue;
      if (blocked.has(v.id)) continue;

      const reasons: string[] = [];
      const warnings: string[] = [];
      let score = 0;

      // Hard filters first.
      if (req.requiresRefrigeration && !v.refrigerated) {
        continue; // can't carry cold-chain, skip
      }
      if (req.requiresWarmer && !v.has_warmer) {
        continue; // can't keep food hot, skip
      }
      if (req.loadKg != null && v.capacity_kg != null && v.capacity_kg < req.loadKg) {
        // Not strictly impossible - the team can split the load - but
        // surface as a warning rather than a hard skip.
        warnings.push(`Load ${req.loadKg}kg over the listed capacity of ${v.capacity_kg}kg.`);
        score -= 3;
      } else if (req.loadKg != null && v.capacity_kg != null && v.capacity_kg < req.loadKg * 1.2) {
        warnings.push("Capacity is tight, no margin for an extra item.");
        score -= 2;
      }

      if (req.driverId && v.owner_kind === "driver") {
        if (v.driver_owner_id === req.driverId) {
          score += 5;
          reasons.push("Driver's own vehicle, no extra coordination needed.");
        } else {
          // A different driver's car - not available unless that other
          // driver is assigned. Skip.
          continue;
        }
      }

      if (req.requiresRefrigeration && v.refrigerated) {
        score += 3;
        reasons.push("Refrigerated, matches the cold-chain requirement.");
      }
      if (req.requiresWarmer && v.has_warmer) {
        score += 3;
        reasons.push("Warmer fitted, matches the hot-hold requirement.");
      }
      if (req.guestCount != null && v.max_pax_served != null) {
        if (v.max_pax_served >= req.guestCount) {
          score += 2;
          reasons.push(`Comfortable for ${req.guestCount} guests (rated to ${v.max_pax_served}).`);
        } else {
          warnings.push(`${req.guestCount} guests vs rated ${v.max_pax_served}, you may need a second vehicle.`);
          score -= 4;
        }
      }
      if (v.requires_two_people) {
        warnings.push("Vehicle is flagged for two on board.");
        score -= 5;
      }

      out.push({
        vehicle: v,
        score,
        reasons,
        warnings,
        driverOwned: v.owner_kind === "driver",
      });
    }

    // Highest score first, ties broken by capacity then by plate.
    out.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const acap = a.vehicle.capacity_kg ?? 0;
      const bcap = b.vehicle.capacity_kg ?? 0;
      if (acap !== bcap) return bcap - acap;
      return (a.vehicle.plate || "").localeCompare(b.vehicle.plate || "");
    });
    return out;
  },
};
