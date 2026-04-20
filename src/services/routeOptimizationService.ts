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
}

export interface OptimizedRoute {
  driver_id: string;
  driver_name?: string;
  stops: DeliveryStop[];
  total_distance: number;
  total_duration: number;
  estimated_completion: string;
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
        // Add stop to optimized route
        optimizedStops.push(nearestStop);
        totalDistance += nearestDistance;

        // Estimate travel time
        const travelTime = this.estimateTravelTime(nearestDistance);
        totalDuration += travelTime;

        // Update current time (travel time + 15 min stop time)
        currentTime = new Date(currentTime.getTime() + (travelTime + 15) * 60000);

        // Update current position
        currentLat = nearestStop.venue_lat;
        currentLng = nearestStop.venue_lng;

        // Remove from unvisited
        unvisited.splice(nearestIndex, 1);
      }
    }

    // Calculate estimated completion time
    const estimatedCompletion = currentTime.toISOString();

    return {
      driver_id: driverId,
      stops: optimizedStops,
      total_distance: Math.round(totalDistance * 100) / 100,
      total_duration: Math.round(totalDuration),
      estimated_completion: estimatedCompletion,
    };
  },

  /**
   * Get all pending orders for a driver
   */
  async getDriverPendingOrders(driverId: string): Promise<DeliveryStop[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("driver_id", driverId)
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
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("company_id", companyId)
      .is("driver_id", null)
      .in("status", ["confirmed", "preparing", "ready"])
      .not("venue_lat", "is", null)
      .not("venue_lng", "is", null);

    if (error) {
      console.error("Error fetching unassigned orders:", error);
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

      // Update orders with driver and sequence
      for (let i = 0; i < route.stops.length; i++) {
        const stop = route.stops[i];
        await supabase
          .from("orders")
          .update({
            driver_id: route.driver_id,
            delivery_sequence: i + 1,
          })
          .eq("id", stop.order_id);
      }

      // Trigger automated real-time notification to the driver
      await notificationService.createNotification({
        recipient_id: route.driver_id,
        type: "route_assigned",
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