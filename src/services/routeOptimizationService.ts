/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { googleMapsService } from "./googleMapsService";
import { notificationService } from "./notificationService";
import { UserRole } from "@/types/app";
import { DEFAULT_TENANT_TIMEZONE, toZonedISO } from "@/lib/localDate";

export interface DeliveryStop {
  id: string;
  order_id: string;
  client_name: string;
  event_date?: string | null;
  event_time?: string | null;
  region_id?: string | null;
  requires_refrigeration?: boolean | null;
  venue_address: string;
  venue_lat: number;
  venue_lng: number;
  delivery_time: string;
  /** Wall-clock HH:MM the driver leaves the kitchen with the food.
   *  Distinct from delivery_time (when they arrive at venue) - the
   *  driver's first question is "when do I collect?" not "when do
   *  I drop?". Optional because not every tenant fills it in. */
  pickup_time?: string | null;
  priority: number;
  status: string;
  /** Phase 2B: arrival buffer in minutes used to check feasibility. */
  arrival_buffer_minutes?: number;
  /** Phase 2B: filled by the optimiser. ISO string. */
  predicted_arrival_at?: string;
  /** Phase 2B: filled by the optimiser. True when predicted arrival is past delivery_time - buffer. */
  time_window_breach?: boolean;
  /** Phase 2B: filled by the optimiser. Slack in minutes; negative means breach. */
  slack_minutes?: number;
}

export interface OptimizedRoute {
  driver_id: string;
  driver_name?: string;
  stops: DeliveryStop[];
  total_distance: number;
  total_duration: number;
  estimated_completion: string;
  /** Phase 2B: how many stops in the route would breach their time window. */
  infeasible_count?: number;
  /** Phase 2B: false when one or more stops breach. */
  feasible?: boolean;
}

interface RouteSegment {
  from: DeliveryStop;
  to: DeliveryStop;
  distance: number;
  duration: number;
}

/**
 * Route Optimization Service
 * Implements intelligent route planning using:
 * 1. Nearest Neighbor algorithm (greedy approach)
 * 2. Time window constraints
 * 3. Priority weighting
 * 4. Real-time traffic considerations
 */
