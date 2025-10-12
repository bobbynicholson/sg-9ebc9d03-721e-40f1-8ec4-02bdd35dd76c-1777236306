import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Navigation, AlertCircle, CheckCircle, MapPin } from "lucide-react";
import { driverService } from "@/services/driverService";
import { format } from "date-fns";

interface DriverDepartureCalculatorProps {
  assignmentId: string;
  onStartTrip?: () => void;
}

export function DriverDepartureCalculator({
  assignmentId,
  onStartTrip,
}: DriverDepartureCalculatorProps) {
  const [departureTimes, setDepartureTimes] = useState<{
    leaveForKitchenTime: string;
    leaveForVenueTime: string;
    collectionTime: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tripStarted, setTripStarted] = useState(false);

  useEffect(() => {
    loadDepartureTimes();
  }, [assignmentId]);

  const loadDepartureTimes = async () => {
    setLoading(true);
    const times = await driverService.calculateDepartureTimes(assignmentId);
    setDepartureTimes(times);
    setLoading(false);
  };

  const handleStartTrip = async () => {
    try {
      await driverService.startTripToKitchen(assignmentId);
      setTripStarted(true);
      if (onStartTrip) {
        onStartTrip();
      }
    } catch (error) {
      console.error("Error starting trip:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading departure times...</p>
        </CardContent>
      </Card>
    );
  }

  if (!departureTimes) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Unable to calculate departure times
          </p>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const leaveForKitchen = new Date(departureTimes.leaveForKitchenTime);
  const collectionTime = new Date(departureTimes.collectionTime);
  const leaveForVenue = new Date(departureTimes.leaveForVenueTime);

  const isTimeToLeave = now >= leaveForKitchen;
  const minutesUntilDeparture = Math.ceil((leaveForKitchen.getTime() - now.getTime()) / 60000);

  return (
    <Card className={isTimeToLeave ? "border-orange-500 border-2 animate-pulse" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Departure Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Time to Leave for Kitchen */}
        <div className={`p-4 rounded-lg border-2 ${
          isTimeToLeave 
            ? "bg-orange-50 border-orange-500" 
            : "bg-blue-50 border-blue-200"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Navigation className={`w-5 h-5 ${isTimeToLeave ? "text-orange-600" : "text-blue-600"}`} />
              <h4 className="font-semibold">Leave for Kitchen</h4>
            </div>
            {isTimeToLeave && (
              <Badge className="bg-orange-600 text-white animate-pulse">
                TIME TO GO!
              </Badge>
            )}
          </div>
          <p className="text-2xl font-bold mb-1">
            {format(leaveForKitchen, "HH:mm")}
          </p>
          <p className="text-sm text-muted-foreground">
            {minutesUntilDeparture > 0 
              ? `In ${minutesUntilDeparture} minutes`
              : "Depart now or overdue"}
          </p>
        </div>

        {/* Collection Time */}
        <div className="p-4 rounded-lg border bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold">Collect Food</h4>
          </div>
          <p className="text-lg font-bold mb-1">
            {format(collectionTime, "HH:mm")}
          </p>
          <p className="text-sm text-muted-foreground">
            Be ready to collect from kitchen
          </p>
        </div>

        {/* Leave for Venue */}
        <div className="p-4 rounded-lg border bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold">Leave for Venue</h4>
          </div>
          <p className="text-lg font-bold mb-1">
            {format(leaveForVenue, "HH:mm")}
          </p>
          <p className="text-sm text-muted-foreground">
            Depart from kitchen to venue
          </p>
        </div>

        {/* Start Trip Button */}
        {!tripStarted ? (
          <Button
            onClick={handleStartTrip}
            className={`w-full ${
              isTimeToLeave
                ? "bg-orange-600 hover:bg-orange-700 animate-pulse"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            size="lg"
          >
            <Navigation className="w-5 h-5 mr-2" />
            {isTimeToLeave ? "I'm On the Way to Kitchen!" : "Start Trip to Kitchen"}
          </Button>
        ) : (
          <div className="p-4 bg-green-50 border-2 border-green-500 rounded-lg text-center">
            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="font-semibold text-green-900">Trip Started!</p>
            <p className="text-sm text-green-700 mt-1">
              Admin has been notified. Drive safely!
            </p>
          </div>
        )}

        {/* Helpful Tips */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <p className="font-semibold mb-1">Important:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>15-minute buffer included before collection</li>
                <li>Arrival 15 minutes early recommended</li>
                <li>GPS tracking activates when you start trip</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
