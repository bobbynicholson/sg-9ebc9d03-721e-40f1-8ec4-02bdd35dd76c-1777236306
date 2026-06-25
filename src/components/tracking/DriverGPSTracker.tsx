import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, CheckCircle } from "lucide-react";
import { DriverLocation, DeliveryStatus } from "@/types/tracking";
import driverService from "@/services/driverService";
import { proximityService } from "@/services/proximityService";

interface DriverGPSTrackerProps {
  orderId: string;
  assignmentId: string;
  driverId: string;
  driverName: string;
  onStatusChange?: (status: DeliveryStatus) => void;
}

export function DriverGPSTracker({ 
  orderId,
  assignmentId,
  driverId, 
  driverName,
  onStatusChange 
}: DriverGPSTrackerProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<DriverLocation | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus["status"]>("pending");
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (isTracking && "geolocation" in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const location: DriverLocation = {
            id: `loc_${Date.now()}`,
            driverId,
            driverName,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().toISOString(),
            speed: position.coords.speed || undefined,
            heading: position.coords.heading || undefined,
          };

          setCurrentLocation(location);

          // Track GPS in database
          try {
            await driverService.trackGPS(
              driverId,
              orderId,
              assignmentId,
              {
                latitude: location.latitude,
                longitude: location.longitude,
                speed: location.speed,
                heading: location.heading,
              }
            );

            // Check proximity and send automatic notifications
            await proximityService.checkProximityAndNotify(
              assignmentId,
              location.latitude,
              location.longitude
            );
          } catch (error) {
            console.error("Error tracking GPS:", error);
          }

          // Store in localStorage as backup
          const trackingData = JSON.parse(
            localStorage.getItem(`tracking_${orderId}`) || "{}"
          );
          const route = trackingData.route || [];
          route.push(location);

          localStorage.setItem(
            `tracking_${orderId}`,
            JSON.stringify({
              ...trackingData,
              currentLocation: location,
              route: route,
              lastUpdate: new Date().toISOString(),
            })
          );
        },
        (error) => {
          console.error("GPS Error:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTracking, orderId, assignmentId, driverId, driverName]);

  const handleStartTracking = () => {
    setIsTracking(true);
    updateStatus("collected");
    
    const notification = {
      type: "driver_logged_in",
      message: `${driverName} has logged in and started tracking`,
      timestamp: new Date().toISOString(),
    };
    
    const notifications = JSON.parse(localStorage.getItem("notifications") || "[]");
    notifications.push(notification);
    localStorage.setItem("notifications", JSON.stringify(notifications));
  };

  const updateStatus = (status: DeliveryStatus["status"]) => {
    setDeliveryStatus(status);
    
    const statusUpdate: DeliveryStatus = {
      id: `status_${Date.now()}`,
      orderId,
      status,
      timestamp: new Date().toISOString(),
      location: currentLocation || undefined,
    };

    if (onStatusChange) {
      onStatusChange(statusUpdate);
    }

    const trackingData = JSON.parse(
      localStorage.getItem(`tracking_${orderId}`) || "{}"
    );
    
    localStorage.setItem(
      `tracking_${orderId}`,
      JSON.stringify({
        ...trackingData,
        status,
        [`${status}At`]: new Date().toISOString(),
      })
    );

    const notification = {
      type: status === "collected" ? "food_collected" : 
            status === "arrived" ? "driver_arrived" : 
            status === "delivered" ? "delivery_complete" : "driver_logged_in",
      message: getStatusMessage(status),
      timestamp: new Date().toISOString(),
      orderId,
    };
    
    const notifications = JSON.parse(localStorage.getItem("notifications") || "[]");
    notifications.push(notification);
    localStorage.setItem("notifications", JSON.stringify(notifications));
  };

  const getStatusMessage = (status: DeliveryStatus["status"]) => {
    switch (status) {
      case "collected":
        return `${driverName} has collected the food`;
      case "in_transit":
        return `${driverName} is on the way to delivery`;
      case "arrived":
        return `${driverName} has arrived at the venue`;
      case "delivered":
        return "Food has been delivered successfully";
      case "completed":
        return "Delivery completed - ready for collection";
      default:
        return "Status updated";
    }
  };

  const getStatusColor = (status: DeliveryStatus["status"]) => {
    switch (status) {
      case "collected":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "in_transit":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "arrived":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "delivered":
        return "bg-brand-primary/15 text-brand-primary border-brand-primary/20";
      case "completed":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>GPS Tracking</span>
          {isTracking && (
            <Badge className="bg-brand-primary/15 text-brand-primary border-brand-primary/20">
              <MapPin className="w-3 h-3 mr-1 animate-pulse" />
              Tracking Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isTracking ? (
          <Button 
            onClick={handleStartTracking}
            className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary/90 hover:to-brand-secondary/90"
          >
            <Navigation className="w-4 h-4 mr-2" />
            Start GPS Tracking
          </Button>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Status:</span>
                <Badge className={getStatusColor(deliveryStatus)}>
                  {deliveryStatus.replace("_", " ").toUpperCase()}
                </Badge>
              </div>
              
              {currentLocation && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Latitude:</span>
                    <span className="font-mono text-slate-900">
                      {currentLocation.latitude.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Longitude:</span>
                    <span className="font-mono text-slate-900">
                      {currentLocation.longitude.toFixed(6)}
                    </span>
                  </div>
                  {currentLocation.speed && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Speed:</span>
                      <span className="font-mono text-slate-900">
                        {(currentLocation.speed * 3.6).toFixed(1)} km/h
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>
                      Last updated: {new Date(currentLocation.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-4 border-t">
              {deliveryStatus === "pending" && (
                <Button 
                  onClick={() => updateStatus("collected")}
                  className="col-span-2 bg-blue-600 hover:bg-blue-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Food Collected
                </Button>
              )}
              
              {deliveryStatus === "collected" && (
                <Button 
                  onClick={() => updateStatus("in_transit")}
                  className="col-span-2 bg-purple-600 hover:bg-purple-700"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  En Route
                </Button>
              )}
              
              {deliveryStatus === "in_transit" && (
                <Button 
                  onClick={() => updateStatus("arrived")}
                  className="col-span-2 bg-orange-600 hover:bg-orange-700"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Arrived at Venue
                </Button>
              )}
              
              {deliveryStatus === "arrived" && (
                <Button 
                  onClick={() => updateStatus("delivered")}
                  className="col-span-2 bg-brand-primary hover:bg-brand-primary/90"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Delivered
                </Button>
              )}
              
              {deliveryStatus === "delivered" && (
                <Button 
                  onClick={() => updateStatus("completed")}
                  variant="outline"
                  className="col-span-2"
                >
                  Mark as Complete
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
