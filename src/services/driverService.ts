/**
 * Driver Service - Main Export Module
 * 
 * This service has been refactored into focused modules:
 * - routeManagement.ts - Route creation, optimization, stop management
 * - deliveryManagement.ts - Delivery status updates, confirmations
 * - gpsTracking.ts - Real-time location tracking and ETA calculations
 * 
 * Legacy file maintained for backward compatibility.
 * New code should import from specific modules.
 */

import * as routeOps from "./driver/routeManagement";
import * as deliveryOps from "./driver/deliveryManagement";
import * as gpsOps from "./driver/gpsTracking";
import { supabase } from "@/integrations/supabase/client";

// Re-export all functions for backward compatibility
export const {
  createDeliveryRoute,
  getDriverRoutes,
  updateStopStatus,
  optimizeRoute,
} = routeOps;

export const {
  updateDeliveryStatus,
  confirmDelivery,
  getDriverDeliveries,
  markOrderPickedUp,
} = deliveryOps;

export const {
  updateDriverLocation,
  getDriverLocation,
  getLocationHistory,
  calculateETA,
} = gpsOps;

// Export types
export type {
  RouteStop,
  DeliveryRoute,
} from "./driver/routeManagement";

export type {
  DeliveryUpdate,
} from "./driver/deliveryManagement";

export type {
  GPSLocation,
} from "./driver/gpsTracking";

const calculateDepartureTimes = async (assignmentId: string) => {
  return {
    leaveForKitchenTime: new Date(Date.now() + 10 * 60000).toISOString(),
    collectionTime: new Date(Date.now() + 25 * 60000).toISOString(),
    leaveForVenueTime: new Date(Date.now() + 30 * 60000).toISOString()
  };
};

const startTripToKitchen = async (assignmentId: string) => {
  return { success: true };
};

const trackGPS = async (driverId: string, orderId: string, assignmentId: string, location: any) => {
  return gpsOps.updateDriverLocation(driverId, location);
};

const notifyDriverOfRouteAssignment = async (driverId: string, details: any) => {
  return { success: true };
};

const getAllDrivers = async (companyId: string) => {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('company_id', companyId)
    .eq('role', 'driver');
  return data || [];
};

const startJob = async (orderId: string, driverId?: string) => {
  // Resolve the calling driver if the caller didn't pass one. Without a
  // driverId the underlying update would fail because deliveryManagement
  // scopes the write by `assigned_driver_id`.
  let resolvedDriverId = driverId;
  if (!resolvedDriverId) {
    const { data } = await supabase.auth.getUser();
    resolvedDriverId = data.user?.id ?? '';
  }
  return deliveryOps.updateDeliveryStatus(orderId, 'in_transit', resolvedDriverId);
};

const completeJob = async (orderId: string, driverId?: string) => {
  let resolvedDriverId = driverId;
  if (!resolvedDriverId) {
    const { data } = await supabase.auth.getUser();
    resolvedDriverId = data.user?.id ?? '';
  }
  return deliveryOps.updateDeliveryStatus(orderId, 'delivered', resolvedDriverId);
};

// Default export for convenience
export default {
  routes: routeOps,
  deliveries: deliveryOps,
  gps: gpsOps,
  calculateDepartureTimes,
  startTripToKitchen,
  trackGPS,
  notifyDriverOfRouteAssignment,
  getAllDrivers,
  startJob,
  completeJob
};