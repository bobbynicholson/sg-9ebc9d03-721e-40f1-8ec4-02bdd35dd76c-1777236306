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

// Default export for convenience
export default {
  routes: routeOps,
  deliveries: deliveryOps,
  gps: gpsOps,
};