export const routeOptimizationService = {
  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * Calculate estimated travel time based on distance
   * Assumes average speed of 40 km/h in urban areas
   */
  estimateTravelTime(distanceKm: number): number {
    const avgSpeedKmh = 40;
    return (distanceKm / avgSpeedKmh) * 60; // Returns minutes
  },

  /**
   * Optimize route using Nearest Neighbor algorithm with constraints
   * Enhanced with priority weighting and time windows
   */
  async optimizeRoute(
    driverId: string,
    stops: DeliveryStop[],
    startLat?: number,
    startLng?: number
  ): Promise<OptimizedRoute | null> {
    if (stops.length === 0) {
      return null;
    }

    // Get driver's current location or use first stop
    let currentLat = startLat || stops[0].venue_lat;
    let currentLng = startLng || stops[0].venue_lng;

    const unvisited = [...stops];
    const optimizedStops: DeliveryStop[] = [];
    let totalDistance = 0;
    let totalDuration = 0;
    // RP-B (route-planning audit, RP-2): anchor the cursor at the
    // earliest stop deadline minus a 90-minute lead, not the wall
    // clock. Pre-RP-B `new Date()` produced bogus slack: a tomorrow-
    // for-tomorrow plan run at 14:00 today predicted arrivals
    // starting 14:00 today against deadlines 28 hours later, so 2-opt
    // saw zero infeasibility incentive and optimised on raw distance.
    // Now slack is meaningful relative to each stop's deadline, and
    // the 2-opt penalty kicks in for risky orderings.
    const ROUTE_START_LEAD_MINUTES = 90;
    const _routeStartFromStops = (xs: DeliveryStop[]): Date => {
      let earliest = Number.POSITIVE_INFINITY;
      for (const s of xs) {
        const d = new Date(s.delivery_time).getTime();
        if (!isNaN(d) && d < earliest) earliest = d;
      }
      if (!isFinite(earliest)) return new Date();
      return new Date(earliest - ROUTE_START_LEAD_MINUTES * 60_000);
    };
    let currentTime = _routeStartFromStops(stops);

    // Nearest Neighbor algorithm with priority weighting
    while (unvisited.length > 0) {
      let nearestStop: DeliveryStop | null = null;
      let nearestDistance = Infinity;
      let nearestIndex = -1;

      // Find the nearest unvisited stop considering priority
      unvisited.forEach((stop, index) => {
        const distance = this.calculateDistance(
          currentLat,
          currentLng,
          stop.venue_lat,
          stop.venue_lng
        );

        // Priority weighting: high priority (1) gets 0.5x distance, normal (2) gets 1x, low (3) gets 1.5x
        const priorityWeight = stop.priority === 1 ? 0.5 : stop.priority === 3 ? 1.5 : 1;
        const weightedDistance = distance * priorityWeight;

        // Time window consideration: if delivery time is soon, reduce weighted distance
        const deliveryTime = new Date(stop.delivery_time);
        const timeUntilDelivery = deliveryTime.getTime() - currentTime.getTime();
        const hoursUntilDelivery = timeUntilDelivery / (1000 * 60 * 60);

        let timeWeight = 1;
        if (hoursUntilDelivery < 1) {
          timeWeight = 0.3; // Very urgent
        } else if (hoursUntilDelivery < 2) {
          timeWeight = 0.6; // Somewhat urgent
        }

        const finalWeight = weightedDistance * timeWeight;

        if (finalWeight < nearestDistance) {
          nearestDistance = distance; // Use actual distance for totals
          nearestStop = stop;
          nearestIndex = index;
        }
      });

      if (nearestStop) {
        // Estimate travel time
        const travelTime = this.estimateTravelTime(nearestDistance);
        totalDuration += travelTime;
        totalDistance += nearestDistance;

        // Update current time (travel time + 15 min stop time)
        const arrivalTime = new Date(currentTime.getTime() + travelTime * 60000);

        // Phase 2B: time-window feasibility per stop.
        // Slack = (delivery_time - arrival_buffer) - predicted_arrival.
        // Negative slack means we'll be late.
        const buffer = nearestStop.arrival_buffer_minutes ?? 0;
        const deliveryDeadline = new Date(nearestStop.delivery_time);
        let slackMinutes: number | undefined;
        let timeWindowBreach = false;
        if (!isNaN(deliveryDeadline.getTime())) {
          const deadlineMs = deliveryDeadline.getTime() - buffer * 60000;
          slackMinutes = Math.round((deadlineMs - arrivalTime.getTime()) / 60000);
          timeWindowBreach = slackMinutes < 0;
        }

        // Add stop to optimised route with predicted arrival info
        optimizedStops.push({
          ...nearestStop,
          predicted_arrival_at: arrivalTime.toISOString(),
          time_window_breach: timeWindowBreach,
          slack_minutes: slackMinutes,
        });

        // Update current time and position (travel + 15 min service)
        currentTime = new Date(arrivalTime.getTime() + 15 * 60000);
        currentLat = nearestStop.venue_lat;
        currentLng = nearestStop.venue_lng;

        // Remove from unvisited
        unvisited.splice(nearestIndex, 1);
      }
    }

    // Phase 2 #10: 2-opt improvement pass. Greedy nearest-neighbour
    // routinely produces routes with crossing edges (the classic NN
    // weakness). 2-opt walks every pair of non-adjacent edges and
    // reverses the sub-tour between them when the swap cuts total
    // cost (distance + a heavy time-window penalty). Repeats until
    // no improving swap exists. Cost function:
    //   cost = sum(distance_km) + INFEASIBILITY_PENALTY * breaches
    // The penalty (10000 km) means the optimiser will gladly take a
    // dramatically longer drive to remove a single time-window
    // breach - which is exactly what we want for catering. Skipped
    // when fewer than 4 stops because there's nothing to swap.
    let bestStops = optimizedStops;
    if (optimizedStops.length >= 4) {
      bestStops = this._twoOptImprove(
        optimizedStops,
        startLat ?? optimizedStops[0].venue_lat,
        startLng ?? optimizedStops[0].venue_lng,
      );
    }

    // Recompute the journey totals against the (possibly reordered)
    // sequence so the response numbers match the actual stop order.
    let recomputedDistance = 0;
    let recomputedDuration = 0;
    // RP-B (RP-2): mirror the anchor used by the nearest-neighbour
    // pass so the recompute pass produces consistent timestamps.
    let cursorTime = _routeStartFromStops(bestStops);
    let cursorLat = startLat ?? bestStops[0].venue_lat;
    let cursorLng = startLng ?? bestStops[0].venue_lng;
    let recomputedInfeasible = 0;
    const finalStops: DeliveryStop[] = bestStops.map((s) => {
      const leg = this.calculateDistance(cursorLat, cursorLng, s.venue_lat, s.venue_lng);
      const travel = this.estimateTravelTime(leg);
      recomputedDistance += leg;
      recomputedDuration += travel;
      const arrival = new Date(cursorTime.getTime() + travel * 60_000);
      const buffer = s.arrival_buffer_minutes ?? 0;
      const deadline = new Date(s.delivery_time);
      let slack: number | undefined;
      let breach = false;
      if (!isNaN(deadline.getTime())) {
        slack = Math.round((deadline.getTime() - buffer * 60_000 - arrival.getTime()) / 60_000);
        breach = slack < 0;
      }
      if (breach) recomputedInfeasible += 1;
      cursorTime = new Date(arrival.getTime() + 15 * 60_000);
      cursorLat = s.venue_lat;
      cursorLng = s.venue_lng;
      return {
        ...s,
        predicted_arrival_at: arrival.toISOString(),
        time_window_breach: breach,
        slack_minutes: slack,
      };
    });

    return {
      driver_id: driverId,
      stops: finalStops,
      total_distance: Math.round(recomputedDistance * 100) / 100,
      total_duration: Math.round(recomputedDuration),
      estimated_completion: cursorTime.toISOString(),
      infeasible_count: recomputedInfeasible,
      feasible: recomputedInfeasible === 0,
    };
  },

  /**
   * Phase 2 #10: 2-opt local-search improvement on a sequenced route.
   * Returns the best-cost sequence found. Pure - doesn't mutate the
   * input array. Cost penalises time-window breaches heavily so the
   * solver prefers a longer feasible route over a shorter infeasible
   * one.
   *
   * Complexity: O(n^3) worst case (n^2 pairs * n cost evaluation),
   * which is fine for the realistic catering route size of < 30
   * stops. Caps at 200 outer iterations so we can't pathologically
   * loop on a flat-cost landscape.
   */
  _twoOptImprove(
    stops: DeliveryStop[],
    startLat: number,
    startLng: number,
  ): DeliveryStop[] {
    const INFEASIBILITY_PENALTY = 10_000;
    const SERVICE_MIN = 15;

    // RP-B (RP-2): anchor the 2-opt cost cursor at the earliest
    // deadline in the route minus a 90-minute lead, so swapping in a
    // later-deadline stop earlier in the sequence registers as a
    // breach in the cost function. Pre-RP-B `new Date()` made every
    // realistic tomorrow-route show zero breaches and 2-opt only
    // minimised raw distance.
    const _twoOptStartFromSeq = (xs: DeliveryStop[]): Date => {
      let earliest = Number.POSITIVE_INFINITY;
      for (const s of xs) {
        const d = new Date(s.delivery_time).getTime();
        if (!isNaN(d) && d < earliest) earliest = d;
      }
      if (!isFinite(earliest)) return new Date();
      return new Date(earliest - 90 * 60_000);
    };

    const routeCost = (seq: DeliveryStop[]): number => {
      let dist = 0;
      let breaches = 0;
      let lat = startLat;
      let lng = startLng;
      let cursor = _twoOptStartFromSeq(seq);
      for (const s of seq) {
        const leg = this.calculateDistance(lat, lng, s.venue_lat, s.venue_lng);
        dist += leg;
        const travel = this.estimateTravelTime(leg);
        const arrival = new Date(cursor.getTime() + travel * 60_000);
        const buffer = s.arrival_buffer_minutes ?? 0;
        const deadline = new Date(s.delivery_time);
        if (!isNaN(deadline.getTime())) {
          if (arrival.getTime() > deadline.getTime() - buffer * 60_000) breaches += 1;
        }
        cursor = new Date(arrival.getTime() + SERVICE_MIN * 60_000);
        lat = s.venue_lat;
        lng = s.venue_lng;
      }
      return dist + INFEASIBILITY_PENALTY * breaches;
    };

    let best = [...stops];
    let bestCost = routeCost(best);
    let improved = true;
    let outer = 0;
    while (improved && outer < 200) {
      improved = false;
      outer += 1;
      for (let i = 0; i < best.length - 1; i++) {
        for (let j = i + 1; j < best.length; j++) {
          // Reverse the slice [i, j] - classic 2-opt swap.
          const candidate = [
            ...best.slice(0, i),
            ...best.slice(i, j + 1).reverse(),
            ...best.slice(j + 1),
          ];
          const cost = routeCost(candidate);
          if (cost < bestCost - 1e-6) {
            best = candidate;
            bestCost = cost;
            improved = true;
          }
        }
      }
    }
    return best;
  },

  /**
   * Get all pending orders for a driver
   */
  async getDriverPendingOrders(driverId: string, companyId: string): Promise<DeliveryStop[]> {
    // Tenant scoping (driver portal restructure audit): every other
    // driver query filters on company_id; this one previously matched
    // only on the driver columns + status, so it leaned entirely on
    // RLS for isolation. Filter explicitly and refuse to run without
    // a tenant - defence in depth, and it keeps a driver profile that
    // somehow spans tenants from pulling another company's orders
    // onto the route board.
    if (!driverId || !companyId) return [];

    // This powers the driver's "Today's Routes" board, so it must use the
    // same bounded work window as the driver dashboard. The old query only
    // filtered by driver + status, which pulled every historical assigned
    // order into the route (including July jobs on an August route). Keep a
    // short look-back for post-event collections, and a 14-day forward window
    // for upcoming work. Use the tenant timezone so the boundary follows the
    // company's calendar rather than the operator's browser/UTC day.
    const { data: companyDateConfig, error: companyDateConfigError } = await supabase
      .from("companies")
      .select("timezone")
      .eq("id", companyId)
      .maybeSingle();
    if (companyDateConfigError) {
      console.warn("[routeOptimizationService] company timezone lookup failed; using default:", companyDateConfigError.message);
    }
    const timezone = companyDateConfig?.timezone || DEFAULT_TENANT_TIMEZONE;
    const today = new Date();
    const lowerDate = new Date(today);
    lowerDate.setDate(lowerDate.getDate() - 7);
    const upperDate = new Date(today);
    upperDate.setDate(upperDate.getDate() + 14);
    const lowerISO = toZonedISO(lowerDate, timezone);
    const upperISO = toZonedISO(upperDate, timezone);

    // Orders may have either `driver_id` (legacy), `assigned_driver_id`
    // (primary), or `secondary_driver_id` (supporting driver) populated.
    // Keep all three paths visible to the driver who is actually assigned.
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("company_id", companyId)
      .or(`assigned_driver_id.eq.${driverId},driver_id.eq.${driverId},secondary_driver_id.eq.${driverId}`)
      .in("status", ["confirmed", "preparing", "ready", "in_transit"])
      .gte("event_date", lowerISO)
      .lte("event_date", upperISO)
      .not("venue_lat", "is", null)
      .not("venue_lng", "is", null);

    if (error) {
      console.error("Error fetching driver orders:", error);
      return [];
    }

    return ((data as any[]) || []).map((order) => {
      // Bug fix: when delivery_time is NULL the previous fallback was
      // order.event_date alone - a bare "2026-05-21" - which the UI's
      // new Date(...).toLocaleTimeString() rendered as "2:00:00 AM"
      // (UTC midnight in SAST). Mirror the same logic as
      // getUnassignedOrders below: prefer the real delivery_time,
      // else combine event_date + event_time, else event_date noon.
      let deliveryTime = order.delivery_time;
      if (!deliveryTime && order.event_date) {
        deliveryTime = order.event_time
          ? `${order.event_date}T${order.event_time}`
          : `${order.event_date}T12:00`;
      }
      return {
        id: order.id,
        order_id: order.id,
        client_name: order.client_name,
        event_date: order.event_date ?? null,
        event_time: order.event_time ?? null,
        region_id: order.region_id ?? null,
        requires_refrigeration: !!order.requires_refrigeration,
        venue_address: order.venue_address,
        venue_lat: order.venue_lat,
        venue_lng: order.venue_lng,
        delivery_time: deliveryTime,
        pickup_time: order.pickup_time ?? null,
        priority: order.priority || 2,
        status: order.status,
      };
    });
  },

  /**
   * Get all unassigned orders that need routing
   */
  async getUnassignedOrders(companyId: string): Promise<DeliveryStop[]> {
    // An order is unassigned only when both legacy `driver_id` and the
    // canonical `assigned_driver_id` are empty.
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("company_id", companyId)
      .is("driver_id", null)
      .is("assigned_driver_id", null)
      .in("status", ["confirmed", "preparing", "ready"])
      .gte("event_date", today)
      .not("venue_lat", "is", null)
      .not("venue_lng", "is", null);

    if (error) {
      console.error("Error fetching unassigned orders:", error);
      throw error;
    }

    // Pull the arrival buffer from dispatch_settings so each stop carries it
    // through the optimiser. Falls back to 30 minutes when unset.
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("dispatch_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (companyErr) console.error("[routeOptimizationService] companies dispatch_settings lookup failed:", companyErr);
    const arrivalBufferMinutes = Number(
      (company as any)?.dispatch_settings?.arrival_buffer_minutes ?? 30,
    );

    return ((data as any[]) || []).map((order) => {
      // Build a proper deadline. Prefer event_date + event_time when both exist,
      // fall back to delivery_time, then event_date noon.
      let deliveryTime = order.delivery_time;
      if (!deliveryTime && order.event_date) {
        deliveryTime = order.event_time
          ? `${order.event_date}T${order.event_time}`
          : `${order.event_date}T12:00`;
      }
      return {
        id: order.id,
        order_id: order.id,
        client_name: order.client_name,
        event_date: order.event_date ?? null,
        event_time: order.event_time ?? null,
        region_id: order.region_id ?? null,
        requires_refrigeration: !!order.requires_refrigeration,
        venue_address: order.venue_address,
        venue_lat: order.venue_lat,
        venue_lng: order.venue_lng,
        delivery_time: deliveryTime,
        pickup_time: order.pickup_time ?? null,
        priority: order.priority || 2,
        status: order.status,
        arrival_buffer_minutes: arrivalBufferMinutes,
      };
    });
  },

  /**
   * Optimize routes for all available drivers
   * Distributes orders evenly and optimizes each driver's route
   *
   * RP-B (route-planning audit, RP-1): pre-RP-B this queried
   * `profiles.available` + `profiles.current_lat/current_lng` which do
   * not exist on the table. The select silently errored, the catch
   * block toasted "No available drivers found", and the page's primary
   * CTA ("Optimise routes") was DOA - it had never produced output.
   * Now: GPS is sourced from `driver_locations` (the canonical single-
   * row-per-driver table dispatchService.ts already uses), driver-
   * activity is gated on `profiles.is_active`, and missing GPS is
   * tolerated (drivers without a recent ping are still included; the
   * optimiser falls back to the first stop's location as the anchor).
   */
  async optimizeAllDriverRoutes(companyId: string): Promise<OptimizedRoute[]> {
    // Active drivers on the company. is_active is the live flag;
    // missing values are treated as active to match the page's own
    // loadDispatchData filter.
    const { data: driverRows, error: driverError } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("company_id", companyId)
      .eq("role", "driver")
      .is("deleted_at", null);

    if (driverError || !driverRows || driverRows.length === 0) {
      console.error("[routeOptimizationService] no drivers found:", driverError);
      return [];
    }

    const drivers = (driverRows as any[]).filter(
      (d) => d.is_active === null || d.is_active === undefined || d.is_active === true,
    );
    if (drivers.length === 0) return [];

    // Current GPS coordinates from the canonical driver_locations
    // table. Drivers without a ping fall back to the first stop's
    // location at optimiseRoute time, so they still get routed.
    const driverIds = drivers.map((d) => d.id);
    const { data: gpsRows } = await (supabase as any)
      .from("driver_locations")
      .select("driver_id, latitude, longitude")
      .in("driver_id", driverIds);
    const gpsByDriver: Record<string, { lat: number; lng: number }> = {};
    for (const row of ((gpsRows as any[]) || [])) {
      if (typeof row.latitude === "number" && typeof row.longitude === "number") {
        gpsByDriver[row.driver_id] = { lat: row.latitude, lng: row.longitude };
      }
    }

    // Get all orders that need delivery
    const orders = await this.getUnassignedOrders(companyId);
    const driverOrders: Map<string, DeliveryStop[]> = new Map();

    // Initialize empty arrays for each driver
    drivers.forEach((driver) => {
      driverOrders.set(driver.id, []);
    });

    // Simple distribution: assign orders to nearest driver with a
    // known GPS ping; drivers without a ping share the remainder
    // round-robin so they aren't starved of work.
    let roundRobinCursor = 0;
    orders.forEach((order) => {
      let nearestDriver = drivers[0];
      let nearestDistance = Infinity;
      let foundGpsMatch = false;

      drivers.forEach((driver) => {
        const gps = gpsByDriver[driver.id];
        if (!gps) return;
        const distance = this.calculateDistance(
          gps.lat,
          gps.lng,
          order.venue_lat,
          order.venue_lng,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestDriver = driver;
          foundGpsMatch = true;
        }
      });

      if (!foundGpsMatch) {
        nearestDriver = drivers[roundRobinCursor % drivers.length];
        roundRobinCursor += 1;
      }

      driverOrders.get(nearestDriver.id)?.push(order);
    });

    // Optimize route for each driver
    const optimizedRoutes: OptimizedRoute[] = [];
    for (const driver of drivers) {
      const stops = driverOrders.get(driver.id) || [];
      if (stops.length > 0) {
        const gps = gpsByDriver[driver.id];
        const route = await this.optimizeRoute(
          driver.id,
          stops,
          gps?.lat,
          gps?.lng,
        );
        if (route) {
          optimizedRoutes.push(route);
        }
      }
    }

    return optimizedRoutes;
  },

  /**
   * Save optimized route to database
   */
  async saveOptimizedRoute(route: OptimizedRoute): Promise<boolean> {
    let createdRouteId: string | null = null;
    try {
      const orderIds = Array.from(new Set(route.stops.map((stop) => stop.order_id).filter(Boolean)));
      if (orderIds.length === 0) throw new Error("Route has no order stops.");

      const { data: orderRows, error: orderErr } = await (supabase as any)
        .from("orders")
        .select("id, company_id, assigned_driver_id, driver_id, event_date")
        .in("id", orderIds);
      if (orderErr) throw orderErr;

      const ordersById = new Map<string, any>();
      for (const row of ((orderRows as any[]) || [])) ordersById.set(row.id, row);
      const missing = orderIds.filter((id) => !ordersById.has(id));
      if (missing.length > 0) throw new Error(`Route contains ${missing.length} order that no longer exists.`);

      const companyId = (orderRows as any[])?.[0]?.company_id;
      if (!companyId) throw new Error("Could not resolve company for route.");
      if (((orderRows as any[]) || []).some((row) => row.company_id !== companyId)) {
        throw new Error("Route contains orders from more than one company.");
      }

      const conflicts = ((orderRows as any[]) || []).filter((row) => {
        const assigned = row.assigned_driver_id || row.driver_id;
        return assigned && assigned !== route.driver_id;
      });
      if (conflicts.length > 0) {
        throw new Error(`${conflicts.length} stop${conflicts.length === 1 ? "" : "s"} were assigned by someone else. Refresh route planning.`);
      }

      const routeDate =
        route.stops
          .map((stop) => stop.event_date || stop.delivery_time?.slice(0, 10) || ordersById.get(stop.order_id)?.event_date)
          .filter(Boolean)
          .sort()[0] || new Date().toISOString().slice(0, 10);

      const { error: deleteErr } = await (supabase as any)
        .from("delivery_routes")
        .delete()
        .eq("company_id", companyId)
        .eq("driver_id", route.driver_id)
        .eq("route_date", routeDate)
        .eq("status", "planned");
      if (deleteErr) throw deleteErr;

      const { data: createdRoute, error: routeErr } = await (supabase as any)
        .from("delivery_routes")
        .insert({
          company_id: companyId,
          driver_id: route.driver_id,
          route_date: routeDate,
          status: "planned",
          total_distance: route.total_distance,
          estimated_duration: route.total_duration,
        })
        .select("id")
        .single();
      if (routeErr) throw routeErr;
      createdRouteId = createdRoute?.id || null;
      if (!createdRouteId) throw new Error("Route was not created.");

      const { error: stopsErr } = await (supabase as any)
        .from("delivery_route_stops")
        .insert(route.stops.map((stop, index) => ({
          route_id: createdRouteId,
          order_id: stop.order_id,
          driver_id: route.driver_id,
          stop_type: "delivery",
          stop_name: stop.client_name,
          stop_address: stop.venue_address,
          stop_lat: stop.venue_lat,
          stop_lng: stop.venue_lng,
          latitude: stop.venue_lat,
          longitude: stop.venue_lng,
          sequence_number: index + 1,
          estimated_arrival_time: stop.predicted_arrival_at || stop.delivery_time || null,
          status: "pending",
          reason: stop.time_window_breach
            ? `Predicted ${Math.abs(stop.slack_minutes || 0)}m late`
            : null,
        })));
      if (stopsErr) throw stopsErr;

      // Update orders in one statement. Stop order lives on
      // delivery_route_stops.sequence_number; the order row only needs
      // the driver and "route optimised" flag.
      const { error: updateErr } = await (supabase as any)
        .from("orders")
        .update({
          driver_id: route.driver_id,
          assigned_driver_id: route.driver_id,
          assigned_at: new Date().toISOString(),
          delivery_route_optimized: true,
        })
        .in("id", orderIds);
      if (updateErr) throw updateErr;

      // Trigger automated real-time notification to the driver. The
      // routes page surfaces all stops; we don't have a single
      // related_entity_id since a route covers many orders - leave
      // it null and let the bell render the generic "Open" button
      // pointed at /team-portal/driver/routes.
      await notificationService.createNotification({
        recipient_id: route.driver_id,
        notification_type: "route_assigned",
        title: "New route assigned",
        message: `You have a new optimized route with ${route.stops.length} stops (${route.total_distance.toFixed(1)} km). Tap here to view.`,
        link: "/team-portal/driver/routes",
        priority: "high",
        target_role: UserRole.DRIVER
      });

      return true;
    } catch (error) {
      console.error("Error saving optimized route:", error);
      if (createdRouteId) {
        try {
          await (supabase as any).from("delivery_routes").delete().eq("id", createdRouteId);
        } catch (cleanupError) {
          console.error("Error cleaning up failed route:", cleanupError);
        }
      }
      return false;
    }
  },

  /**
   * Get optimized route for a specific driver.
   * companyId is required - the pending-orders read is tenant scoped
   * (see getDriverPendingOrders). Returns null when either id is
   * missing rather than running an unscoped query.
   */
  async getDriverOptimizedRoute(driverId: string, companyId: string): Promise<OptimizedRoute | null> {
    if (!driverId || !companyId) return null;
    const stops = await this.getDriverPendingOrders(driverId, companyId);

    if (stops.length === 0) {
      return null;
    }

    // A driver can have several upcoming assignments, but one route board
    // must never optimise stops from different event days together. Pick the
    // earliest active day (today when there is work today, otherwise the next
    // upcoming day) and leave later days for their own route run. This also
    // keeps the route title "Today's Routes" truthful when the dashboard is
    // opened ahead of tomorrow's event.
    const routeDate = stops
      .map((stop) => stop.event_date?.slice(0, 10))
      .filter((date): date is string => Boolean(date))
      .sort()[0];
    const routeStops = routeDate
      ? stops.filter((stop) => stop.event_date?.slice(0, 10) === routeDate)
      : stops;

    // RP-B (route-planning audit, RP-1): GPS coordinates come from
    // driver_locations (single-row-per-driver table) not profiles.
    // Pre-RP-B this selected `current_lat/current_lng` from profiles,
    // which don't exist - the query errored, the catch logged it, and
    // every per-driver route fell back to "start at first stop".
    const { data: gpsRow, error: driverErr } = await (supabase as any)
      .from("driver_locations")
      .select("latitude, longitude")
      .eq("driver_id", driverId)
      .maybeSingle();
    if (driverErr) console.error("[routeOptimizationService] driver_locations lookup failed:", driverErr);

    return this.optimizeRoute(
      driverId,
      routeStops,
      gpsRow?.latitude,
      gpsRow?.longitude
    );
  },

  /**
   * Calculate route statistics
   */
  calculateRouteStats(
    route: OptimizedRoute,
    opts?: { fuelCostPerLiter?: number; consumptionPer100km?: number },
  ): {
    totalStops: number;
    avgDistanceBetweenStops: number;
    estimatedFuelCost: number;
    carbonFootprint: number;
  } {
    const totalStops = route.stops.length;
    const avgDistance = route.total_distance / Math.max(totalStops - 1, 1);

    // Defaults reflect ZA market reality (May 2026): inland petrol
    // ~R23/L, light commercial vehicle averaging 8 L/100km. Pass
    // overrides via opts when the tenant currency is not ZAR or the
    // fleet has known consumption figures.
    const fuelConsumptionPer100km = opts?.consumptionPer100km ?? 8;
    const fuelCostPerLiter = opts?.fuelCostPerLiter ?? 23;
    const estimatedFuelCost = (route.total_distance / 100) * fuelConsumptionPer100km * fuelCostPerLiter;
    
    // Carbon footprint (kg CO2)
    const carbonFootprint = route.total_distance * 0.12; // 120g CO2 per km

    return {
      totalStops,
      avgDistanceBetweenStops: Math.round(avgDistance * 100) / 100,
      estimatedFuelCost: Math.round(estimatedFuelCost * 100) / 100,
      carbonFootprint: Math.round(carbonFootprint * 100) / 100,
    };
  },
};
