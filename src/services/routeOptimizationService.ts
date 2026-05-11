/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { googleMapsService } from "./googleMapsService";
import { notificationService } from "./notificationService";
import { UserRole } from "@/types/app";

export interface DeliveryStop {
  id: string;
  order_id: string;
  client_name: string;
  venue_address: string;
  venue_lat: number;
  venue_lng: number;
  delivery_time: string;
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
    let currentTime = new Date();

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
    // breach -- which is exactly what we want for catering. Skipped
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
    let cursorTime = new Date();
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
   * Returns the best-cost sequence found. Pure -- doesn't mutate the
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

    const routeCost = (seq: DeliveryStop[]): number => {
      let dist = 0;
      let breaches = 0;
      let lat = startLat;
      let lng = startLng;
      let cursor = new Date();
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
          // Reverse the slice [i, j] -- classic 2-opt swap.
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
  async getDriverPendingOrders(driverId: string): Promise<DeliveryStop[]> {
    // Orders may have either `driver_id` (legacy) or `assigned_driver_id`
    // (current dispatch flow) populated, so we OR across both columns.
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .or(`assigned_driver_id.eq.${driverId},driver_id.eq.${driverId}`)
      .in("status", ["confirmed", "preparing", "ready", "out_for_delivery"])
      .not("venue_lat", "is", null)
      .not("venue_lng", "is", null);

    if (error) {
      console.error("Error fetching driver orders:", error);
      return [];
    }

    return ((data as any[]) || []).map((order) => ({
      id: order.id,
      order_id: order.id,
      client_name: order.client_name,
      venue_address: order.venue_address,
      venue_lat: order.venue_lat,
      venue_lng: order.venue_lng,
      delivery_time: order.delivery_time || order.event_date,
      priority: order.priority || 2,
      status: order.status,
    }));
  },

  /**
   * Get all unassigned orders that need routing
   */
  async getUnassignedOrders(companyId: string): Promise<DeliveryStop[]> {
    // An order is unassigned only when both legacy `driver_id` and the
    // canonical `assigned_driver_id` are empty.
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("company_id", companyId)
      .is("driver_id", null)
      .is("assigned_driver_id", null)
      .in("status", ["confirmed", "preparing", "ready"])
      .not("venue_lat", "is", null)
      .not("venue_lng", "is", null);

    if (error) {
      console.error("Error fetching unassigned orders:", error);
      return [];
    }

    // Pull the arrival buffer from dispatch_settings so each stop carries it
    // through the optimiser. Falls back to 30 minutes when unset.
    const { data: company } = await supabase
      .from("companies")
      .select("dispatch_settings")
      .eq("id", companyId)
      .maybeSingle();
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
        venue_address: order.venue_address,
        venue_lat: order.venue_lat,
        venue_lng: order.venue_lng,
        delivery_time: deliveryTime,
        priority: order.priority || 2,
        status: order.status,
        arrival_buffer_minutes: arrivalBufferMinutes,
      };
    });
  },

  /**
   * Optimize routes for all available drivers
   * Distributes orders evenly and optimizes each driver's route
   */
  async optimizeAllDriverRoutes(companyId: string): Promise<OptimizedRoute[]> {
    // Get all available drivers
    const { data: drivers, error: driverError } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, current_lat, current_lng")
      .eq("company_id", companyId)
      .eq("role", "driver")
      .eq("available", true);

    if (driverError || !drivers || drivers.length === 0) {
      console.error("No available drivers found");
      return [];
    }

    // Get all orders that need delivery
    const orders = await this.getUnassignedOrders(companyId);
    const driverOrders: Map<string, DeliveryStop[]> = new Map();

    // Initialize empty arrays for each driver
    drivers.forEach((driver) => {
      driverOrders.set(driver.id, []);
    });

    // Simple distribution: assign orders to nearest driver
    orders.forEach((order) => {
      let nearestDriver = drivers[0];
      let nearestDistance = Infinity;

      drivers.forEach((driver) => {
        if (driver.current_lat && driver.current_lng) {
          const distance = this.calculateDistance(
            driver.current_lat,
            driver.current_lng,
            order.venue_lat,
            order.venue_lng
          );

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestDriver = driver;
          }
        }
      });

      driverOrders.get(nearestDriver.id)?.push(order);
    });

    // Optimize route for each driver
    const optimizedRoutes: OptimizedRoute[] = [];
    for (const driver of drivers) {
      const stops = driverOrders.get(driver.id) || [];
      if (stops.length > 0) {
        const route = await this.optimizeRoute(
          driver.id,
          stops,
          driver.current_lat,
          driver.current_lng
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
    try {
      // Update driver assignments
      const updates = route.stops.map((stop, index) => ({
        order_id: stop.order_id,
        driver_id: route.driver_id,
        sequence: index + 1,
        estimated_arrival: new Date(
          Date.now() + index * 30 * 60000
        ).toISOString(), // Rough estimate
      }));

      // Update orders with driver and sequence. Write both `driver_id`
      // (legacy) and `assigned_driver_id` (canonical) so every consumer
      // sees the assignment regardless of which column they read.
      for (let i = 0; i < route.stops.length; i++) {
        const stop = route.stops[i];
        await supabase
          .from("orders")
          .update({
            driver_id: route.driver_id,
            assigned_driver_id: route.driver_id,
            delivery_sequence: i + 1,
          } as any)
          .eq("id", stop.order_id);
      }

      // Trigger automated real-time notification to the driver. The
      // routes page surfaces all stops; we don't have a single
      // related_entity_id since a route covers many orders -- leave
      // it null and let the bell render the generic "Open" button
      // pointed at /team-portal/driver/routes.
      await notificationService.createNotification({
        recipient_id: route.driver_id,
        notification_type: "route_assigned",
        title: "New Route Assigned 🗺️",
        message: `You have a new optimized route with ${route.stops.length} stops (${route.total_distance.toFixed(1)} km). Tap here to view.`,
        link: "/team-portal/driver/routes",
        priority: "high",
        target_role: UserRole.DRIVER
      });

      return true;
    } catch (error) {
      console.error("Error saving optimized route:", error);
      return false;
    }
  },

  /**
   * Get optimized route for a specific driver
   */
  async getDriverOptimizedRoute(driverId: string): Promise<OptimizedRoute | null> {
    const stops = await this.getDriverPendingOrders(driverId);
    
    if (stops.length === 0) {
      return null;
    }

    // Get driver's current location
    const { data: driver } = await (supabase as any)
      .from("profiles")
      .select("current_lat, current_lng")
      .eq("id", driverId)
      .single();

    return this.optimizeRoute(
      driverId,
      stops,
      driver?.current_lat,
      driver?.current_lng
    );
  },

  /**
   * Calculate route statistics
   */
  calculateRouteStats(route: OptimizedRoute): {
    totalStops: number;
    avgDistanceBetweenStops: number;
    estimatedFuelCost: number;
    carbonFootprint: number;
  } {
    const totalStops = route.stops.length;
    const avgDistance = route.total_distance / Math.max(totalStops - 1, 1);
    
    // Rough estimates
    const fuelConsumptionPer100km = 8; // liters
    const fuelCostPerLiter = 1.5; // currency units
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