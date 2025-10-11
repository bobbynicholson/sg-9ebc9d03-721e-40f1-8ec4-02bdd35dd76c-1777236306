export interface DriverLocation {
  id: string;
  driverId: string;
  driverName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speed?: number;
  heading?: number;
}

export interface DeliveryStatus {
  id: string;
  orderId: string;
  status: "pending" | "collected" | "in_transit" | "arrived" | "delivered" | "completed";
  timestamp: string;
  location?: DriverLocation;
  notes?: string;
}

export interface TrackingSession {
  id: string;
  orderId: string;
  driverId: string;
  driverName: string;
  clientName: string;
  clientEmail: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupTime: string;
  deliveryTime: string;
  status: DeliveryStatus["status"];
  startedAt?: string;
  collectedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  currentLocation?: DriverLocation;
  route?: DriverLocation[];
}

export interface Notification {
  id: string;
  type: "driver_logged_in" | "food_collected" | "driver_arrived" | "delivery_complete" | "review_request";
  recipientEmail: string;
  recipientName: string;
  message: string;
  timestamp: string;
  read: boolean;
  orderId: string;
}

export interface GPSLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  speed?: number;
  altitude?: number;
  heading?: number;
}
