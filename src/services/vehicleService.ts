/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * vehicleService -- the catering company's fleet brain.
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
 *     (default threshold 150 -- override per company later).
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
  /** Plain-English warnings -- vehicle works but isn't ideal. */
  warnings: string[];
  /** True when the vehicle is owned by a specific driver. */
  driverOwned: boolean;
}

export const vehicleService = {
  async getVehiclesForCompany(companyId: string): Promise<Vehicle[]> {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("plate");
    if (error) {
      console.error("Error fetching vehicles:", error);
      return [];
    }
    return data || [];
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
    const { data, error } = await supabase
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
    return data || [];
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
    const { data, error } = await supabase
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
    return data;
  },

  async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteVehicle(id: string): Promise<boolean> {
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
    // 'completed' or 'on_route' bookings -- they're history.
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
    return data;
  },

  async cancelBookingsForOrder(orderId: string): Promise<void> {
    await supabase
      .from("vehicle_bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .in("status", ["planned", "on_route"]);
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
    const { data: clashes } = await supabase
      .from("vehicle_bookings")
      .select("id, vehicle_id, order_id, booked_from, booked_until, status")
      .eq("company_id", req.companyId)
      .in("status", ["planned", "on_route"])
      .lte("booked_from", req.bookedUntil)
      .gte("booked_until", req.bookedFrom);

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
      let pass = true;

      // Hard filters first.
      if (req.requiresRefrigeration && !v.refrigerated) {
        continue; // can't carry cold-chain, skip
      }
      if (req.requiresWarmer && !v.has_warmer) {
        continue; // can't keep food hot, skip
      }
      if (req.loadKg != null && v.capacity_kg != null && v.capacity_kg < req.loadKg) {
        // Not strictly impossible -- the team can split the load -- but
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
          // A different driver's car -- not available unless that other
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

      if (!pass) continue;

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
