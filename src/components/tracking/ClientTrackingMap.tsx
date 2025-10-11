import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, User, Truck } from "lucide-react";
import { TrackingSession, DriverLocation } from "@/types/tracking";

interface ClientTrackingMapProps {
  orderId: string;
}

export function ClientTrackingMap({ orderId }: ClientTrackingMapProps) {
  const [trackingData, setTrackingData] = useState<TrackingSession | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const fetchTrackingData = () => {
      const data = localStorage.getItem(`tracking_${orderId}`);
      if (data) {
        const parsed = JSON.parse(data);
        setTrackingData(parsed);
        setLastUpdate(new Date());
      }
    };

    fetchTrackingData();
    const interval = setInterval(fetchTrackingData, 5000);

    return () => clearInterval(interval);
  }, [orderId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "collected":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "in_transit":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "arrived":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "delivered":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case "collected":
        return "Driver has collected your order";
      case "in_transit":
        return "Driver is on the way";
      case "arrived":
        return "Driver has arrived at your venue";
      case "delivered":
        return "Order delivered successfully";
      default:
        return "Waiting for driver";
    }
  };

  if (!trackingData) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-12 text-center">
          <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No tracking data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Delivery Tracking</CardTitle>
            <Badge className={getStatusColor(trackingData.status)}>
              {trackingData.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-2">Current Status</p>
            <p className="font-medium text-slate-900">{getStatusMessage(trackingData.status)}</p>
          </div>

          {trackingData.currentLocation && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{trackingData.driverName}</p>
                  <p className="text-sm text-slate-600">Your driver</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-600 mb-1">Latitude</p>
                  <p className="text-sm font-mono text-slate-900">
                    {trackingData.currentLocation.latitude.toFixed(6)}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-600 mb-1">Longitude</p>
                  <p className="text-sm font-mono text-slate-900">
                    {trackingData.currentLocation.longitude.toFixed(6)}
                  </p>
                </div>
              </div>

              {trackingData.currentLocation.speed && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-slate-600" />
                    <div>
                      <p className="text-xs text-slate-600">Speed</p>
                      <p className="text-sm font-medium text-slate-900">
                        {(trackingData.currentLocation.speed * 3.6).toFixed(1)} km/h
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {lastUpdate && (
            <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t">
              <Clock className="w-3 h-3" />
              <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
        <CardHeader>
          <CardTitle className="text-lg">Delivery Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`flex items-center gap-3 ${trackingData.collectedAt ? "opacity-100" : "opacity-50"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              trackingData.collectedAt ? "bg-green-600" : "bg-slate-300"
            }`}>
              {trackingData.collectedAt ? (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-white text-sm">1</span>
              )}
            </div>
            <div>
              <p className="font-medium text-slate-900">Food Collected</p>
              {trackingData.collectedAt && (
                <p className="text-xs text-slate-600">
                  {new Date(trackingData.collectedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          <div className={`flex items-center gap-3 ${trackingData.status === "in_transit" || trackingData.deliveredAt ? "opacity-100" : "opacity-50"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              trackingData.status === "in_transit" || trackingData.deliveredAt ? "bg-green-600" : "bg-slate-300"
            }`}>
              {trackingData.status === "in_transit" || trackingData.deliveredAt ? (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-white text-sm">2</span>
              )}
            </div>
            <div>
              <p className="font-medium text-slate-900">En Route</p>
              {trackingData.status === "in_transit" && (
                <p className="text-xs text-slate-600">In progress</p>
              )}
            </div>
          </div>

          <div className={`flex items-center gap-3 ${trackingData.deliveredAt ? "opacity-100" : "opacity-50"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              trackingData.deliveredAt ? "bg-green-600" : "bg-slate-300"
            }`}>
              {trackingData.deliveredAt ? (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-white text-sm">3</span>
              )}
            </div>
            <div>
              <p className="font-medium text-slate-900">Delivered</p>
              {trackingData.deliveredAt && (
                <p className="text-xs text-slate-600">
                  {new Date(trackingData.deliveredAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
